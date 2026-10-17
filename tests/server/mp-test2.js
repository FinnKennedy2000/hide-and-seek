// Prop Hunt + lobby integration test. Run via `npm run test:server` (needs a server: HIDE_SECS=1 SEEK_SECS=20)
// Server must be started with HIDE_SECS=1 SEEK_SECS=20.
const WebSocket = require('ws');
const SERVER = process.env.URL || 'ws://localhost:3458/ws';
let pass = 0, fail = 0; const failed = [];
const ok = (c, name) => { c ? pass++ : (fail++, failed.push(name)); console.log((c ? 'PASS ' : 'FAIL ') + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(label) {
  const ws = new WebSocket(SERVER), log = [], waiters = [];
  const c = { label, ws, log, id: 0 };
  ws.on('message', (d) => {
    const m = JSON.parse(d); log.push(m);
    if (m.t === 'room') c.id = m.you;
    for (const w of [...waiters]) if (w.f(m)) { waiters.splice(waiters.indexOf(w), 1); w.r(m); }
  });
  c.open = new Promise((r) => ws.on('open', r));
  c.send = (t, d) => ws.send(JSON.stringify({ t, ...d }));
  c.wait = (f, ms = 3000) => new Promise((res, rej) => {
    const hit = log.find(f); if (hit) { log.splice(log.indexOf(hit), 1); return res(hit); }
    const w = { f, r: (m) => { log.splice(log.indexOf(m), 1); res(m); } }; waiters.push(w);
    setTimeout(() => rej(new Error(`${label}: timeout waiting; recent: ${JSON.stringify(log.slice(-4).map((m) => m.t + (m.msg ? ':' + m.msg : '') + (m.phase ? ':' + m.phase : '')))}`)), ms);
  });
  c.none = async (f, ms = 500) => { await sleep(ms); return !log.some(f); };
  return c;
}
// walk in <=0.8m steps every 45ms (server drops moves faster than ~9 m/s)
const pos = async (c, x, z) => {
  for (;;) {
    const [cx, cz] = c.at, d = Math.hypot(x - cx, z - cz), s = Math.min(1, 0.8 / (d || 1));
    c.at = [cx + (x - cx) * s, cz + (z - cz) * s];
    c.send('pos', { x: c.at[0], y: 0, z: c.at[1], yaw: 0, pitch: 0, c: 0 }); await sleep(45);
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
  const r = (await Promise.all(g.cs.map((c) => c.wait((m) => m.t === 'round'))))[0];
  g.r = r;
  for (const sp of r.spawns) g.cs.find((k) => k.id === sp.id).at = [sp.x, sp.z];
  g.seeker = g.cs.find((c) => c.id === r.seekers[0]); g.hiders = g.cs.filter((c) => c !== g.seeker);
  await g.seeker.wait((m) => m.t === 'phase' && m.phase === 'seek', 4000);
  g.cs.forEach((c) => { c.log.length = 0; });
  return g;
}
const ammo = (c, f = () => true, ms = 2000) => c.wait((m) => m.t === 'ammo' && f(m), ms);

(async () => {
  const WD = await import('../../src/shared/worlddata.js');
  const world = WD.buildWorld();
  const { HATS, OUTFITS } = await import('../../src/characters/character.js').catch(() => ({ HATS: ['none', 'cap', 'beanie', 'bucket', 'crown'], OUTFITS: ['plain', 'stripes', 'dots', 'overalls'] }));
  const lamp = world.props.find((p) => p.name === 'lamp post');
  const tests = [];
  const test = (name, fn) => tests.push([name, fn]);

  // ======================= lobby =======================
  test('lobby: mode select (host ok, non-host ignored, invalid rejected)', async () => {
    const { cs: [A, B], close } = await lobby(2);
    const first = await A.wait((m) => m.t === 'room' && m.mode, 100).catch(() => null); void first;
    A.log.length = 0; B.log.length = 0;
    A.send('mode', { mode: 'prophunt' });
    ok((await B.wait((m) => m.t === 'room')).mode === 'prophunt', 'host sets mode=prophunt, room msg broadcast');
    B.send('mode', { mode: 'classic' }); A.log.length = 0;
    ok(await A.none((m) => m.t === 'room' && m.mode === 'classic', 300), 'non-host cannot change mode');
    for (const bad of ['bogus', '', null, 7, '__proto__']) A.send('mode', { mode: bad });
    ok(await B.none((m) => m.t === 'room' && m.mode !== 'prophunt', 300), 'invalid mode rejected (mode unchanged)');
    A.send('mode', { mode: 'classic' });
    ok((await B.wait((m) => m.t === 'room')).mode === 'classic', 'host can switch back to classic');
    close();
  });
  test('lobby: cosmetics synced / invalid rejected / locked during round', async () => {
    const { cs: [A, B], close } = await lobby(2);
    A.log.length = 0; B.log.length = 0;
    A.send('cosmetic', { hat: HATS[2], outfit: OUTFITS[3] });
    const rm = await B.wait((m) => m.t === 'room');
    const a = rm.players.find((p) => p.id === A.id);
    ok(a.hat === HATS[2] && a.outfit === OUTFITS[3], `cosmetics synced to other player (${a.hat}/${a.outfit})`);
    B.log.length = 0; A.log.length = 0;
    A.send('cosmetic', { hat: 'sombrero' }); A.send('cosmetic', { outfit: 42 }); A.send('cosmetic', { hat: { a: 1 } }); A.send('cosmetic', {});
    ok(await B.none((m) => m.t === 'room', 300), 'invalid cosmetics not broadcast');
    ok(A.log.some((m) => m.t === 'err'), 'invalid cosmetic gets an err reply (or is at least ignored)');
    A.send('cosmetic', { hat: HATS[1] });
    const rm2 = await B.wait((m) => m.t === 'room');
    const a2 = rm2.players.find((p) => p.id === A.id);
    ok(a2.hat === HATS[1] && a2.outfit === OUTFITS[3], 'valid partial update keeps the other field');
    A.send('start'); await A.wait((m) => m.t === 'round'); B.log.length = 0;
    A.send('cosmetic', { hat: 'crown' });
    ok(await B.none((m) => m.t === 'room', 300), 'cosmetic change ignored mid-round');
    close();
  });

  // ======================= disguise =======================
  test('disguise: broadcast, invalid rejected, cooldown, range, seeker/classic ignored', async () => {
    const g = await game(3);
    const [H, H2] = g.hiders, S = g.seeker;
    await pos(H, lamp.x + 1, lamp.z); await sleep(80);
    H.send('disguise', { propId: lamp.id });
    const d = await S.wait((m) => m.t === 'disguise');
    ok(d.id === H.id && d.propId === lamp.id, `valid disguise broadcast to others (prop ${lamp.id} ${lamp.name})`);
    ok(H.log.some((m) => m.t === 'disguise') || await H.wait((m) => m.t === 'disguise', 500).then(() => true, () => false), 'disguise also echoed to the disguiser');
    S.log.length = 0;
    H.send('disguise', { propId: null }); // inside cooldown
    ok(await S.none((m) => m.t === 'disguise', 400), 'cooldown enforced (revert within 3s dropped)');
    await sleep(3000); S.log.length = 0;
    H.send('disguise', { propId: null });
    ok((await S.wait((m) => m.t === 'disguise')).propId === null, 'revert (propId null) allowed after cooldown');
    // invalid ids: never consume cooldown, never broadcast
    for (const bad of [9999, -1, 1.5, 'x', undefined, {}, [0]]) H2.send('disguise', { propId: bad });
    ok(await S.none((m) => m.t === 'disguise' && m.id === H2.id, 400), 'invalid propId (oob, negative, float, string, missing) rejected');
    H2.send('disguise', { propId: lamp.id }); // H2 is wherever it spawned: far from lamp unless unlucky
    const far = Math.hypot(H2.at[0] - lamp.x, H2.at[1] - lamp.z) > 12;
    if (far) ok(await S.none((m) => m.t === 'disguise' && m.id === H2.id, 300), 'disguise as a far-away prop rejected');
    S.send('disguise', { propId: lamp.id });
    ok(await H.none((m) => m.t === 'disguise' && m.id === S.id, 300), 'seeker cannot disguise');
    g.close();
  });
  test('disguise: ignored in classic mode', async () => {
    const g = await game(2, 'classic'); const [H] = g.hiders;
    await pos(H, lamp.x + 1, lamp.z); H.send('disguise', { propId: lamp.id });
    ok(await g.seeker.none((m) => m.t === 'disguise', 300), 'classic: disguise ignored');
    g.close();
  });

  // ======================= shooting =======================
  test('shoot: LOS hit tags hider, refunds ammo, seekers win when all tagged', async () => {
    const g = await game(3); const [H1, H2] = g.hiders, S = g.seeker;
    await pos(H1, 0, 14); await pos(H2, 6, 9); await sleep(120);
    S.send('shoot', aim(S, 0, 1, 14));
    const sh = await H2.wait((m) => m.t === 'shot'), tg = await H2.wait((m) => m.t === 'tagged');
    ok(sh.by === S.id && sh.hit === H1.id, 'shot broadcast with hit=hider id');
    ok(tg.by === S.id && tg.target === H1.id && tg.hl === 1, 'tagged broadcast, hidersLeft=1');
    const am = await ammo(S);
    ok(am.mag === 5 && am.res === 18 && am.hp === 100, `hit refunds a full mag, no hp loss (mag ${am.mag} res ${am.res} hp ${am.hp})`);
    await ammo(H1, (m) => m.mag === 6).then(() => ok(true, 'tagged hider becomes seeker with a magazine'), () => ok(false, 'tagged hider becomes seeker with a magazine'));
    await sleep(300);
    S.send('shoot', aim(S, 6, 1, 9));
    const end = await S.wait((m) => m.t === 'end');
    ok(end.winner === 'seekers', 'all hiders tagged -> seekers win');
    g.close();
  });
  test('shoot: wall blocks the shot, miss costs health', async () => {
    const g = await game(3); const [H1] = g.hiders, S = g.seeker;
    // front wall of the house is z=6 (solid for x in 1..8); seeker outside at z=7.8, hider inside
    await pos(S, 4, 7.8); await pos(H1, 4, 4.5); await sleep(150);
    S.send('shoot', aim(S, 4, 1, 4.5));
    const sh = await S.wait((m) => m.t === 'shot');
    ok(sh.hit === 0, 'shot through a wall does NOT hit');
    ok(sh.z > 5.8 && sh.z < 6.4, `shot ends at the wall (z=${sh.z})`);
    const am = await ammo(S);
    ok(am.hp < 100 && am.mag === 5 && am.res === 12, `miss costs hp and a round (hp ${am.hp} mag ${am.mag})`);
    ok(await H1.none((m) => m.t === 'tagged', 200), 'no tag');
    g.close();
  });
  test('shoot: fire rate limit', async () => {
    const g = await game(2), S = g.seeker;
    S.send('shoot', UP(S)); S.send('shoot', UP(S)); S.send('shoot', UP(S));
    await sleep(150);
    ok(shots(S) === 1, `burst of 3 within the fire gap -> 1 shot (${shots(S)})`);
    await sleep(300); S.send('shoot', UP(S)); await sleep(150);
    ok(shots(S) === 2, 'after the gap another shot is allowed');
    g.close();
  });
  test('shoot: ammo limit, reload, no shooting while reloading', async () => {
    const g = await game(2), S = g.seeker;
    for (let i = 0; i < 6; i++) { S.send('shoot', UP(S)); await sleep(290); }
    ok(shots(S) === 6, 'mag of 6 fires 6 shots');
    S.send('shoot', UP(S)); await sleep(200);
    ok(shots(S) === 6, '7th shot with empty mag rejected');
    S.log.length = 0; S.send('reload');
    ok((await ammo(S)).rl === 1, 'reload starts (rl=1)');
    S.send('shoot', UP(S)); await sleep(150);
    ok(shots(S) === 0, 'cannot shoot while reloading');
    const am = await ammo(S, (m) => m.mag > 0, 3000);
    ok(am.mag === 6 && am.res === 6, `reload completes: mag ${am.mag} res ${am.res}`);
    await sleep(300); S.send('shoot', UP(S)); await sleep(150);
    ok(shots(S) === 1, 'shooting works after reload');
    S.log.length = 0; S.send('reload'); // mag 5/6, res 6 -> allowed; full mag is the reject case, covered below
    await sleep(1500); S.log.length = 0; S.send('reload');
    ok(!(await S.none((m) => m.t === 'ammo', 300)), 'reload with a full mag answered with an ammo resync');
    g.close();
  });
  test('shoot: origin >3.5m from seeker rejected', async () => {
    const g = await game(2), S = g.seeker;
    const far = { ...UP(S), ox: S.at[0] + 5 }, near = { ...UP(S), ox: S.at[0] + 1 };
    S.send('shoot', far); await sleep(200);
    ok(shots(S) === 0, 'origin 5m away rejected');
    S.send('shoot', { ...UP(S), oy: 5 }); await sleep(200);
    ok(shots(S) === 0, 'origin 3.5m above rejected');
    S.send('shoot', near); await sleep(200);
    ok(shots(S) === 1, 'origin 1m away accepted');
    S.log.length = 0; await sleep(300);
    S.send('shoot', { ...UP(S), dx: 0, dy: 3, dz: 0 }); S.send('shoot', { ...UP(S), dy: NaN });
    await sleep(300);
    ok(shots(S) === 0, 'non-unit / bad direction rejected');
    ok((await ammo(S, () => true, 300).then(() => false, () => true)), 'rejected shots send no ammo update');
    g.close();
  });
  test('shoot: hider and classic-mode shots ignored', async () => {
    const g = await game(2), H = g.hiders[0];
    H.send('shoot', UP(H)); await sleep(200);
    ok(!g.seeker.log.some((m) => m.t === 'shot'), 'hider cannot shoot');
    g.close();
    const c = await game(2, 'classic'); c.seeker.send('shoot', UP(c.seeker)); await sleep(200);
    ok(!c.seeker.log.some((m) => m.t === 'shot'), 'classic mode: shoot ignored');
    c.close();
  });

  // ======================= win conditions / pickup (slow: run in parallel) =======================
  const slow = [];
  slow.push(['win: hiders win on timer', async () => {
    const g = await game(3), S = g.seeker;
    const t0 = Date.now();
    const end = await S.wait((m) => m.t === 'end', 26000);
    ok(end.winner === 'hiders', `timer expiry -> hiders win (after ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    ok(end.players.filter((p) => p.role === 'hider').every((p) => p.score >= 5), 'surviving hiders get the win bonus');
    g.close();
  }]);
  slow.push(['win: hiders win when every seeker is out of health', async () => {
    const g = await game(3), S = g.seeker;
    let outSeen = false;
    S.wait((m) => m.t === 'out', 30000).then(() => { outSeen = true; }, () => {});
    for (let i = 0; i < 18; i++) {
      if (S.log.some((m) => m.t === 'end')) break;
      if (i === 6 || i === 12) { S.send('reload'); await sleep(1500); }
      S.send('shoot', UP(S)); await sleep(290);
    }
    const end = await S.wait((m) => m.t === 'end', 3000).catch(() => null);
    ok(end && end.winner === 'hiders', `seeker at 0 hp -> hiders win (${end && end.winner})`);
    ok(outSeen, "'out' broadcast when the seeker hits 0 hp");
    g.close();
  }]);
  slow.push(['pickup: crate spawns mid-seek, grab range enforced, refills reserve once', async () => {
    const g = await game(2), S = g.seeker;
    const pk = await S.wait((m) => m.t === 'pickup', 14000);
    ok(Number.isFinite(pk.x) && Number.isFinite(pk.z), `pickup spawned at ${pk.x},${pk.z}`);
    S.log.length = 0; S.send('grab');
    ok(await S.none((m) => m.t === 'picked', 300), 'grab from far away rejected');
    await pos(S, pk.x, pk.z); await sleep(100);
    S.send('grab');
    const p = await S.wait((m) => m.t === 'picked'), am = await ammo(S);
    ok(p.by === S.id && am.res === 18, `grab in range works: res ${am.res} (12+6)`);
    S.log.length = 0; S.send('grab');
    ok(await S.none((m) => m.t === 'picked', 300), 'crate only once per round');
    g.close();
  }]);

  for (const [name, fn] of tests) {
    console.log('--- ' + name);
    try { await fn(); } catch (e) { ok(false, `${name}: threw ${e.message}`); }
  }
  console.log('--- slow scenarios (parallel)');
  await Promise.all(slow.map(async ([name, fn]) => { try { await fn(); } catch (e) { ok(false, `${name}: threw ${e.message}`); } }));
  console.log(`\n${pass} passed, ${fail} failed`); failed.forEach((f) => console.log('  FAILED: ' + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
