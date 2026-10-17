// New maps over the wire: the host sets each map, round.map matches, hider spawns come from that map's spawn list, the seeker starts at its seekerStart,
// and a wall on that map blocks a shot (the impact point is the wall, not the far side). Run via `npm run test:server` (HIDE_SECS=1 SEEK_SECS=20).
const WebSocket = require('ws');
const URL = process.env.URL || `ws://localhost:${process.env.PORT || 3457}/ws`;
let pass = 0, fail = 0;
const ok = (c, name) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(label) {
  const ws = new WebSocket(URL), log = [], waiters = [], c = { label, ws, log, id: 0 };
  ws.on('message', (d) => { const m = JSON.parse(d); log.push(m); if (m.t === 'room') c.id = m.you; for (const w of [...waiters]) if (w.f(m)) { waiters.splice(waiters.indexOf(w), 1); w.r(m); } });
  c.open = new Promise((r) => ws.on('open', r));
  c.send = (t, d) => ws.send(JSON.stringify({ t, ...d }));
  c.wait = (f, ms = 4000) => new Promise((res, rej) => {
    const hit = log.find(f); if (hit) { log.splice(log.indexOf(hit), 1); return res(hit); }
    const w = { f, r: (m) => { log.splice(log.indexOf(m), 1); res(m); } }; waiters.push(w);
    setTimeout(() => rej(new Error(`${label}: timeout`)), ms);
  });
  return c;
}
(async () => {
  const WD = await import('../../src/shared/worlddata.js');
  for (const id of ['school', 'museum', 'funfair', 'office']) {
    console.log('--- ' + id);
    const map = WD.MAPS[id]; if (!map) { ok(false, `${id} is registered`); continue; }
    const world = WD.buildWorld(undefined, id), ss = map.meta.seekerStart;
    const A = client('A'), B = client('B'); await Promise.all([A.open, B.open]);
    A.send('create', { name: 'Host' }); const room = await A.wait((m) => m.t === 'room');
    B.send('join', { name: 'Guest', code: room.code }); await A.wait((m) => m.t === 'room' && m.players.length === 2);
    A.send('mode', { mode: 'prophunt' }); await A.wait((m) => m.t === 'room' && m.mode === 'prophunt');
    A.send('map', { map: id });
    ok((await B.wait((m) => m.t === 'room' && m.map === id)).map === id, `host sets map ${id}: room.map broadcast`);
    A.send('start');
    const r = await A.wait((m) => m.t === 'round');
    ok(r.map === id, `round.map is ${id}`);
    const seeker = [A, B].find((c) => c.id === r.seekers[0]);
    const hs = r.spawns.find((s) => s.id !== seeker.id), sk = r.spawns.find((s) => s.id === seeker.id);
    ok(map.spawns.some(([x, z]) => Math.abs(x - hs.x) < 0.01 && Math.abs(z - hs.z) < 0.01), `hider spawn (${hs.x}, ${hs.z}) is one of ${id}'s spawns`);
    ok(Math.hypot(sk.x - ss.x, sk.z - ss.z) < 0.01, `seeker starts at ${id}'s seekerStart`);
    await seeker.wait((m) => m.t === 'phase' && m.phase === 'seek', 5000);
    // wall test: pick the horizontal direction whose nearest collider is a tall wall within 25 m
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let d = Infinity, hit = null;
      for (const c of world.colliders) { const t = WD.rayBox(sk.x, 1.5, sk.z, dx, 0, dz, c); if (t > 0.1 && t < d) { d = t; hit = c; } }
      if (hit && hit.y1 >= 2 && hit.y0 <= 0.5 && d > 1.5 && d < 25 && (!best || d > best.d)) best = { dx, dz, d };
    }
    ok(!!best, `${id}: found a wall within 25 m of the seeker`);
    if (best) {
      seeker.send('shoot', { ox: sk.x, oy: 1.5, oz: sk.z, dx: best.dx, dy: 0, dz: best.dz });
      const shot = await seeker.wait((m) => m.t === 'shot');
      const got = Math.hypot(shot.x - sk.x, shot.z - sk.z);
      ok(shot.hit === 0 && Math.abs(got - best.d) < 0.2, `${id}: shot stopped by the wall at ${best.d.toFixed(2)} m (impact ${got.toFixed(2)} m)`);
    }
    A.ws.close(); B.ws.close(); await sleep(100);
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
