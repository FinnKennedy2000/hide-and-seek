// Trial mode on the authoritative server: map rules, personal fuses -> gates -> escape, hit -> injured -> caged -> rescue, grass concealment, alerts.
// Runs its own server (TRIAL_STUB injects a `trial` block into the house map, so this works before / without coldwood).
const WebSocket = require('ws');
const http = require('node:http');
const WIRE = require('./wire.js');
let pass = 0, fail = 0;
const ok = (c, name) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function spawnServer(env) {
  const { spawn } = require('node:child_process'), net = require('node:net'), path = require('node:path');
  return new Promise((res, rej) => {
    const probe = net.createServer(); probe.listen(0, () => {
      const port = probe.address().port; probe.close(() => {
        const child = spawn('node', [path.join(__dirname, '..', '..', 'server', 'index.js')], { env: { ...process.env, ...env, PORT: String(port) }, stdio: 'ignore' });
        const t0 = Date.now(), tryUp = () => http.get(`http://localhost:${port}/health`, (r) => { r.resume(); res({ url: `ws://localhost:${port}/ws`, kill: () => child.kill('SIGTERM') }); }).on('error', () => (Date.now() - t0 > 8000 ? rej(new Error('server did not start')) : setTimeout(tryUp, 150)));
        tryUp();
      });
    });
  });
}

function client(url, label) {
  const ws = new WebSocket(url), log = [], waiters = [];
  const c = { label, ws, log, id: 0, at: [0, 0], seq: 0, snaps: [] };
  ws.on('message', (d, bin) => {
    const m = WIRE.parse(d, bin); if (!m) return;
    if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', s: m.s }));
    if (m.t === 'snap') c.snaps.push(m);
    log.push(m);
    if (m.t === 'room') c.id = m.you;
    for (const w of [...waiters]) if (w.f(m)) { waiters.splice(waiters.indexOf(w), 1); w.r(m); }
  });
  c.open = new Promise((r) => ws.on('open', () => { WIRE.hello(ws); r(); }));
  c.send = (t, d) => ws.send(JSON.stringify({ t, ...d }));
  c.wait = (f, ms = 5000) => new Promise((res, rej) => {
    const hit = log.find(f); if (hit) { log.splice(log.indexOf(hit), 1); return res(hit); }
    const w = { f, r: (m) => { log.splice(log.indexOf(m), 1); res(m); } }; waiters.push(w);
    setTimeout(() => rej(new Error(`${label}: timeout; recent: ${JSON.stringify(log.slice(-5).map((m) => m.t + (m.msg ? ':' + m.msg : '')))}`)), ms);
  });
  c.pos = (x, z, cr = 0, yaw = 0) => { c.at = [x, z]; c.seq = (c.seq + 1) & 0xffff; c.send('pos', { s: c.seq, x, y: 0, z, yaw, pitch: 0, c: cr }); };
  c.walk = async (x, z, speed = 5, gap = 50) => { // never faster than 5 m/s: the server drops moves above 9
    for (;;) {
      const [cx, cz] = c.at, d = Math.hypot(x - cx, z - cz), step = speed * gap / 1000, s = d <= step ? 1 : step / d;
      c.pos(cx + (x - cx) * s, cz + (z - cz) * s); await sleep(gap);
      if (s === 1) return;
    }
  };
  return c;
}
async function lobby(url, n, keepMap) {
  const cs = Array.from({ length: n }, (_, i) => client(url, 'P' + i));
  await Promise.all(cs.map((c) => c.open));
  cs[0].send('create', { name: 'Host' });
  const room = await cs[0].wait((m) => m.t === 'room');
  cs.slice(1).forEach((c, i) => c.send('join', { name: 'P' + (i + 1), code: room.code }));
  await Promise.all(cs.map((c) => c.wait((m) => m.t === 'room' && m.players.length === n)));
  if (!keepMap && room.map !== 'house') { cs[0].send('map', { map: 'house' }); await Promise.all(cs.map((c) => c.wait((m) => m.t === 'room' && m.map === 'house'))); }
  return { cs, room };
}
async function startRound(cs) {
  cs[0].send('start');
  const rounds = await Promise.all(cs.map((c) => c.wait((m) => m.t === 'round'))), r = { ...rounds[0], spawns: [...new Map(rounds.flatMap((x) => x.spawns).map((sp) => [sp.id, sp])).values()] };
  for (const sp of r.spawns) { const c = cs.find((k) => k.id === sp.id); c.at = [sp.x, sp.z]; }
  const seeker = cs.find((c) => c.id === r.seekers[0]), hiders = cs.filter((c) => c !== seeker);
  await Promise.all(cs.map((c) => c.wait((m) => m.t === 'phase' && m.phase === 'seek')));
  return { r, seeker, hiders };
}

(async () => {
  await WIRE.ready;
  const WD = await import('../../src/shared/worlddata.js'), NAV = await import('../../src/shared/nav.js');
  const world = WD.buildWorld({}, 'house'), nav = NAV.createNav(world.colliders);
  const sp = WD.MAPS.house.spawns, bd = WD.MAPS.house.meta.bounds;
  const stub = { relics: sp.slice(0, 8), gates: [sp[8], sp[9]], cages: sp.slice(10, 14), grass: [{ x0: bd.x0, x1: bd.x1, z0: bd.z0, z1: bd.z1 }], vaults: [], hiderSpawns: sp, seekerStart: { x: 0, z: 7.8, yaw: 0 } };
  const srv = await spawnServer({ DEFAULT_MODE: 'trial', TRIAL_STUB: JSON.stringify(stub), HIDE_SECS: '1', SEEK_SECS: '180', MAX_ROOMS_PER_IP: '1000', MAX_ROOMS: '1000', MAX_CONNS_PER_IP: '1000', MAX_BOTS: '1000' });
  const all = [];
  try {
    // a point `d` metres from (x,z) with a clear line of sight to it (the server's two-body-point visibility test)
    const spotAt = (x, z, d) => {
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos(a * Math.PI / 8) * d, pz = z + Math.sin(a * Math.PI / 8) * d;
        if (px > bd.x0 && px < bd.x1 && pz > bd.z0 && pz < bd.z1 && nav.losClear(px, 1.5, pz, x, 0.5, z) && nav.losClear(px, 1.5, pz, x, 1.3, z)) return [px, pz];
      }
      throw new Error(`no clear spot ${d} m from ${x},${z}`);
    };
    const face = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])); // yaw whose forward (-sin, -cos) points at `to`

    // each listed hider walks to relic site q and installs it for themselves (fuses are personal: every hider can install every site once)
    const install = async (hs, q) => {
      await Promise.all(hs.map((c) => c.walk(q.x, q.z)));
      hs.forEach((c) => c.send('interact', { k: 'start', what: 'relic', i: q.i }));
      return Promise.all(hs.map((c) => c.wait((m) => m.t === 'collected' && m.i === q.i && m.by === c.id, 10000)));
    };

    // ===== 1. map / mode rules
    {
      const { cs, room } = await lobby(srv.url, 2, true); all.push(...cs);
      const r0 = room;
      ok(r0.mode === 'trial' && r0.trialMaps.includes(r0.map) && r0.trialMaps.includes('house'), `new rooms default to trial on a trial-capable map (${r0.map}); trialMaps ${JSON.stringify(r0.trialMaps)}`);
      cs[0].send('map', { map: 'lateshop' });
      const e = await cs[0].wait((m) => m.t === 'err').catch(() => null);
      ok(!!e, 'a map without `trial` is rejected in trial mode');
      cs[0].send('mode', { mode: 'classic' }); await cs[0].wait((m) => m.t === 'room' && m.mode === 'classic');
      cs[0].send('map', { map: 'lateshop' }); await cs[0].wait((m) => m.t === 'room' && m.map === 'lateshop');
      cs[0].send('mode', { mode: 'trial' });
      const sw = await cs[0].wait((m) => m.t === 'room' && m.mode === 'trial');
      ok(sw.map === r0.trialMaps[r0.trialMaps.includes('coldwood') ? r0.trialMaps.indexOf('coldwood') : 0], `switching to trial on a non-trial map moves to a trial map (${sw.map})`);
      cs[0].send('map', { map: 'lateshop' });
      cs[0].send('cls', { cls: 'nope' }); cs[0].send('cls', { cls: 'tracker' });
      cs[1].send('mode', { mode: 'trial' });
      await sleep(200);
    }

    // ===== 2. relics -> gates -> escape, alerts to the seeker
    {
      const { cs } = await lobby(srv.url, 3); all.push(...cs);
      cs.forEach((c) => c.send('cls', { cls: 'trapper' })); await sleep(300);
      const { r, seeker, hiders } = await startRound(cs);
      const [A, B] = hiders;
      ok(r.mode === 'trial' && r.relics.length === 6 && r.gates.length === 2 && r.cages.length === 4 && r.need === 3 && r.cls === 'trapper' && r.grass.length === 1, 'round carries 6 relics, gates, cages, grass, need 3 and the seeker class');
      const far = r.relics.map((q) => ({ q, d: Math.hypot(q.x - A.at[0], q.z - A.at[1]) })).sort((a, b) => b.d - a.d)[0].q;
      A.send('interact', { k: 'start', what: 'relic', i: far.i });
      await sleep(700);
      ok(!A.log.some((m) => m.t === 'prog'), 'interact from out of range makes no progress');
      ok(A.log.some((m) => m.t === 'chanx' && m.what === 'relic' && m.i === far.i), 'a refused interact start is answered with chanx');
      A.send('interact', { k: 'stop', what: 'relic', i: far.i });
      // both hiders install the same site together: each gets their own credit, their own bars, their own alert
      const [a0, b0] = await install([A, B], r.relics[0]);
      ok(a0.n === 1 && b0.n === 1, 'two hiders can both install the same site and each gets personal credit (n 1 and 1)');
      const alerts = seeker.log.filter((m) => m.t === 'alert' && m.kind === 'relic');
      ok(alerts.length === 2 && alerts.every((m) => m.x === r.relics[0].x && m.z === r.relics[0].z), 'seeker is alerted at the site once per install');
      ok(seeker.log.filter((m) => m.t === 'collected').length === 2, 'the seeker is told of each install (collected goes to everyone)');
      ok(!A.log.some((m) => m.t === 'alert' && m.kind === 'relic'), 'hiders get no relic alert');
      await install([A, B], r.relics[1]); await install([A, B], r.relics[2]);
      const gA = await A.wait((m) => m.t === 'gates' && m.open, 3000), gB = await B.wait((m) => m.t === 'gates' && m.open, 3000);
      ok(!!gA && !!gB && !!(await seeker.wait((m) => m.t === 'alert' && m.kind === 'gate')), 'gates power for each hider at their own third fuse + gate alert to the seeker');
      await Promise.all([A.walk(r.gates[0].x, r.gates[0].z), B.walk(r.gates[1].x, r.gates[1].z)]);
      A.send('interact', { k: 'start', what: 'gate', i: 0 }); B.send('interact', { k: 'start', what: 'gate', i: 1 });
      const esc = await Promise.all([A, B].map((c) => c.wait((m) => m.t === 'hurt' && m.st === 'escaped' && m.id === c.id, 6000)));
      ok(esc.length === 2, 'both hiders escape through the gates');
      const end = await seeker.wait((m) => m.t === 'end', 6000);
      ok(end.winner === 'hiders' && end.mode === 'trial' && end.escaped === 2 && end.players.filter((p) => p.st === 'escaped').length === 2, `end: hiders win, escaped ${end.escaped}`);
    }

    // ===== 3. hit -> injured -> hit -> caged -> rescue
    {
      const { cs } = await lobby(srv.url, 3); all.push(...cs);
      const { r, seeker, hiders } = await startRound(cs);
      const [A, B] = hiders, tgt = [...A.at];
      const pt = spotAt(tgt[0], tgt[1], 1.3);
      await seeker.walk(pt[0], pt[1], 6);
      const yaw = face(pt, tgt);
      seeker.pos(pt[0], pt[1], 0, yaw); await sleep(200);
      const terror = await A.wait((m) => m.t === 'terror' && m.k > 0, 3000).catch(() => null);
      ok(!!terror, `hider gets a terror message when the seeker is close (k ${terror && terror.k})`);
      seeker.send('swing');
      const sw = await A.wait((m) => m.t === 'swing', 3000);
      ok(sw.by === seeker.id && sw.hit === A.id, 'swing hits the hider in front');
      ok((await A.wait((m) => m.t === 'hurt' && m.id === A.id)).st === 'injured', 'first hit: injured');
      seeker.send('swing'); await sleep(400);
      ok(seeker.log.filter((m) => m.t === 'swing').length === 1, 'a swing during the cooldown is ignored');
      await sleep(900);
      seeker.pos(pt[0], pt[1], 0, yaw); seeker.send('swing');
      const caged = await A.wait((m) => m.t === 'hurt' && m.id === A.id && m.st === 'caged');
      ok(Number.isInteger(caged.cage) && caged.cage >= 0 && caged.cage < 4, `second hit: caged in cage ${caged.cage}`);
      const cg = r.cages[caged.cage];
      await B.walk(cg.x, cg.z);
      B.send('interact', { k: 'start', what: 'cage', i: caged.cage });
      const t0 = Date.now(), free = await B.wait((m) => m.t === 'hurt' && m.id === A.id && m.st === 'injured' && m.rescued === 1, 8000);
      ok(!!free && Date.now() - t0 > 3000, `rescue takes ~4 s (${Date.now() - t0} ms) and frees the hider (hurt injured, rescued:1)`);
      seeker.send('swing'); // wrong place: seeker is far from the freed hider now, nothing to hit
      await sleep(100);
    }

    // ===== 4. grass concealment (server-side visibility)
    {
      const { cs } = await lobby(srv.url, 2); all.push(...cs);
      const { seeker, hiders } = await startRound(cs), H = hiders[0], hp = [...H.at];
      const seenH = (from) => seeker.snaps.slice(from).some((s) => s.p.some((e) => e[0] === H.id && !(e[7] & 1)));
      for (let i = 0; i < 12; i++) { H.pos(hp[0], hp[1], 1); await sleep(100); } // crouched and still
      const from = seeker.snaps.length, p6 = spotAt(hp[0], hp[1], 6), p2 = spotAt(hp[0], hp[1], 2);
      await seeker.walk(p6[0], p6[1], 6);
      for (let i = 0; i < 8; i++) { H.pos(hp[0], hp[1], 1); seeker.pos(p6[0], p6[1]); await sleep(100); }
      ok(!seenH(from), 'crouched still hider in grass at 6 m is not in the seeker snapshots (LOS clear)');
      let n0 = seeker.snaps.length;
      H.pos(hp[0], hp[1], 0); await sleep(100); H.pos(hp[0], hp[1], 0);
      for (let i = 0; i < 6; i++) { seeker.pos(p6[0], p6[1]); await sleep(100); }
      ok(seenH(n0), 'the same hider standing up is seen at 6 m');
      H.pos(hp[0], hp[1], 1); for (let i = 0; i < 8; i++) { H.pos(hp[0], hp[1], 1); await sleep(100); }
      n0 = seeker.snaps.length;
      await seeker.walk(p2[0], p2[1], 4);
      for (let i = 0; i < 6; i++) { H.pos(hp[0], hp[1], 1); seeker.pos(p2[0], p2[1]); await sleep(100); }
      ok(seenH(n0), 'crouched still hider is seen at 2 m');
    }

    // ===== 5. per-hider objective loop: personal gates (0/1/2 fuses never escape), no double install, alert ttl / no tracking, exposed, reset between rounds
    {
      const { cs } = await lobby(srv.url, 3); all.push(...cs);
      const { r, seeker, hiders } = await startRound(cs), [A, B] = hiders;
      const count = (c, f) => c.log.filter(f).length;
      const tryGate = async (label) => { // A walks to a gate and holds it for longer than GATE_S
        await A.walk(r.gates[0].x, r.gates[0].z);
        const n0 = count(A, (m) => m.t === 'hurt' && m.st === 'escaped' && m.id === A.id);
        A.send('interact', { k: 'start', what: 'gate', i: 0 }); await sleep(3800);
        A.send('interact', { k: 'stop', what: 'gate', i: 0 });
        ok(count(A, (m) => m.t === 'hurt' && m.st === 'escaped' && m.id === A.id) === n0 && !A.log.some((m) => m.t === 'gates') && !A.log.some((m) => m.t === 'prog' && m.what === 'gate') && A.log.some((m) => m.t === 'chanx' && m.what === 'gate'), `${label}: A cannot channel or escape through a gate`);
        A.log.length = 0;
      };
      await tryGate('0 fuses');
      // B alone installs three sites: B's gates power, A's do not
      const [b0] = await install([B], r.relics[0]);
      const al = await seeker.wait((m) => m.t === 'alert' && m.kind === 'relic', 2000);
      ok(b0.n === 1 && al.ttl === 6 && al.x === r.relics[0].x && al.z === r.relics[0].z, `alert carries the site location at install time and ttl ${al.ttl}`);
      ok(!!(await B.wait((m) => m.t === 'exposed' && m.ttl === 6, 2000).catch(() => null)) && !A.log.some((m) => m.t === 'exposed'), 'only the installer gets `exposed {ttl}`');
      // B cannot install the same site twice
      seeker.log.length = 0; B.log.length = 0;
      B.send('interact', { k: 'start', what: 'relic', i: 0 }); await sleep(1500);
      ok(count(seeker, (m) => m.t === 'collected') === 0 && count(seeker, (m) => m.t === 'alert' && m.kind === 'relic') === 0 && B.log.some((m) => m.t === 'chanx' && m.what === 'relic' && m.i === 0), 'a hider cannot install the same site twice (refused, no count, no alert)');
      // the installer walks away: the seeker never gets an updated position
      seeker.log.length = 0; await B.walk(r.relics[0].x + 6, r.relics[0].z + 6); await sleep(600);
      ok(count(seeker, (m) => m.t === 'alert') === 0, 'no alert follows the installer afterwards');
      await install([B], r.relics[1]); const [b2] = await install([B], r.relics[2]);
      ok(b2.n === 3 && !!(await B.wait((m) => m.t === 'gates' && m.open, 2000)) && !A.log.some((m) => m.t === 'gates'), 'B reaches 3 fuses: B gets gates {open}, A does not');
      // A with 0 / 1 / 2 personal fuses cannot escape even though B has 3
      await tryGate('0 fuses (teammate has 3)');
      await install([A], r.relics[0]); await tryGate('1 fuse (teammate has 3)');
      await install([A], r.relics[1]); await tryGate('2 fuses (teammate has 3)');
      // a site B already finished is still open to A; A's third fuse powers A's gate
      const [a2] = await install([A], r.relics[2]);
      ok(a2.n === 3 && !!(await A.wait((m) => m.t === 'gates' && m.open, 2000)), 'A reaches 3 fuses of their own: A gets gates {open}');
      // escaping still needs the physical channel
      const g = r.gates[1]; await B.walk(g.x, g.z); await sleep(800);
      ok(!B.log.some((m) => m.t === 'hurt' && m.st === 'escaped' && m.id === B.id), 'standing at a powered gate without channelling does not escape');
      await A.walk(r.gates[0].x, r.gates[0].z);
      A.send('interact', { k: 'start', what: 'gate', i: 0 }); B.send('interact', { k: 'start', what: 'gate', i: 1 });
      await Promise.all([A, B].map((c) => c.wait((m) => m.t === 'hurt' && m.st === 'escaped' && m.id === c.id, 6000)));
      await seeker.wait((m) => m.t === 'end', 6000); await sleep(300);
      // ---- new round: everything is reset
      cs.forEach((c) => { c.log.length = 0; c.snaps.length = 0; });
      const r2 = await startRound(cs), [A2] = r2.hiders;
      ok(r2.r.relics.length === 6 && !A2.log.some((m) => m.t === 'gates' || m.t === 'collected' || m.t === 'alert'), 'new round: no gates powered, no collected / alert state carried over');
      const g0 = r2.r.gates[0]; await A2.walk(g0.x, g0.z);
      A2.send('interact', { k: 'start', what: 'gate', i: 0 }); await sleep(3800);
      ok(!A2.log.some((m) => m.t === 'hurt' && m.st === 'escaped'), 'new round: gates are closed again (0 fuses)');
      const [c1] = await install([A2], r2.r.relics[0]);
      ok(c1.n === 1, 'new round: fuse count restarts at 1');
    }
    { // load gate: a client that opted in with hello {gate:true} holds the round until it says `ready`
      const { cs } = await lobby(srv.url, 2); all.push(...cs);
      for (const c of cs) c.ws.send(JSON.stringify({ t: 'hello', protocol: WIRE.P.PROTOCOL, gate: true }));
      cs[0].send('start');
      await Promise.all(cs.map((c) => c.wait((m) => m.t === 'round')));
      await sleep(2500); // HIDE_SECS is 1: without the gate the seek phase would be on by now
      ok(!cs.some((c) => c.log.some((m) => m.t === 'phase' && m.phase === 'seek')), 'load gate: no seek phase while a client has not said ready');
      ok(!cs.some((c) => c.snaps.length), 'load gate: no snapshots while held');
      cs[0].send('ready'); await sleep(500);
      ok(!cs.some((c) => c.log.some((m) => m.t === 'phase' && m.phase === 'seek')), 'load gate: still held with one client unready');
      cs[1].send('ready');
      await Promise.all(cs.map((c) => c.wait((m) => m.t === 'phase' && m.phase === 'seek', 4000)));
      ok(true, 'load gate: seek phase starts once everyone is ready');
    }
  } catch (e) { ok(false, 'trial test crashed: ' + e.message); }
  finally { all.forEach((c) => c.ws.terminate()); srv.kill(); }
  console.log(`${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
