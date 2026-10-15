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
const COLORS = [0xff5a5f, 0x4cc9f0, 0xffd166, 0x80ed99, 0xc77dff, 0xff924c, 0x2ec4b6, 0xf15bb5];
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// open spots in the garden / yard that don't overlap the world's colliders
const SPAWNS = [[0, 12], [-6, 10], [-4, 16], [6, 9], [12, 6], [-12, 8], [16, 0], [-16, -4], [0, -14], [10, -18], [-8, -10], [18, 16], [-18, 16], [-20, -14]];

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
  const list = [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, total: p.total }));
  for (const p of room.players.values()) send(p, { t: 'room', code: room.code, you: p.id, host: room.hostId, phase: room.phase, players: list });
}

// ======================================================================
// rooms and rounds
// ======================================================================
function joinRoom(p, room) {
  const used = new Set([...room.players.values()].map((q) => q.color));
  p.color = COLORS.find((c) => !used.has(c)) ?? COLORS[0];
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
  const spots = shuffle(SPAWNS.slice());
  const spawns = [];
  ps.forEach((p, i) => {
    p.role = i < nSeek ? 'seeker' : 'hider';
    p.score = 0; p.tags = 0; p.lastTag = 0;
    if (p.role === 'seeker') { p.x = (i - (nSeek - 1) / 2) * 1.4; p.z = 7.8; p.yaw = 0; }
    else { const [x, z] = spots[(i - nSeek) % spots.length]; p.x = x; p.z = z; p.yaw = Math.random() * Math.PI * 2; }
    p.y = 0; p.pitch = 0; p.c = 0;
    spawns.push({ id: p.id, x: p.x, z: p.z, yaw: r2(p.yaw) });
  });
  room.phase = 'hide';
  room.phaseEnd = now() + HIDE_SECS;
  broadcast(room, { t: 'round', seekers: ps.slice(0, nSeek).map((p) => p.id), spawns, hide: HIDE_SECS, seek: SEEK_SECS });
}

function endRound(room, winner) {
  if (room.phase !== 'hide' && room.phase !== 'seek') return;
  for (const p of room.players.values()) {
    if (winner === 'hiders' && p.role === 'hider') p.score += 5;
    p.total += p.score;
  }
  const players = [...room.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, role: p.role, score: p.score, total: p.total, tags: p.tags }))
    .sort((a, b) => b.score - a.score);
  room.phase = 'lobby';
  for (const p of room.players.values()) p.role = null;
  broadcast(room, { t: 'end', winner, players });
  sendRoom(room);
}

// end the round if the roster can no longer play it
function checkRound(room) {
  if (room.phase !== 'hide' && room.phase !== 'seek') return;
  if (!hidersOf(room).length) endRound(room, 'seekers');
  else if (!seekersOf(room).length) endRound(room, 'hiders');
}

function tickRoom(room, t) {
  if (room.phase !== 'hide' && room.phase !== 'seek') return;
  if (room.phase === 'hide' && t >= room.phaseEnd) {
    room.phase = 'seek'; room.phaseEnd = t + SEEK_SECS; room.nextAward = t + 10;
    broadcast(room, { t: 'phase', phase: 'seek', tl: SEEK_SECS });
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
setInterval(() => { const t = now(); for (const room of rooms.values()) tickRoom(room, t); }, TICK_MS);

// ======================================================================
// websocket
// ======================================================================
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

const handlers = {
  create(p, m) {
    if (p.room) leaveRoom(p);
    p.name = cleanName(m.name);
    const room = { code: newCode(), players: new Map(), hostId: 0, phase: 'lobby', phaseEnd: 0, nextAward: 0 };
    rooms.set(room.code, room);
    joinRoom(p, room);
  },
  join(p, m) {
    const code = typeof m.code === 'string' ? m.code.toUpperCase() : '';
    const room = /^[A-Z]{4}$/.test(code) ? rooms.get(code) : null;
    if (!room) return send(p, { t: 'err', msg: 'Room not found' });
    if (p.room === room) return;
    if (room.phase !== 'lobby') return send(p, { t: 'err', msg: 'Round in progress, try again in a moment' });
    if (room.players.size >= MAX_PLAYERS) return send(p, { t: 'err', msg: 'Room is full' });
    if (p.room) leaveRoom(p);
    p.name = cleanName(m.name);
    joinRoom(p, room);
  },
  leave(p) { leaveRoom(p); },
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
    const x = num(m.x, -24, 24), y = num(m.y, 0, 8), z = num(m.z, -24, 24), yaw = num(m.yaw, -1e4, 1e4), pitch = num(m.pitch, -1.6, 1.6), c = num(m.c, 0, 1);
    if (x === null || y === null || z === null || yaw === null || pitch === null || c === null) return;
    p.lastPos = t;
    p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.pitch = pitch; p.c = c;
  },
  tag(p, m) {
    const room = p.room;
    if (!room || room.phase !== 'seek' || p.role !== 'seeker') return;
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
    if (!room || room.phase === 'lobby' || (m.k !== 'sprint' && m.k !== 'land')) return;
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
  ws.on('error', () => {});
  ws.on('close', () => leaveRoom(p));
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
server.listen(port, () => console.log(`Hide & Seek on http://localhost:${port}`));
