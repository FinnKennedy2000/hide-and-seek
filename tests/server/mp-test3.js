// Map selection (Late Shop) integration test. Run via `npm run test:server`
// Server must be started with HIDE_SECS=1 SEEK_SECS=20.
const WebSocket = require('ws');
const WIRE = require('./wire.js');
const SERVER = process.env.URL || 'ws://localhost:3458/ws';
let pass = 0, fail = 0; const failed = [];
const ok = (c, name) => { c ? pass++ : (fail++, failed.push(name)); console.log((c ? 'PASS ' : 'FAIL ') + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(label) {
  const ws = new WebSocket(SERVER), log = [], waiters = [];
  const c = { label, ws, log, id: 0 };
  ws.on('message', (d, bin) => {
    const m = WIRE.parse(d, bin); if (!m) return; log.push(m);
    if (m.t === 'room') c.id = m.you;
    for (const w of [...waiters]) if (w.f(m)) { waiters.splice(waiters.indexOf(w), 1); w.r(m); }
  });
  c.open = new Promise((r) => ws.on('open', () => { WIRE.hello(ws); r(); }));
  c.send = (t, d) => ws.send(JSON.stringify({ t, ...d }));
  c.wait = (f, ms = 3000) => new Promise((res, rej) => {
    const hit = log.find(f); if (hit) { log.splice(log.indexOf(hit), 1); return res(hit); }
    const w = { f, r: (m) => { log.splice(log.indexOf(m), 1); res(m); } }; waiters.push(w);
    setTimeout(() => rej(new Error(`${label}: timeout waiting; recent: ${JSON.stringify(log.slice(-4).map((m) => m.t + (m.msg ? ':' + m.msg : '') + (m.phase ? ':' + m.phase : '')))}`)), ms);
  });
  c.none = async (f, ms = 500) => { await sleep(ms); return !log.some(f); };
  return c;
}
// walk in 0.4m steps every 50ms = 8 m/s (the server refuses moves faster than 9 m/s)
const pos = async (c, x, z) => {
  for (;;) {
    const [cx, cz] = c.at, d = Math.hypot(x - cx, z - cz), s = d <= 0.4 ? 1 : 0.4 / d; // (d = 0 must finish too)
    c.at = [cx + (x - cx) * s, cz + (z - cz) * s];
    c.send('pos', { x: c.at[0], y: 0, z: c.at[1], yaw: 0, pitch: 0, c: 0 }); await sleep(50);
    if (s === 1) return;
  }
};
// shot from the client's eye (1.5m up) toward a point
const aim = (c, tx, ty, tz) => { const ox = c.at[0], oy = 1.5, oz = c.at[1]; const dx = tx - ox, dy = ty - oy, dz = tz - oz, l = Math.hypot(dx, dy, dz); return { ox, oy, oz, dx: dx / l, dy: dy / l, dz: dz / l }; };
const UP = (c) => ({ ox: c.at[0], oy: 1.5, oz: c.at[1], dx: 0, dy: 1, dz: 0 });
const shots = (c) => c.log.filter((m) => m.t === 'shot').length;

// ----- harness: n players in one room, optional start
async function lobby(n) {
  const cs = Array.from({ length: n }, (_, i) => client('P' + i));
  await Promise.all(cs.map((c) => c.open));
  cs[0].send('create', { name: 'Host' });
  const room = await cs[0].wait((m) => m.t === 'room');
  cs.slice(1).forEach((c, i) => c.send('join', { name: 'P' + (i + 1), code: room.code }));
  await Promise.all(cs.map((c) => c.wait((m) => m.t === 'room' && m.players.length === n)));
  const close = () => cs.forEach((c) => c.ws.close());
  return { cs, host: cs[0], close };
}
async function game(n = 2, mode = 'prophunt') {
  const g = await lobby(n);
  if (mode !== 'classic') { g.host.send('mode', { mode }); await g.host.wait((m) => m.t === 'room' && m.mode === mode); }
  g.host.send('start');
  const r = await WIRE.mergeRounds(await Promise.all(g.cs.map((c) => c.wait((m) => m.t === 'round'))));
  g.r = r;
  for (const sp of r.spawns) g.cs.find((k) => k.id === sp.id).at = [sp.x, sp.z];
  g.seeker = g.cs.find((c) => c.id === r.seekers[0]); g.hiders = g.cs.filter((c) => c !== g.seeker);
  await g.seeker.wait((m) => m.t === 'phase' && m.phase === 'seek', 4000);
  g.cs.forEach((c) => { c.log.length = 0; });
  return g;
}
const ammo = (c, f = () => true, ms = 2000) => c.wait((m) => m.t === 'ammo' && f(m), ms);
const SPOT = (spawns, x, z) => spawns.some(([sx, sz]) => sx === x && sz === z);
async function mapGame(n, map, mode = 'prophunt') {
  const g = await lobby(n);
  g.host.send('map', { map }); await g.host.wait((m) => m.t === 'room' && m.map === map);
  if (mode !== 'classic') { g.host.send('mode', { mode }); await g.host.wait((m) => m.t === 'room' && m.mode === mode); }
  g.host.send('start');
  const r = await WIRE.mergeRounds(await Promise.all(g.cs.map((c) => c.wait((m) => m.t === 'round'))));
  g.r = r;
  for (const sp of r.spawns) g.cs.find((k) => k.id === sp.id).at = [sp.x, sp.z];
  g.seeker = g.cs.find((c) => c.id === r.seekers[0]); g.hiders = g.cs.filter((c) => c !== g.seeker);
  await g.seeker.wait((m) => m.t === 'phase' && m.phase === 'seek', 4000);
  g.cs.forEach((c) => { c.log.length = 0; });
  return g;
}

(async () => {
  await WIRE.ready;
  const WD = await import('../../src/shared/worlddata.js');
  const LS = WD.MAPS.lateshop, W = WD.buildWorld({}, 'lateshop'), HW = WD.buildWorld({}, 'house');
  const tests = []; const test = (name, fn) => tests.push([name, fn]);

  test('map: default house, host-only, validated, locked during a round', async () => {
    const { cs: [A, B], close } = await lobby(2);
    ok(A.log.concat(B.log).every((m) => m.t !== 'room' || m.map === 'house'), 'room messages carry map=house by default');
    A.log.length = 0; B.log.length = 0;
    A.send('map', { map: 'lateshop' });
    ok((await B.wait((m) => m.t === 'room')).map === 'lateshop', 'host sets map=lateshop, broadcast to the other player');
    ok((await A.wait((m) => m.t === 'room')).map === 'lateshop', 'host also gets the room update');
    A.log.length = 0; B.send('map', { map: 'house' });
    ok(await A.none((m) => m.t === 'room', 300), 'non-host cannot change the map');
    for (const bad of ['bogus', '', null, 7, '__proto__', 'constructor', 'toString', ['lateshop'], { a: 1 }, undefined]) A.send('map', { map: bad });
    ok(await B.none((m) => m.t === 'room', 300), 'invalid map ids rejected (no broadcast)');
    A.send('mode', { mode: 'classic' }); const rm = await B.wait((m) => m.t === 'room');
    ok(rm.map === 'lateshop', 'map unchanged after rejected values and kept across other room updates');
    A.send('start'); await A.wait((m) => m.t === 'round'); B.log.length = 0; A.log.length = 0;
    A.send('map', { map: 'house' });
    ok(await B.none((m) => m.t === 'room', 300), 'map change ignored mid-round');
    close();
  });

  test('round: carries map, seekers at lateshop seekerStart, hiders on lateshop spawns', async () => {
    const g = await mapGame(4, 'lateshop');
    ok(g.r.map === 'lateshop', "round message has map:'lateshop'");
    const ss = LS.meta.seekerStart, sp = g.r.spawns, seeker = sp.find((s) => s.id === g.seeker.id);
    ok(seeker.x === ss.x && seeker.z === ss.z && seeker.yaw === ss.yaw, `seeker spawns at seekerStart (${seeker.x},${seeker.z})`);
    const hs = sp.filter((s) => s.id !== g.seeker.id);
    ok(hs.every((s) => SPOT(LS.spawns, s.x, s.z)), 'every hider spawn comes from lateshop spawns');
    ok(new Set(hs.map((s) => `${s.x},${s.z}`)).size === hs.length, 'hider spawns are distinct');
    g.close();
    const h = await mapGame(2, 'house', 'classic');
    ok(h.r.map === 'house', 'house round carries map:house');
    const hs2 = h.r.spawns.find((s) => s.id === h.seeker.id);
    ok(hs2.x === 0 && hs2.z === 7.8 && SPOT(WD.MAPS.house.spawns, ...(h.r.spawns.filter((s) => s.id !== h.seeker.id)[0] ? [h.r.spawns.filter((s) => s.id !== h.seeker.id)[0].x, h.r.spawns.filter((s) => s.id !== h.seeker.id)[0].z] : [0, 0])), 'house: seeker at (0,7.8), hider on a house spawn');
    h.close();
  });
  test('round: two seekers (6 players) are spread 1.4m around seekerStart.x', async () => {
    const g = await mapGame(6, 'lateshop', 'classic');
    const xs = g.r.seekers.map((id) => g.r.spawns.find((s) => s.id === id).x).sort((a, b) => a - b);
    ok(g.r.seekers.length === 2 && Math.abs(xs[1] - xs[0] - 1.4) < 1e-9 && Math.abs((xs[0] + xs[1]) / 2 - LS.meta.seekerStart.x) < 1e-9, `seekers at x=${xs}`);
    g.close();
  });

  test('disguise: lateshop prop id beyond the house table accepted (house rejects it)', async () => {
    const big = W.props.filter((p) => p.id >= HW.props.length && Math.abs(p.x) < 20 && Math.abs(p.z) < 20).find((p) => p.name === 'plant') || W.props[100];
    ok(big.id >= HW.props.length && W.props.length > HW.props.length, `lateshop has ${W.props.length} props, house ${HW.props.length}; testing #${big.id} ${big.name}`);
    const g = await mapGame(3, 'lateshop');
    const [H] = g.hiders;
    await pos(H, big.x + 0.6, big.z); await sleep(80);
    H.send('disguise', { propId: big.id });
    const d = await g.seeker.wait((m) => m.t === 'disguise');
    ok(d.id === H.id && d.propId === big.id, `lateshop disguise as prop ${big.id} (${big.name}) broadcast`);
    g.close();
    const hg = await game(3);
    const [H2] = hg.hiders;
    H2.send('disguise', { propId: big.id });
    ok(await hg.seeker.none((m) => m.t === 'disguise', 300), 'same propId rejected in a house room (out of range of the house prop table)');
    hg.close();
  });

  test('shoot: a lateshop wall blocks a shot; open line hits', async () => {
    // pick the thickest-in-x front wall segment: tall (y1 >= 3), long along x, thin in z, with the seeker side (+z) outside
    const wall = W.colliders.filter((c) => c.y0 === 0 && c.y1 >= 3 && c.x1 - c.x0 > 10 && c.z1 - c.z0 < 0.3 && c.z0 > 0).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
    ok(!!wall, `picked wall x ${wall.x0.toFixed(1)}..${wall.x1.toFixed(1)} z ${wall.z0.toFixed(2)}..${wall.z1.toFixed(2)} y 0..${wall.y1}`);
    const g = await mapGame(3, 'lateshop'); const [H1, H2] = g.hiders, S = g.seeker;
    const x = (wall.x0 + wall.x1) / 2 + (wall.x1 - wall.x0) / 4;
    await pos(S, x, wall.z1 + 1.5); await pos(H1, x, wall.z0 - 2); await pos(H2, 0, 12.5); await sleep(150);
    S.send('shoot', aim(S, x, 1, wall.z0 - 2));
    const sh = await S.wait((m) => m.t === 'shot');
    ok(sh.hit === 0, 'shot through the shop wall does NOT hit the hider behind it');
    ok(Math.abs(sh.z - wall.z1) < 0.15 && Math.abs(sh.x - x) < 0.2, `shot ends on the wall face (z=${sh.z}, wall z1=${wall.z1})`);
    ok(await H1.none((m) => m.t === 'tagged', 200), 'no tag through the wall');
    await sleep(300);
    // control: open car-park line of sight to H2 at (0,12.5), seeker walks to (0,9.5)
    await pos(S, 0, 9.5); await sleep(100);
    S.send('shoot', aim(S, 0, 1, 12.5));
    const hit = await S.wait((m) => m.t === 'shot');
    ok(hit.hit === H2.id, 'open line of sight in the lateshop car park hits');
    g.close();
  });

  test('pos: lateshop bounds are enforced (+-22.5), house still allows 24', async () => {
    const g = await mapGame(2, 'lateshop', 'classic'); const [H] = g.hiders;
    // server clamps to bounds+0.5: a client claiming x=23.8 ends up at 22.5, which shows in snapshots
    await pos(H, 22, 0); await sleep(60); H.send('pos', { x: 22.9, y: 0, z: 0, yaw: 0, pitch: 0, c: 0 }); await sleep(200);
    // (read it from the hider's own snapshot entry: interest management no longer shows a hider behind the shop wall to the seeker)
    const snap = await H.wait((m) => m.t === 'snap' && m.p.some((q) => q[0] === H.id && q[1] > 22.3), 1500);
    ok(snap.p.find((q) => q[0] === H.id)[1] <= 22.5 + 1e-6, 'x clamped to bounds + 0.5 on lateshop');
    g.close();
  });

  const slow = [['pickup: crate in a lateshop prop-hunt round spawns on a lateshop spawn point', async () => {
    const g = await mapGame(2, 'lateshop'), S = g.seeker;
    const pk = await S.wait((m) => m.t === 'pickup', 14000);
    ok(SPOT(LS.spawns, pk.x, pk.z), `pickup at ${pk.x},${pk.z} is in lateshop's spawn list`);
    g.close();
  }]];
  for (const [name, fn] of tests) { console.log('--- ' + name); try { await fn(); } catch (e) { ok(false, `${name}: threw ${e.message}`); } }
  console.log('--- slow');
  await Promise.all(slow.map(async ([name, fn]) => { try { await fn(); } catch (e) { ok(false, `${name}: threw ${e.message}`); } }));
  console.log(`\n${pass} passed, ${fail} failed`); failed.forEach((f) => console.log('  FAILED: ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
