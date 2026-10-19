'use strict';
// Static file server for dist/ (the Vite build) plus the multiplayer WebSocket endpoint (/ws) on one port.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..', 'dist'); // `npm run build` output
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.map': 'application/json',
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
// cosmetic enums: must match src/characters/character.js (HATS / OUTFITS)
const HATS = ['none', 'cap', 'beanie', 'bucket', 'crown'];
const OUTFITS = ['plain', 'stripes', 'dots', 'overalls'];
const MODES = ['classic', 'prophunt'];
// prop hunt tunables
const MAG = 6, RESERVE0 = 12, HP0 = 100, MISS_DMG = 8, REFUND = MAG, PICKUP_SHOTS = 6; // a hit earns a whole extra mag
const FIRE_GAP = 0.25, RELOAD_S = 1.2, SHOT_RANGE = 60, ORIGIN_TOL = 1.5 + 6.8 * 0.3, PICKUP_RANGE = 2.5; // origin tolerance: 1.5m + sprint speed (6.8) x 0.3s of lag (~3.5m)
const DISGUISE_CD = 3, TAUNT_CD = 10, CD_SLACK = 0.15, DISGUISE_RANGE = 6;
const NOISE_RANGE = 30;         // m: `noise` cues are only sent to players who could hear them
const REVEAL_S = 1.0, HOLD_S = 0.4; // a sound reveals the maker's position for 1 s; a player that just left LOS lingers 0.4 s so interpolation does not pop
const BUDGET_CAP = 1.5;         // m: speed-budget bucket (accrues MAX_SPEED m/s of server time): a small burst allowance so jittered / bunched packets are not mistaken for teleports
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 200, MAX_ROOMS_PER_IP = Number(process.env.MAX_ROOMS_PER_IP) || 3, BOT_HZ = 10;
const MAX_CONNS_PER_IP = Number(process.env.MAX_CONNS_PER_IP) || 16, MAX_BOTS = Number(process.env.MAX_BOTS) || 120, HELLO_MS = Number(process.env.HELLO_MS) || 10000;
const HEAVY = new Set(['create', 'join', 'fill', 'start', 'reconnect']); // handlers that allocate or search: separately rate limited (burst 12, 2/s)
const RECONNECT_MS = (Number(process.env.RECONNECT_SECS) || 30) * 1000; // how long a dropped player's seat is held (matches src/shared/protocol.js RECONNECT_SECS)
const BOT_TARGET = 6;           // "fill bots" tops a lobby up to this many players
let PR = null;      // src/shared/protocol.js
let BOTSPOTS = null; // mapId -> hiding spots the bots may use
let NAVS = null;    // mapId -> shared nav (grid, path, LOS) over that map's colliders
let WORLDS = null; // mapId -> { colliders, props, meta, spawns, rayBox } from src/shared/worlddata.js, built before listening
let MAPS = null;   // the map registry from src/shared/worlddata.js
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
  if (rel === '/metrics') { // Prometheus text format; set METRICS_TOKEN to require ?token=
    if (process.env.METRICS_TOKEN && new URL(req.url, 'http://x').searchParams.get('token') !== process.env.METRICS_TOKEN) { res.writeHead(403); return res.end('Forbidden'); }
    let humans = 0, bots = 0;
    for (const r of rooms.values()) for (const q of r.players.values()) q.bot ? bots++ : humans++;
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
    return res.end(req.method === 'HEAD' ? undefined : `hs_rooms ${rooms.size}\nhs_players ${humans}\nhs_bots ${bots}\nhs_tokens ${tokens.size}\nhs_history_samples ${[...rooms.values()].reduce((n, r) => n + [...r.players.values()].reduce((m, q) => m + q.hist.length, 0), 0)}\nhs_connections ${wss ? wss.clients.size : 0}\nhs_tick_ms ${tickMs.last.toFixed(3)}\nhs_tick_ms_avg ${tickMs.avg.toFixed(3)}\nhs_tick_ms_max ${tickMs.max.toFixed(3)}\nhs_uptime_s ${Math.round(process.uptime())}\n`);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + path.sep + path.normalize(rel));
  // reject traversal outside dist/
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
      'Cache-Control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache', // Vite hashes everything under /assets/
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

// ======================================================================
// helpers
// ======================================================================
const rooms = new Map();   // code -> room
const tokens = new Map();  // reconnect token -> player (only players currently in a room)
let nextId = 1;
const liveIds = new Set(); // ids are u16 on the wire: allocate from 1..65535, skipping ids still in use, so a long-running server never truncates or collides
function allocId() {
  for (let i = 0; i < 65535; i++) { const id = nextId; nextId = nextId >= 65535 ? 1 : nextId + 1; if (!liveIds.has(id)) { liveIds.add(id); return id; } }
  throw new Error('out of player ids');
}
const tickMs = { last: 0, avg: 0, max: 0 };
const now = () => Date.now() / 1000;
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const r2 = (v) => Math.round(v * 100) / 100;
const cleanName = (n) => (typeof n === 'string' ? n.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 16) : '') || 'Player';
const BOT_WS = { readyState: 0, send() {} }; // bots have no socket: every send() to them is a no-op

function newPlayer(ws, bot = false) {
  return {
    id: allocId(), ws, bot, ok: bot, token: bot ? null : crypto.randomBytes(16).toString('hex'), name: 'Player', room: null, role: null, color: 0, score: 0, total: 0, tags: 0,
    x: 0, y: 0, z: 0, yaw: 0, pitch: 0, c: 0, lastPos: 0, lastTag: 0, lastNoise: 0, tokens: 120, tokT: Date.now(),
    ack: 0, budget: BUDGET_CAP, budgetT: Date.now(), rtt: 0, rtts: [], pings: new Set(), lastPingS: 0, told: new Map(), ip: '', disc: 0,
    hist: [], sent: new Map(), seen: new Map(), reveal: new Map(), // lag-comp history; per-receiver snapshot state (what we sent / when each player was last in LOS / sound reveals)
  };
}
function sendPing(p) { // a unique server timestamp per ping; the pong must echo exactly one of the last 8
  const s = Math.max(Date.now(), p.lastPingS + 1); p.lastPingS = s; p.pings.add(s);
  if (p.pings.size > 8) p.pings.delete(p.pings.values().next().value);
  send(p, { t: 'ping', s, rtt: r2(p.rtt) });
}
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
const humansOf = (room) => [...room.players.values()].filter((p) => !p.bot);

function roomMsg(room, p) {
  const list = [...room.players.values()].map((q) => ({ id: q.id, name: q.name, color: q.color, hat: q.hat, outfit: q.outfit, total: q.total, bot: q.bot || undefined }));
  return { t: 'room', code: room.code, you: p.id, host: room.hostId, phase: room.phase, mode: room.mode, map: room.map, fill: room.fill, token: p.token, players: list };
}
function sendRoom(room) { for (const p of room.players.values()) if (!p.bot) send(p, roomMsg(room, p)); }

// ======================================================================
// rooms and rounds
// ======================================================================
function joinRoom(p, room, quiet) {
  const used = new Set([...room.players.values()].map((q) => q.color));
  p.color = COLORS.find((c) => !used.has(c)) ?? COLORS[0];
  p.hat = 'none'; p.outfit = 'plain';
  p.room = room; p.role = null; p.score = 0; p.total = 0; p.tags = 0; p.disc = 0;
  room.players.set(p.id, p);
  if (p.token) tokens.set(p.token, p);
  if (!room.hostId && !p.bot) room.hostId = p.id;
  if (!quiet) sendRoom(room);
}

// "fill bots": in the lobby, top the room up with bots to BOT_TARGET players (humans always win a slot)
function syncBots(room) {
  if (room.phase !== 'lobby') return;
  let want = room.fill ? Math.max(0, Math.min(BOT_TARGET, MAX_PLAYERS) - humansOf(room).length) : 0;
  const bots = [...room.players.values()].filter((q) => q.bot);
  let total = 0; for (const r of rooms.values()) for (const q of r.players.values()) if (q.bot) total++;
  want = Math.min(want, bots.length + Math.max(0, MAX_BOTS - total)); // server-wide bot cap: bots cost CPU
  while (bots.length > want) { const b = bots.pop(); room.players.delete(b.id); liveIds.delete(b.id); }
  while (bots.length < want) { const b = newPlayer(BOT_WS, true); b.name = `Bot ${++room.botN}`; joinRoom(b, room, true); bots.push(b); }
}

function leaveRoom(p) {
  const room = p.room;
  if (!room) return;
  p.room = null; p.role = null; p.disc = 0;
  if (p.token) tokens.delete(p.token);
  room.players.delete(p.id);
  p.hist = []; p.sent.clear(); p.seen.clear(); p.reveal.clear(); p.told.clear();
  for (const q of room.players.values()) { q.sent.delete(p.id); q.seen.delete(p.id); q.reveal.delete(p.id); q.told.delete(p.id); }
  if (!p.bot && p.ws.readyState !== 1) liveIds.delete(p.id); // a human whose socket is gone frees its id
  if (!humansOf(room).length) { for (const q of room.players.values()) liveIds.delete(q.id); room.players.clear(); rooms.delete(room.code); return; }
  if (room.hostId === p.id) room.hostId = humansOf(room)[0].id;
  syncBots(room);
  sendRoom(room);
  checkRound(room);
}

function startRound(room) {
  syncBots(room);
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
    p.hist = []; p.sent = new Map(); p.seen = new Map(); p.reveal = new Map(); p.told = new Map();
    Object.assign(p, { st: 'init', path: null, pi: 0, heading: p.yaw - Math.PI, spot: null, visited: new Set(), detect: 0 }); // bot brain
    spawns.push({ id: p.id, x: p.x, z: p.z, yaw: r2(p.yaw) });
  });
  room.phase = 'hide'; room.lt = 0;
  room.t0 = now(); room.phaseEnd = room.t0 + HIDE_SECS; room.pickup = null; room.pickupDone = false; room.pickupAt = 0;
  // spawns are per recipient: your own plus your own side's (seekers start at the door, which is public). A seeker never learns where hiders spawned.
  for (const p of ps) {
    if (p.bot) continue;
    send(p, { t: 'round', mode: room.mode, map: room.map, seekers: ps.slice(0, nSeek).map((q) => q.id), spawns: spawns.filter((sp) => sp.id === p.id || (room.players.get(sp.id).role === p.role && !(room.mode === 'prophunt' && p.role === 'hider'))), hide: HIDE_SECS, seek: SEEK_SECS });
  }
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
  for (const p of room.players.values()) { p.role = null; p.hist = []; p.sent.clear(); p.seen.clear(); p.reveal.clear(); }
  broadcast(room, { t: 'end', winner, mode: room.mode, players });
  syncBots(room);
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
function hiderBox(room, h, at = h) { // server-side bounding volume: the prop's footprint when disguised, else a person. `at`: where (a rewound position)
  const dg = 'd' in at ? at.d : h.disguise, pr = dg != null ? worldOf(room).props[dg] : null; // the disguise it wore then
  const r = pr ? Math.max(0.25, Math.max(pr.w, pr.d) / 2) : 0.35, ht = pr ? Math.max(0.4, pr.h) : 1.75 * (1 - 0.35 * at.c);
  return { x0: at.x - r, x1: at.x + r, z0: at.z - r, z1: at.z + r, y0: at.y, y1: at.y + ht };
}

// ----- lag compensation: 1 s of every player's position at 30 Hz; shots are judged against where the shooter saw the target
function sampleHistory() {
  const t = Date.now(), keep = PR.HIST_SECS * 1000 + 100;
  for (const room of rooms.values()) {
    if (room.phase !== 'hide' && room.phase !== 'seek') continue;
    for (const p of room.players.values()) {
      p.hist.push({ t, x: p.x, y: p.y, z: p.z, c: p.c, d: p.disguise ?? null });
      while (p.hist.length && t - p.hist[0].t > keep) p.hist.shift();
    }
  }
}
function posAt(p, T) { // interpolated {x,y,z,c} at wall-clock ms T (the oldest sample if T is older than the history)
  const h = p.hist;
  if (!h.length || T >= h[h.length - 1].t) return p;
  if (T <= h[0].t) return h[0];
  let i = h.length - 1; while (h[i - 1].t > T) i--;
  const a = h[i - 1], b = h[i], k = (T - a.t) / (b.t - a.t || 1);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, c: a.c + (b.c - a.c) * k, d: a.d };
}

// ----- interest management: what a receiver may know about another player's position
// true when `o` is within INTEREST_RANGE and in line of sight (eye to two body points), or made a sound the receiver could hear
const hideGate = (room, r, o) => room.phase === 'hide' && r.role === 'seeker' && o.role === 'hider'; // seekers are blind and frozen during the hide phase: they learn nothing about hiders
function visible(room, r, o, t) {
  if (hideGate(room, r, o)) return false;
  if (room.mode === 'prophunt' && r.role === 'hider' && o.role === 'hider') return false; // prop hunt: hiders never see each other (the client already hides them)
  if ((r.reveal.get(o.id) ?? 0) > t) return true;
  const dx = o.x - r.x, dz = o.z - r.z;
  if (dx * dx + dz * dz <= PR.INTEREST_RANGE * PR.INTEREST_RANGE) {
    const los = NAVS[room.map].losClear, ey = r.y + 1.5 * (1 - 0.35 * r.c);
    if (los(r.x, ey, r.z, o.x, o.y + 0.5, o.z) || los(r.x, ey, r.z, o.x, o.y + 1.3 * (1 - 0.35 * o.c), o.z)) { r.seen.set(o.id, t); return true; }
  }
  return t - (r.seen.get(o.id) ?? -99) < HOLD_S;
}
const GONE_Q = new Int32Array(6);
const sameQ = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3] && a[4] === b[4] && a[5] === b[5];
function sendSnapshots(room, t) {
  const all = [...room.players.values()], hl = hidersOf(room).length, tl = Math.max(0, room.phaseEnd - t), st = Date.now();
  for (const r of all) {
    if (r.bot || r.ws.readyState !== 1) continue;
    const ents = [];
    for (const o of all) {
      if (o === r) { ents.push({ id: o.id, q: PR.quantise(o), flags: PR.F_SELF }); continue; } // own state is always sent: it carries the reconciliation target
      if (!visible(room, r, o, t)) { if (r.sent.delete(o.id)) ents.push({ id: o.id, q: GONE_Q, flags: PR.F_GONE }); continue; }
      const q = PR.quantise(o), prev = r.sent.get(o.id);
      if (prev && sameQ(prev, q)) continue; // delta: unchanged since the last snapshot this receiver got
      if (!prev) { // newly visible: bring it up to date with what this receiver was last told (including 'undisguised' / 'no tint')
        const tl = r.told.get(o.id) || { d: null, c: null }, d = o.disguise ?? null, c = o.tint ?? null;
        if (tl.d !== d) { send(r, { t: 'disguise', id: o.id, propId: d }); tl.c = null; }
        if (tl.c !== c) send(r, { t: 'camo', id: o.id, c });
        r.told.set(o.id, { d, c });
      }
      r.sent.set(o.id, q); ents.push({ id: o.id, q, flags: 0 });
    }
    r.ws.send(PR.encodeSnap({ tl, hl, ack: r.ack, st }, ents));
  }
}

function tickRoom(room, t) {
  if (room.phase !== 'hide' && room.phase !== 'seek') return;
  const dt = room.lt ? Math.min(0.25, t - room.lt) : 0; room.lt = t;
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
  room.botAcc += dt; // bot brains run at BOT_HZ, not every tick
  if (room.botAcc >= 1 / BOT_HZ - 1e-6) { const bdt = room.botAcc; room.botAcc = 0; for (const b of room.players.values()) if (b.bot && (room.phase === 'hide' || room.phase === 'seek')) botThink(room, b, t, bdt); }
  if (room.phase !== 'hide' && room.phase !== 'seek') return; // a bot's tag or shot may have ended the round
  sendSnapshots(room, t);
}
setInterval(() => {
  const t = now(), t0 = performance.now();
  for (const room of [...rooms.values()]) {
    for (const q of [...room.players.values()]) if (q.disc && Date.now() - q.disc > RECONNECT_MS) leaveRoom(q); // reconnect window over
    if (rooms.get(room.code) !== room) continue;
    try { tickRoom(room, t); } catch (e) {
      console.error('tick error', room.code, e);
      try { endRound(room, 'hiders'); } catch (e2) { // could not end cleanly: force the room back to the lobby
        console.error('endRound failed, resetting room', room.code, e2);
        room.phase = 'lobby'; for (const p of room.players.values()) p.role = null;
        try { sendRoom(room); } catch { /* ignore */ }
      }
    }
  }
  const d = performance.now() - t0;
  tickMs.last = d; tickMs.avg += (d - tickMs.avg) * 0.05; tickMs.max = Math.max(d, tickMs.max * 0.98);
}, TICK_MS);
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

// ======================================================================
// actions shared by players and bots
// ======================================================================
// a message about player `o` (disguise, tint) only goes to players who may currently know where `o` is; the snapshot code re-sends it when `o` next becomes visible
function sendAbout(room, o, msg) {
  const t = now(), s = JSON.stringify(msg);
  for (const r of room.players.values()) {
    if (r.ws.readyState !== 1 || !(r === o || visible(room, r, o, t))) continue;
    r.ws.send(s);
    const tl = r.told.get(o.id) || { d: null, c: null };
    if (msg.t === 'disguise') { tl.d = msg.propId; tl.c = null; } else tl.c = msg.c; // (a disguise change clears the tint client-side)
    r.told.set(o.id, tl);
  }
}
function applyDisguise(room, p, id) { p.lastDisguise = now(); p.disguise = id; p.tint = null; sendAbout(room, p, { t: 'disguise', id: p.id, propId: id }); }
function startReload(p) { p.reloadEnd = now() + RELOAD_S; sendAmmo(p); }

// the seeker `p` fires from (ox,oy,oz) along unit (ux,uy,uz); hiders are judged where they were at wall-clock ms T. False when the shot is refused.
function fireShot(room, p, ox, oy, oz, ux, uy, uz, T) {
  const t = now();
  if (t - p.lastShot < FIRE_GAP || p.reloadEnd || p.mag <= 0) return false;
  p.lastShot = t; p.mag--; p.shots++;
  const W = worldOf(room);
  let tw = SHOT_RANGE;                                                               // nearest world occluder
  for (const c of W.colliders) { const d = W.rayBox(ox, oy, oz, ux, uy, uz, c); if (d > 0.1 && d < tw) tw = d; }
  let target = null, th = tw;
  for (const h of hidersOf(room)) { const d = W.rayBox(ox, oy, oz, ux, uy, uz, hiderBox(room, h, posAt(h, T))); if (d >= 0 && d < th) { th = d; target = h; } }
  const d = target ? th : tw;
  for (const q of room.players.values()) if (q !== p) q.reveal.set(p.id, t + REVEAL_S);  // the muzzle flash gives the shooter away
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
  return true;
}
function doTag(room, p, target) { // classic tag, range already checked
  p.lastTag = now();
  target.role = 'seeker';
  p.score += 3; p.tags++;
  const hl = hidersOf(room).length;
  broadcast(room, { t: 'tagged', by: p.id, target: target.id, hl });
  if (!hl) endRound(room, 'seekers');
}

// ======================================================================
// bots: server-side AI over the shared nav grid (same ideas as src/ai: hiders run to a spot and crouch, seekers patrol, look, chase)
// ======================================================================
const COS35 = Math.cos(35 * Math.PI / 180);
function pickSpot(room, b, avoid) {
  const all = BOTSPOTS[room.map], taken = new Set();
  for (const q of room.players.values()) if (q !== b && q.spot) taken.add(q.spot);
  let c = all.filter((s) => !taken.has(s) && (!avoid || Math.hypot(s.x - avoid.x, s.z - avoid.z) > 10));
  if (!c.length) c = all;
  return c.length ? c[(Math.random() * c.length) | 0] : null;
}
function goTo(room, b, x, z, st, speed) { b.base = null; b.path = NAVS[room.map].findPath(b.x, b.z, x, z); b.pi = 0; b.st = st; b.speed = speed; }
function botHear(room, b, x, z) { // a seeker bot walks over to a noise
  if (b.role !== 'seeker' || b.st === 'chase' || room.phase !== 'seek') return;
  goTo(room, b, x + (Math.random() - 0.5) * 3, z + (Math.random() - 0.5) * 3, 'investigate', 3.6);
}
function nextSearch(room, b) {
  let c = BOTSPOTS[room.map].filter((s) => !b.visited.has(s));
  if (!c.length) { b.visited.clear(); c = BOTSPOTS[room.map].slice(); }
  if (!c.length) return;
  c.sort((a, d) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(d.x - b.x, d.z - b.z));
  const s = c.slice(0, 3)[(Math.random() * Math.min(3, c.length)) | 0]; b.visited.add(s);
  const d = Math.hypot(s.x - b.x, s.z - b.z), k = d > 1.8 ? (d - 1.5) / d : 0; // stop short so it looks at the spot
  const base = Math.atan2(s.x - b.x, s.z - b.z);
  goTo(room, b, b.x + (s.x - b.x) * k, b.z + (s.z - b.z) * k, 'patrol', 2.7);
  b.base = base; // look toward the spot on arrival
}
function botThink(room, b, t, dt) {
  const nav = NAVS[room.map];
  if (b.role === 'hider') {
    if (b.st === 'init') { b.spot = pickSpot(room, b); if (b.spot) goTo(room, b, b.spot.x, b.spot.z, 'run', 4.5); else b.st = 'hide'; b.fleeCd = 3; }
    if (b.st === 'run') {
      b.c = Math.max(0, b.c - dt * 4);
      if (nav.follow(b, b.speed, dt)) {
        b.st = 'hide';
        if (room.mode === 'prophunt') { // become the nearest prop
          let best = null, bd = DISGUISE_RANGE;
          worldOf(room).props.forEach((pr) => { const d = Math.hypot(b.x - pr.x, b.z - pr.z) - Math.max(pr.w, pr.d) / 2; if (d < bd) { bd = d; best = pr; } });
          if (best) applyDisguise(room, b, best.id);
        }
      }
    } else if (b.st === 'hide') {
      b.c = Math.min(1, b.c + dt * 4); b.fleeCd -= dt;
      if (b.fleeCd <= 0 && Math.random() < dt * 0.9) {
        const s = seekersOf(room).find((q) => Math.hypot(q.x - b.x, q.z - b.z) < 2.6 && nav.losClear(q.x, q.y + 1.5, q.z, b.x, b.y + 0.5, b.z));
        const sp = s && pickSpot(room, b, s);
        if (sp) { if (b.disguise != null) applyDisguise(room, b, null); b.spot = sp; goTo(room, b, sp.x, sp.z, 'run', 6.2); }
      }
    }
  } else if (room.phase === 'seek' && !b.out) {
    const ey = b.y + 1.5, fx = Math.sin(b.heading), fz = Math.cos(b.heading);
    let tgt = null, td = 1e9;
    for (const h of hidersOf(room)) { // vision: 35 degree cone, 12 m (2.5 m if the hider is a prop), line of sight
      const dx = h.x - b.x, dz = h.z - b.z, d = Math.hypot(dx, dz);
      if (d >= (h.disguise != null ? 2.5 : 12) || d >= td) continue;
      if (!(d < 1.1 || (dx * fx + dz * fz) / d > COS35)) continue;
      if (nav.losClear(b.x, ey, b.z, h.x, h.y + 0.5, h.z) || nav.losClear(b.x, ey, b.z, h.x, h.y + 1.3, h.z)) { td = d; tgt = h; }
    }
    if (tgt) { b.detect = Math.min(1, b.detect + dt / 0.6); b.last = { x: tgt.x, z: tgt.z }; b.lostT = 0; if (b.st !== 'chase') { b.st = 'chase'; b.rep = 0; } } else b.detect = Math.max(0, b.detect - dt * 0.9);
    switch (b.st) {
      case 'chase':
        if (tgt) {
          b.rep -= dt; if (b.rep <= 0) { b.path = nav.findPath(b.x, b.z, tgt.x, tgt.z); b.pi = 0; b.rep = 0.3; }
          if (room.mode === 'classic') {
            nav.follow(b, 5.1, dt);
            if (td < 2.8 && b.detect >= 0.7 && t - b.lastTag >= 0.3) doTag(room, b, tgt);
          } else {
            if (td > 9) nav.follow(b, 5.1, dt);
            if (b.detect >= 1 && td < 25) {
              const bx = hiderBox(room, tgt), cx = (bx.x0 + bx.x1) / 2, cy = (bx.y0 + bx.y1) / 2, cz = (bx.z0 + bx.z1) / 2;
              let ux = cx - b.x + (Math.random() - 0.5) * 0.12 * td, uy = cy - ey + (Math.random() - 0.5) * 0.12 * td, uz = cz - b.z + (Math.random() - 0.5) * 0.12 * td;
              const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
              b.heading = Math.atan2(cx - b.x, cz - b.z);
              if (b.mag <= 0) { if (b.res > 0 && !b.reloadEnd) startReload(b); }
              else if (t - (b.botFire || 0) > 0.7) { b.botFire = t; fireShot(room, b, b.x, ey, b.z, ux, uy, uz, Date.now()); }
            }
          }
        } else {
          b.lostT += dt; nav.follow(b, 5.1, dt);
          if (b.lostT > 2.5 || b.pi >= b.path.length) { if (b.last) goTo(room, b, b.last.x, b.last.z, 'investigate', 3.6); else nextSearch(room, b); b.lostT = 0; }
        }
        break;
      case 'patrol': case 'investigate':
        if (nav.follow(b, b.speed, dt)) { b.st = 'look'; b.timer = 2.2; if (b.base == null) b.base = b.heading; }
        break;
      case 'look':
        b.timer -= dt; b.heading = b.base + Math.sin((2.2 - b.timer) * 3) * 0.9;
        if (b.timer <= 0) nextSearch(room, b);
        break;
      default: nextSearch(room, b);
    }
  }
  b.yaw = b.heading - Math.PI; // clients draw yaw so that the avatar faces +z at heading 0
}

// ======================================================================
// websocket
// ======================================================================


const refuse = (p) => { send(p, { t: 'err', msg: PR.REFRESH_MSG }); p.ws.close(1008, 'protocol'); };

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

const handlers = {
  hello(p, m) { // first message on every connection; a different protocol version is refused instead of desyncing
    if (m.protocol !== PR.PROTOCOL) return refuse(p);
    p.ok = true;
    sendPing(p);
  },
  pong(p, m) { // server-measured round trip: only a pong for a ping the server really sent counts, and lag comp uses the minimum of the last 8
    if (typeof m.s !== 'number' || !p.pings.delete(m.s)) return;
    p.rtts.push((Date.now() - m.s) / 1000); if (p.rtts.length > 8) p.rtts.shift();
    p.rtt = Math.min(...p.rtts); // delaying pongs cannot raise the minimum; it only lowers the cheater's own rewind
  },
  reconnect(p, m, conn) { // take over a player whose socket dropped within the last 30 s of a live round
    if (p.room) leaveRoom(p); // this socket's own throwaway player may already be in a room: no zombie seat
    const old = typeof m.token === 'string' ? tokens.get(m.token) : null;
    if (!old || !old.disc || !old.room || Date.now() - old.disc > RECONNECT_MS) return send(p, { t: 'err', msg: 'Session expired' });
    if (old.ws.readyState === 1) old.ws.terminate();
    old.ws = p.ws; old.ok = true; old.disc = 0; old.sent = new Map(); old.seen = new Map(); old.told = new Map(); old.pings = p.pings; old.lastPingS = p.lastPingS;
    p.ws.alive = true; conn.p = old; liveIds.delete(p.id); // the throwaway player this socket started with is dropped
    tokens.delete(old.token); old.token = crypto.randomBytes(16).toString('hex'); tokens.set(old.token, old); // rotate: a leaked token is good for one reconnect only
    const room = old.room;
    send(old, roomMsg(room, old));
    broadcast(room, { t: 'conn', id: old.id, on: true }, old);
    if (room.phase === 'hide' || room.phase === 'seek') {
      send(old, { t: 'round', resume: 1, phase: room.phase, mode: room.mode, map: room.map, seekers: seekersOf(room).map((q) => q.id), spawns: [{ id: old.id, x: r2(old.x), z: r2(old.z), yaw: r2(old.yaw) }], hide: HIDE_SECS, seek: SEEK_SECS, tl: Math.max(0, r2(room.phaseEnd - now())), role: old.role, score: old.score });
      // others' disguise / tint are re-sent by the snapshot code the moment each player is next visible to us
      if (room.mode === 'prophunt') { if (old.role === 'seeker') sendAmmo(old); if (room.pickup) send(old, { t: 'pickup', x: room.pickup.x, z: room.pickup.z }); }
    }
  },
  create(p, m) {
    if (p.room) leaveRoom(p);
    if (rooms.size >= MAX_ROOMS) return send(p, { t: 'err', msg: 'Server is full, try again in a few minutes' });
    if ([...rooms.values()].filter((r) => r.ip === p.ip).length >= MAX_ROOMS_PER_IP) return send(p, { t: 'err', msg: 'Too many rooms from your connection' });
    p.name = cleanName(m.name);
    const room = { code: newCode(), players: new Map(), hostId: 0, phase: 'lobby', phaseEnd: 0, nextAward: 0, mode: 'classic', map: 'house', pickup: null, pickupDone: false, pickupAt: 0, t0: 0, fill: false, botN: 0, lt: 0, botAcc: 0, ip: p.ip };
    rooms.set(room.code, room);
    joinRoom(p, room);
  },
  join(p, m) {
    const code = typeof m.code === 'string' ? m.code.toUpperCase() : '';
    const room = /^[A-Z]{4}$/.test(code) ? rooms.get(code) : null;
    if (!room) return send(p, { t: 'err', msg: 'Room not found' });
    if (p.room === room) return sendRoom(room);
    if (room.phase !== 'lobby') return send(p, { t: 'err', msg: 'Round in progress, try again in a moment' });
    if (humansOf(room).length >= MAX_PLAYERS) return send(p, { t: 'err', msg: 'Room is full' });
    if (p.room) leaveRoom(p);
    p.name = cleanName(m.name);
    joinRoom(p, room, true);
    syncBots(room); sendRoom(room);
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
  fill(p, m) { // host toggles "fill with bots"
    const room = p.room;
    if (!room || room.hostId !== p.id || room.phase !== 'lobby' || typeof m.on !== 'boolean') return;
    room.fill = m.on; syncBots(room);
    if (m.on && !room.players.size) return;
    if (m.on && [...room.players.values()].filter((q) => q.bot).length < Math.min(BOT_TARGET, MAX_PLAYERS) - humansOf(room).length) send(p, { t: 'err', msg: 'Bot capacity reached, fewer bots added' });
    sendRoom(room);
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
    syncBots(room);
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
    const seq = Number.isInteger(m.s) ? m.s & 0xffff : null;
    const dt = Math.min(1, (t - p.lastPos) / 1000);
    // speed check: BOTH must hold. The per-move rule (9 m/s * dt + 0.5 m) and the bucket (9 m/s of server time, capped at BUDGET_CAP = 1.5 m; 1.0 m refused ~7% of simulated jittered 6.8 m/s walks and an overloaded host bunches packets further),
    // so the sustained speed is at most 9 m/s plus a ~1 m burst, and a jittered 6.8 m/s walker (bunched packets) still fits.
    p.budget = Math.min(BUDGET_CAP, p.budget + ((t - p.budgetT) / 1000) * MAX_SPEED); p.budgetT = t;
    const dist = Math.hypot(x - p.x, z - p.z);
    if (dist > MAX_SPEED * dt + 0.5 || dist > p.budget) { if (seq !== null) p.ack = seq; return; } // refused: the ack tells the client to snap back to our position
    p.budget = Math.max(0, p.budget - dist);
    p.lastPos = t;
    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch; p.c = c;
    if (seq !== null) p.ack = seq;
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
    applyDisguise(room, p, id);
  },
  camo(p, m) { // tint toward a sampled surface colour
    const room = p.room;
    if (!room || room.mode !== 'prophunt' || (room.phase !== 'hide' && room.phase !== 'seek') || p.role !== 'hider') return;
    if (!Number.isInteger(m.c) || m.c < 0 || m.c > 0xffffff) return;
    const t = now(); if (t - p.lastCamo < 0.5) return;
    p.lastCamo = t; p.tint = m.c;
    sendAbout(room, p, { t: 'camo', id: p.id, c: m.c });
  },
  taunt(p) {
    const room = p.room;
    if (!room || room.mode !== 'prophunt' || (room.phase !== 'hide' && room.phase !== 'seek') || p.role !== 'hider') return;
    const t = now(); if (t - p.lastTaunt < TAUNT_CD - CD_SLACK) return;
    p.lastTaunt = t; p.score += 2;
    const tm = JSON.stringify({ t: 'taunt', id: p.id, x: r2(p.x), z: r2(p.z) });
    for (const q of room.players.values()) if (q !== p && !hideGate(room, q, p)) { q.reveal.set(p.id, t + REVEAL_S); if (q.ws.readyState === 1) q.ws.send(tm); } // a taunt is a sound the whole room hears (not blind seekers in the hide phase)
  },
  shoot(p, m) { // authoritative blaster: validate, rewind hiders to what the shooter saw, raycast hiders and world, apply economy
    const room = p.room;
    if (!room || room.mode !== 'prophunt' || room.phase !== 'seek' || p.role !== 'seeker' || p.out || p.hp <= 0) return;
    const ox = num(m.ox, -40, 40), oy = num(m.oy, -1, 10), oz = num(m.oz, -40, 40), dx = num(m.dx, -1.5, 1.5), dy = num(m.dy, -1.5, 1.5), dz = num(m.dz, -1.5, 1.5);
    if ([ox, oy, oz, dx, dy, dz].includes(null)) return;
    const len = Math.hypot(dx, dy, dz);
    if (Math.abs(len - 1) > 0.05) return;                                              // direction must be a unit vector
    if (Math.hypot(ox - p.x, oz - p.z) > ORIGIN_TOL || oy < p.y || oy > p.y + 2.2) return sendAmmo(p); // origin near where the seeker really is
    // the shooter saw hiders (one-way trip + its own interpolation delay `d`, claimed by the client and clamped to 0.2 s) in the past, and the shot
    // took another one-way trip to get here: rewind by rtt + d, never more than MAX_REWIND (250 ms)
    const rewind = Math.min(PR.MAX_REWIND, p.rtt + (num(m.d, 0, 0.2) ?? 0));
    if (!fireShot(room, p, ox, oy, oz, dx / len, dy / len, dz / len, Date.now() - rewind * 1000)) sendAmmo(p);
  },
  reload(p) {
    const room = p.room;
    if (!room || room.mode !== 'prophunt' || room.phase !== 'seek' || p.role !== 'seeker' || p.out) return;
    if (p.reloadEnd || p.mag >= MAG || p.res <= 0) return sendAmmo(p);
    startReload(p);
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
    if (Math.hypot(target.x - p.x, target.z - p.z) > TAG_RANGE || Math.abs(target.y - p.y) > 1.5) return;
    const los = NAVS[room.map].losClear, ey = p.y + 1.5 * (1 - 0.35 * p.c); // no tagging through walls: same body-point test as interest management
    if (!los(p.x, ey, p.z, target.x, target.y + 0.5, target.z) && !los(p.x, ey, p.z, target.x, target.y + 1.3 * (1 - 0.35 * target.c), target.z)) return;
    doTag(room, p, target);
  },
  noise(p, m) { // a cue only goes to players within hearing range, and the maker's position is revealed to them for a moment
    const room = p.room;
    if (!room || room.phase === 'lobby' || (m.k !== 'sprint' && m.k !== 'land' && m.k !== 'scrape')) return;
    const t = Date.now();
    if (t - p.lastNoise < 200) return;
    p.lastNoise = t;
    const s = now(), msg = { t: 'noise', id: p.id, k: m.k, x: r2(p.x), z: r2(p.z) };
    for (const q of room.players.values()) {
      if (q === p || Math.hypot(q.x - p.x, q.z - p.z) > NOISE_RANGE || hideGate(room, q, p)) continue;
      q.reveal.set(p.id, s + REVEAL_S);
      if (q.bot) botHear(room, q, p.x, p.z); else send(q, msg);
    }
  },
};

const ipOf = (req) => (process.env.TRUST_PROXY || process.env.RAILWAY_ENVIRONMENT ? String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() : '') || req.socket.remoteAddress || '';
wss.on('connection', (ws, req) => {
  const ip = ipOf(req);
  let n = 0; for (const w of wss.clients) if (w.ip === ip) n++;
  if (n >= MAX_CONNS_PER_IP) { ws.close(1013, "too many connections"); return; } // (this socket is not counted yet)
  ws.ip = ip;
  const conn = { p: newPlayer(ws) };
  conn.p.ip = ip;
  const helloTimer = setTimeout(() => { if (!conn.p.ok) ws.terminate(); }, HELLO_MS); // sockets that never say hello are not kept
  ws.on('close', () => clearTimeout(helloTimer));
  ws.conn = conn; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', (e) => console.warn('ws error', e.message));
  ws.on('close', (code) => {
    try {
      const p = conn.p;
      if (p.ws !== ws) return; // this socket was already replaced by a reconnect
      // 1006 = the link died without a close frame (network drop, killed tab, sleeping phone): in a live round keep the seat for the
      // reconnect window. A close frame (the player pressed leave or closed the page) frees the seat at once.
      if (code === 1006 && p.room && (p.room.phase === 'hide' || p.room.phase === 'seek')) {
        p.disc = Date.now(); broadcast(p.room, { t: 'conn', id: p.id, on: false }, p);
      } else { leaveRoom(p); if (!p.room) liveIds.delete(p.id); }
    } catch (e) { console.error('close handler error', e); }
  });
  ws.on('message', (raw, isBinary) => {
    ws.alive = true;
    const p = conn.p;
    // token bucket: 60 msgs/s sustained, bursts of 120
    const t = Date.now();
    p.tokens = Math.min(120, p.tokens + ((t - p.tokT) / 1000) * 60); p.tokT = t;
    if (p.tokens < 1) return;
    p.tokens--;
    if (isBinary || raw.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m !== 'object' || typeof m.t !== 'string') return;
    if (!p.ok && m.t !== 'hello') return refuse(p); // a client that skips hello is an older build
    const h = Object.hasOwn(handlers, m.t) ? handlers[m.t] : null;
    if (!h) return;
    if (HEAVY.has(m.t)) { // separate, much smaller budget for handlers that allocate or search
      p.heavy = Math.min(12, (p.heavy ?? 12) + ((t - (p.heavyT || t)) / 1000) * 2); p.heavyT = t;
      if (p.heavy < 1) return send(p, { t: 'err', msg: 'Slow down' });
      p.heavy--;
    }
    try { h(p, m, conn); } catch (e) { console.error('handler error', m.t, e); }
  });
});

// heartbeat: drop sockets that did not answer the previous ping (covers sockets not in a room too)
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.alive === false) { ws.terminate(); continue; }
    ws.alive = false; ws.ping();
  }
}, 15000).unref();
// app-level ping every second: the client echoes it (`pong`) so the server knows each player's rtt for lag compensation
setInterval(() => {
  for (const ws of wss.clients) { const p = ws.conn?.p; if (p?.ok) sendPing(p); }
}, 1000).unref();
setInterval(() => { try { sampleHistory(); } catch (e) { console.error('history error', e); } }, 1000 / 30).unref();

const port = process.env.PORT || 3000;
// the shared modules (colliders + prop table per map, nav, protocol) are ES modules; load them all before accepting connections
Promise.all([import('../src/shared/worlddata.js'), import('../src/shared/protocol.js'), import('../src/shared/nav.js')]).then(([m, proto, nav]) => {
  PR = proto; MAPS = m.MAPS; WORLDS = {}; NAVS = {}; BOTSPOTS = {};
  for (const [id, map] of Object.entries(MAPS)) {
    WORLDS[id] = { ...m.buildWorld({}, id), meta: map.meta, spawns: map.spawns, rayBox: m.rayBox };
    NAVS[id] = nav.createNav(WORLDS[id].colliders); NAVS[id].buildNav();
    const reach = NAVS[id].reachableFrom(map.meta.seekerStart.x, map.meta.seekerStart.z);
    BOTSPOTS[id] = map.spots.filter((s) => map.meta.trusted || reach(s.x, s.z)); // same sealed-pocket filter as the client AI
  }
  if (!fs.existsSync(path.join(ROOT, 'index.html'))) console.warn('dist/ is missing: run `npm run build` (only /ws and /health will work)');
  server.listen(port, () => console.log(`Hide & Seek on http://localhost:${port} (${Object.entries(WORLDS).map(([id, w]) => `${id}: ${w.colliders.length} colliders, ${w.props.length} props`).join('; ')})`));
}).catch((e) => { console.error('failed to load src/shared', e); process.exit(1); });
