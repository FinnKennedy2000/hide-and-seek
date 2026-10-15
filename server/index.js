'use strict';
// Static file server for public/ plus the multiplayer WebSocket endpoint (/ws) on one port.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..', 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// ----- tunables (HIDE_SECS / SEEK_SECS env overrides exist so tests don't wait 3 minutes)
const HIDE_SECS = Number(process.env.HIDE_SECS) || 30;
const SEEK_SECS = Number(process.env.SEEK_SECS) || 150;
const MAX_PLAYERS = 8, MIN_PLAYERS = 2;
const TICK_MS = 1000 / 15;
const TAG_RANGE = 3.5;
const MAX_MSG = 2048;
const MIN_POS_MS = 40;          // position updates faster than ~25Hz are dropped
const MAX_SPEED = 9;            // m/s; sprint is 6.8, the rest is slack for jitter. Faster moves are dropped (anti-teleport)
const COLORS = [0xff5a5f, 0x4cc9f0, 0xffd166, 0x80ed99, 0xc77dff, 0xff924c, 0x2ec4b6, 0xf15bb5, 0x3a86ff, 0xa7c957, 0xe9edc9, 0x8d5a3b];
// cosmetic enums: must match public/character.js (HATS / OUTFITS)
const HATS = ['none', 'cap', 'beanie', 'bucket', 'crown'];
const OUTFITS = ['plain', 'stripes', 'dots', 'overalls'];
const MODES = ['classic', 'prophunt'];
// prop hunt tunables
const MAG = 6, RESERVE0 = 12, HP0 = 100, MISS_DMG = 8, REFUND = MAG, PICKUP_SHOTS = 6; // a hit earns a whole extra mag
const FIRE_GAP = 0.25, RELOAD_S = 1.2, SHOT_RANGE = 60, ORIGIN_TOL = 1.5 + 6.8 * 0.3, PICKUP_RANGE = 2.5; // origin tolerance: 1.5m + sprint speed (6.8) x 0.3s of lag (~3.5m)
const DISGUISE_CD = 3, TAUNT_CD = 10, CD_SLACK = 0.15, DISGUISE_RANGE = 6;
let WORLDS = null; // mapId -> { colliders, props, meta, spawns, rayBox } from public/worlddata.js, built before listening
let MAPS = null;   // the map registry from public/worlddata.js
const worldOf = (room) => WORLDS[room.map];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// ======================================================================
// http
// ======================================================================
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method Not Allowed');
  }
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }
  if (rel.includes('\0')) {
    res.writeHead(400);
    return res.end('Bad Request');
  }
  if (rel === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(req.method === 'HEAD' ? undefined : 'ok');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + path.sep + path.normalize(rel));
  // reject traversal outside public/
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      if (err.code !== 'ENOENT') console.error('readFile', file, err);
      res.writeHead(404);
      return res.end('Not Found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

// ======================================================================
// helpers
// ======================================================================
const rooms = new Map();   // code -> room
let nextId = 1;
const now = () => Date.now() / 1000;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const r2 = (v) => Math.round(v * 100) / 100;
const cleanName = (n) => (typeof n === 'string' ? n.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 16) : '') || 'Player';

function send(p, obj) {
  const ws = p.ws;
  if (ws.readyState !== 1) return;
  ws.send(JSON.stringify(obj));
}
function broadcast(room, obj, except) {
  const s = JSON.stringify(obj);
  for (const p of room.players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
}
function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += LETTERS[(Math.random() * LETTERS.length) | 0];
    if (!rooms.has(c)) return c;
  }
}
const hidersOf = (room) => [...room.players.values()].filter((p) => p.role === 'hider');
const seekersOf = (room) => [...room.players.values()].filter((p) => p.role === 'seeker');

function sendRoom(room) {
  const list = [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, hat: p.hat, outfit: p.outfit, total: p.total }));
  for (const p of room.players.values()) send(p, { t: 'room', code: room.code, you: p.id, host: room.hostId, phase: room.phase, mode: room.mode, map: room.map, players: list });
}

// ======================================================================
// rooms and rounds
// ======================================================================
function joinRoom(p, room) {
  const used = new Set([...room.players.values()].map((q) => q.color));
  p.color = COLORS.find((c) => !used.has(c)) ?? COLORS[0];
  p.hat = 'none'; p.outfit = 'plain';
  p.room = room; p.role = null; p.score = 0; p.total = 0; p.tags = 0;
  room.players.set(p.id, p);
  if (!room.hostId) room.hostId = p.id;
  sendRoom(room);
}

function leaveRoom(p) {
  const room = p.room;
  if (!room) return;
  p.room = null; p.role = null;
  room.players.delete(p.id);
  if (!room.players.size) { rooms.delete(room.code); return; }
  if (room.hostId === p.id) room.hostId = room.players.keys().next().value;
  sendRoom(room);
  checkRound(room);
}

function startRound(room) {
  const ps = shuffle([...room.players.values()]);
  const nSeek = ps.length >= 6 ? 2 : 1;
  const W = worldOf(room), ss = W.meta.seekerStart;
  const spots = shuffle(W.spawns.slice());
  const spawns = [];
  ps.forEach((p, i) => {
    p.role = i < nSeek ? 'seeker' : 'hider';
    p.score = 0; p.tags = 0; p.lastTag = 0;
    Object.assign(p, { hp: HP0, mag: MAG, res: RESERVE0, out: false, shots: 0, hits: 0, disguise: null, tint: null, lastDisguise: 0, lastTaunt: 0, lastShot: 0, lastCamo: 0, reloadEnd: 0, tagT: 0, first: i < nSeek });
    if (p.role === 'seeker') { p.x = ss.x + (i - (nSeek - 1) / 2) * 1.4; p.z = ss.z; p.yaw = ss.yaw; }
    else { const [x, z] = spots[(i - nSeek) % spots.length]; p.x = x; p.z = z; p.yaw = Math.random() * Math.PI * 2; }
    p.y = 0; p.pitch = 0; p.c = 0;
    spawns.push({ id: p.id, x: p.x, z: p.z, yaw: r2(p.yaw) });
  });
  room.phase = 'hide';
  room.t0 = now(); room.phaseEnd = room.t0 + HIDE_SECS; room.pickup = null; room.pickupDone = false; room.pickupAt = 0;
  broadcast(room, { t: 'round', mode: room.mode, map: room.map, seekers: ps.slice(0, nSeek).map((p) => p.id), spawns, hide: HIDE_SECS, seek: SEEK_SECS });
  if (room.mode === 'prophunt') for (const p of ps.slice(0, nSeek)) sendAmmo(p);
}

function endRound(room, winner) {
  if (room.phase !== 'hide' && room.phase !== 'seek') return;
  for (const p of room.players.values()) {
    if (winner === 'hiders' && p.role === 'hider') p.score += 5;
    p.total += p.score;
  }
  const t = now();
  const players = [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, role: p.role, score: p.score, total: p.total, tags: p.tags, shots: p.shots, hits: p.hits, surv: p.first ? null : r2((p.role === 'hider' ? t : p.tagT) - room.t0) }))
    .sort((a, b) => b.score - a.score);
  room.phase = 'lobby';
  for (const p of room.players.values()) p.role = null;
  broadcast(room, { t: 'end', winner, mode: room.mode, players });
  sendRoom(room);
}

// end the round if the roster can no longer play it
function checkRound(room) {
  if (room.phase !== 'hide' && room.phase !== 'seek') return;
  if (!hidersOf(room).length) endRound(room, 'seekers');
  else if (!seekersOf(room).length) endRound(room, 'hiders');
  else if (room.mode === 'prophunt' && room.phase === 'seek' && seekersOf(room).every((p) => spent(room, p))) endRound(room, 'hiders');
}
// a seeker that can no longer shoot: out of health, or empty with no crate left to find
const spent = (room, p) => p.hp <= 0 || (p.mag + p.res <= 0 && room.pickupDone);
function sendAmmo(p) { send(p, { t: 'ammo', mag: p.mag, res: p.res, hp: p.hp, rl: p.reloadEnd ? 1 : 0 }); }
function hiderBox(room, h) { // server-side bounding volume: the prop's footprint when disguised, else a person
  const pr = h.disguise != null ? worldOf(room).props[h.disguise] : null;
  const r = pr ? Math.max(0.25, Math.max(pr.w, pr.d) / 2) : 0.35, ht = pr ? Math.max(0.4, pr.h) : 1.75 * (1 - 0.35 * h.c);
  return { x0: h.x - r, x1: h.x + r, z0: h.z - r, z1: h.z + r, y0: h.y, y1: h.y + ht };
}

function tickRoom(room, t) {
  if (room.phase !== 'hide' && room.phase !== 'seek') return;
  if (room.phase === 'hide' && t >= room.phaseEnd) {
    room.phase = 'seek'; room.phaseEnd = t + SEEK_SECS; room.nextAward = t + 10;
    broadcast(room, { t: 'phase', phase: 'seek', tl: SEEK_SECS });
    room.pickupAt = t + SEEK_SECS / 2;
  }
  if (room.mode === 'prophunt' && room.phase === 'seek') {
    if (!room.pickup && !room.pickupDone && t >= room.pickupAt) { // one ammo crate per round, midway through the seek phase
      const sp = worldOf(room).spawns, [x, z] = sp[(Math.random() * sp.length) | 0];
      room.pickup = { x, z }; broadcast(room, { t: 'pickup', x, z });
    }
    for (const p of room.players.values()) if (p.reloadEnd && t >= p.reloadEnd) {
      const n = Math.min(MAG - p.mag, p.res); p.mag += n; p.res -= n; p.reloadEnd = 0; sendAmmo(p);
    }
  }
  if (room.phase === 'seek') {
    while (t >= room.nextAward && room.nextAward < room.phaseEnd) { // +1 per 10s survived
      for (const p of hidersOf(room)) p.score += 1;
      room.nextAward += 10;
    }
    if (t >= room.phaseEnd) return endRound(room, 'hiders');
  }
  const hl = hidersOf(room).length;
  broadcast(room, {
    t: 'snap', tl: Math.max(0, r2(room.phaseEnd - t)), hl,
    p: [...room.players.values()].map((p) => [p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), r2(p.c)]),
  });
}
setInterval(() => {
  const t = now();
  for (const room of rooms.values()) {
    try { tickRoom(room, t); } catch (e) {
      console.error('tick error', room.code, e);
      try { endRound(room, 'hiders'); } catch (e2) { // could not end cleanly: force the room back to the lobby
        console.error('endRound failed, resetting room', room.code, e2);
        room.phase = 'lobby'; for (const p of room.players.values()) p.role = null;
        try { sendRoom(room); } catch { /* ignore */ }
      }
    }
  }
}, TICK_MS);
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

// ======================================================================
// websocket
// ======================================================================
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

const handlers = {
  create(p, m) {
    if (p.room) leaveRoom(p);
    p.name = cleanName(m.name);
    const room = { code: newCode(), players: new Map(), hostId: 0, phase: 'lobby', phaseEnd: 0, nextAward: 0, mode: 'classic', map: 'house', pickup: null, pickupDone: false, pickupAt: 0, t0: 0 };
    rooms.set(room.code, room);
    joinRoom(p, room);
  },
  join(p, m) {
    const code = typeof m.code === 'string' ? m.code.toUpperCase() : '';
    const room = /^[A-Z]{4}$/.test(code) ? rooms.get(code) : null;
    if (!room) return send(p, { t: 'err', msg: 'Room not found' });
    if (p.room === room) return sendRoom(room);
    if (room.phase !== 'lobby') return send(p, { t: 'err', msg: 'Round in progress, try again in a moment' });
    if (room.players.size >= MAX_PLAYERS) return send(p, { t: 'err', msg: 'Room is full' });
    if (p.room) leaveRoom(p);
    p.name = cleanName(m.name);
    joinRoom(p, room);
  },
  leave(p) { leaveRoom(p); },
  mode(p, m) { // host picks the game mode in the lobby
    const room = p.room;
    if (!room || room.hostId !== p.id || room.phase !== 'lobby' || !MODES.includes(m.mode)) return;
    room.mode = m.mode; sendRoom(room);
  },
  map(p, m) { // host picks the map in the lobby; only registry keys are accepted
    const room = p.room;
    if (!room || room.hostId !== p.id || room.phase !== 'lobby' || typeof m.map !== 'string' || !Object.hasOwn(MAPS, m.map)) return;
    room.map = m.map; sendRoom(room);
  },
  cosmetic(p, m) { // colour from the palette, hat / outfit from the enums; anything else is rejected whole
    const room = p.room;
    if (!room || room.phase !== 'lobby') return;
    const ok = (m.color === undefined || COLORS.includes(m.color)) && (m.hat === undefined || HATS.includes(m.hat)) && (m.outfit === undefined || OUTFITS.includes(m.outfit));
    if (!ok || (m.color === undefined && m.hat === undefined && m.outfit === undefined)) return send(p, { t: 'err', msg: 'Invalid cosmetic' });
    if (m.color !== undefined) p.color = m.color;
    if (m.hat !== undefined) p.hat = m.hat;
    if (m.outfit !== undefined) p.outfit = m.outfit;
    sendRoom(room);
  },
  start(p) {
    const room = p.room;
    if (!room || room.hostId !== p.id || room.phase !== 'lobby') return;
    if (room.players.size < MIN_PLAYERS) return send(p, { t: 'err', msg: 'Need at least 2 players' });
    startRound(room);
  },
  pos(p, m) {
    const room = p.room;
    if (!room || (room.phase !== 'hide' && room.phase !== 'seek')) return;
    if (room.phase === 'hide' && p.role === 'seeker') return; // frozen at the door
    const t = Date.now();
    if (t - p.lastPos < MIN_POS_MS) return;
    const bd = worldOf(room).meta.bounds;
    const x = num(m.x, bd.x0 - 0.5, bd.x1 + 0.5), y = num(m.y, 0, 8), z = num(m.z, bd.z0 - 0.5, bd.z1 + 0.5), yaw = num(m.yaw, -1e4, 1e4), pitch = num(m.pitch, -1.6, 1.6), c = num(m.c, 0, 1);
    if (x === null || y === null || z === null || yaw === null || pitch === null || c === null) return;
    const dt = Math.min(1, (t - p.lastPos) / 1000);
    if (Math.hypot(x - p.x, z - p.z) > MAX_SPEED * dt + 0.5) return;
    p.lastPos = t;
    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch; p.c = c;
  },
  // ----- prop hunt
  disguise(p, m) { // hider becomes a prop (propId) or reverts (null)
    const room = p.room;
    if (!room || room.mode !== 'prophunt' || (room.phase !== 'hide' && room.phase !== 'seek') || p.role !== 'hider') return;
    const t = now();
    if (t - p.lastDisguise < DISGUISE_CD - CD_SLACK) return;
    let id = null;
    if (m.propId !== null) {
      if (!Number.isInteger(m.propId) || m.propId < 0 || m.propId >= worldOf(room).props.length) return;
      const pr = worldOf(room).props[m.propId];
      if (Math.hypot(p.x - pr.x, p.z - pr.z) > DISGUISE_RANGE + Math.max(pr.w, pr.d) / 2) return; // must be near the prop
      id = m.propId;
    }
    p.lastDisguise = t; p.disguise = id; p.tint = null;
    broadcast(room, { t: 'disguise', id: p.id, propId: id });
  },
  camo(p, m) { // tint toward a sampled surface colour
    const room = p.room;
    if (!room || room.mode !== 'prophunt' || (room.phase !== 'hide' && room.phase !== 'seek') || p.role !== 'hider') return;
    if (!Number.isInteger(m.c) || m.c < 0 || m.c > 0xffffff) return;
    const t = now(); if (t - p.lastCamo < 0.5) return;
    p.lastCamo = t; p.tint = m.c;
    broadcast(room, { t: 'camo', id: p.id, c: m.c });
  },
  taunt(p) {
    const room = p.room;
    if (!room || room.mode !== 'prophunt' || (room.phase !== 'hide' && room.phase !== 'seek') || p.role !== 'hider') return;
    const t = now(); if (t - p.lastTaunt < TAUNT_CD - CD_SLACK) return;
    p.lastTaunt = t; p.score += 2;
    broadcast(room, { t: 'taunt', id: p.id, x: r2(p.x), z: r2(p.z) });
  },
  shoot(p, m) { // authoritative blaster: validate, raycast hiders and world, apply economy
    const room = p.room;
    if (!room || room.mode !== 'prophunt' || room.phase !== 'seek' || p.role !== 'seeker' || p.out || p.hp <= 0) return;
    const ox = num(m.ox, -40, 40), oy = num(m.oy, -1, 10), oz = num(m.oz, -40, 40), dx = num(m.dx, -1.5, 1.5), dy = num(m.dy, -1.5, 1.5), dz = num(m.dz, -1.5, 1.5);
    if ([ox, oy, oz, dx, dy, dz].includes(null)) return;
    const len = Math.hypot(dx, dy, dz);
    if (Math.abs(len - 1) > 0.05) return;                                              // direction must be a unit vector
    if (Math.hypot(ox - p.x, oz - p.z) > ORIGIN_TOL || oy < p.y || oy > p.y + 2.2) return sendAmmo(p); // origin near where the seeker really is
    const t = now();
    if (t - p.lastShot < FIRE_GAP || p.reloadEnd || p.mag <= 0) return sendAmmo(p);
    p.lastShot = t; p.mag--; p.shots++;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    const W = worldOf(room);
    let tw = SHOT_RANGE;                                                               // nearest world occluder
    for (const c of W.colliders) { const d = W.rayBox(ox, oy, oz, ux, uy, uz, c); if (d > 0.1 && d < tw) tw = d; }
    let target = null, th = tw;
    for (const h of hidersOf(room)) { const d = W.rayBox(ox, oy, oz, ux, uy, uz, hiderBox(room, h)); if (d >= 0 && d < th) { th = d; target = h; } }
    const d = target ? th : tw;
    broadcast(room, { t: 'shot', by: p.id, hit: target ? target.id : 0, x: r2(ox + ux * d), y: r2(oy + uy * d), z: r2(oz + uz * d), ox: r2(ox), oy: r2(oy), oz: r2(oz) });
    if (target) {
      p.hits++; p.tags++; p.score += 3; p.res += REFUND;
      Object.assign(target, { role: 'seeker', disguise: null, tint: null, tagT: t, hp: HP0, mag: MAG, res: 0, reloadEnd: 0 }); // infection: new seeker, one mag
      const hl = hidersOf(room).length;
      broadcast(room, { t: 'tagged', by: p.id, target: target.id, hl });
      sendAmmo(target);
    } else p.hp -= MISS_DMG;
    sendAmmo(p);
    if (p.hp <= 0) { p.out = true; broadcast(room, { t: 'out', id: p.id }); }
    if (!hidersOf(room).length) endRound(room, 'seekers'); else checkRound(room);
  },
  reload(p) {
    const room = p.room;
    if (!room || room.mode !== 'prophunt' || room.phase !== 'seek' || p.role !== 'seeker' || p.out) return;
    if (p.reloadEnd || p.mag >= MAG || p.res <= 0) return sendAmmo(p);
    p.reloadEnd = now() + RELOAD_S; sendAmmo(p);
  },
  grab(p) { // pick up the ammo crate when close enough
    const room = p.room, c = room && room.pickup;
    if (!c || room.phase !== 'seek' || p.role !== 'seeker' || p.out || Math.hypot(c.x - p.x, c.z - p.z) > PICKUP_RANGE) return;
    room.pickup = null; room.pickupDone = true; p.res += PICKUP_SHOTS;
    broadcast(room, { t: 'picked', by: p.id }); sendAmmo(p);
  },
  tag(p, m) {
    const room = p.room;
    if (!room || room.mode !== 'classic' || room.phase !== 'seek' || p.role !== 'seeker') return;
    const target = typeof m.target === 'number' ? room.players.get(m.target) : null;
    if (!target || target.role !== 'hider') return;
    const t = now();
    if (t - p.lastTag < 0.3) return;
    if (Math.hypot(target.x - p.x, target.z - p.z) > TAG_RANGE) return;
    p.lastTag = t;
    target.role = 'seeker';
    p.score += 3; p.tags++;
    const hl = hidersOf(room).length;
    broadcast(room, { t: 'tagged', by: p.id, target: target.id, hl });
    if (!hl) endRound(room, 'seekers');
  },
  noise(p, m) {
    const room = p.room;
    if (!room || room.phase === 'lobby' || (m.k !== 'sprint' && m.k !== 'land' && m.k !== 'scrape')) return;
    const t = Date.now();
    if (t - p.lastNoise < 200) return;
    p.lastNoise = t;
    broadcast(room, { t: 'noise', id: p.id, k: m.k, x: r2(p.x), z: r2(p.z) }, p);
  },
};

wss.on('connection', (ws) => {
  const p = {
    id: nextId++, ws, name: 'Player', room: null, role: null, color: 0, score: 0, total: 0, tags: 0,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, c: 0, lastPos: 0, lastTag: 0, lastNoise: 0, tokens: 120, tokT: Date.now(),
  };
  ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', (e) => console.warn('ws error', e.message));
  ws.on('close', () => { try { leaveRoom(p); } catch (e) { console.error('close handler error', e); } });
  ws.on('message', (raw, isBinary) => {
    ws.alive = true;
    // token bucket: 60 msgs/s sustained, bursts of 120
    const t = Date.now();
    p.tokens = Math.min(120, p.tokens + ((t - p.tokT) / 1000) * 60); p.tokT = t;
    if (p.tokens < 1) return;
    p.tokens--;
    if (isBinary || raw.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    const h = Object.hasOwn(handlers, m.t) ? handlers[m.t] : null;
    if (!h) return;
    try { h(p, m); } catch (e) { console.error('handler error', m.t, e); }
  });
});

// heartbeat: drop sockets that did not answer the previous ping (covers sockets not in a room too)
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.alive === false) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 15000).unref();

const port = process.env.PORT || 3000;
// the shared worlds (colliders + prop table per map) are an ES module; build them all before accepting connections
import('../public/worlddata.js').then((m) => {
  MAPS = m.MAPS; WORLDS = {};
  for (const [id, map] of Object.entries(MAPS)) WORLDS[id] = { ...m.buildWorld({}, id), meta: map.meta, spawns: map.spawns, rayBox: m.rayBox };
  server.listen(port, () => console.log(`Hide & Seek on http://localhost:${port} (${Object.entries(WORLDS).map(([id, w]) => `${id}: ${w.colliders.length} colliders, ${w.props.length} props`).join('; ')})`));
}).catch((e) => { console.error('failed to load public/worlddata.js', e); process.exit(1); });
