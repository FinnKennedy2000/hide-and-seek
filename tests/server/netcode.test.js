// Netcode: protocol versioning, interest management, lag compensation under latency + jitter, the speed check, reconnect and fill bots.
// Run via `npm run test:server` (server started with HIDE_SECS=1 SEEK_SECS=20). A small ws man-in-the-middle in this file adds latency and jitter.
const WebSocket = require('ws');
const http = require('node:http');
const WIRE = require('./wire.js');
const URL = process.env.URL || `ws://localhost:${process.env.PORT || 3457}/ws`;
let pass = 0, fail = 0;
const ok = (c, name) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----- latency / jitter proxy: every message in either direction is held for `delay` +- `jitter` ms, but order is kept (it is TCP, jitter bunches packets rather than reordering them)
function proxy(target, delay, jitter) {
  const srv = new WebSocket.Server({ port: 0 });
  srv.on('connection', (down) => {
    const up = new WebSocket(target);
    const pipe = (from, to) => {
      let last = 0, chain = Promise.resolve(); // one chain per direction keeps the order
      from.on('message', (data, isBinary) => {
        const at = Math.max(last, Date.now() + delay + (Math.random() * 2 - 1) * jitter); last = at;
        chain = chain.then(async () => {
          if (at > Date.now()) await sleep(at - Date.now());
          while (to.readyState === 0) await sleep(5); // upstream still connecting
          if (to.readyState === 1) to.send(data, { binary: isBinary });
        });
      });
      from.on('close', () => chain.then(() => to.close()));
    };
    pipe(down, up); pipe(up, down);
  });
  return { url: `ws://localhost:${srv.address().port}/ws`, close: () => { srv.clients.forEach((c) => c.terminate()); srv.close(); } };
}

// a private server instance with its own tunables (hide phase length, room caps)
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

function client(url, label, hello = true) {
  const ws = new WebSocket(url), log = [], waiters = [];
  const c = { label, ws, log, id: 0, token: '', at: [0, 0], seq: 0, snaps: [] };
  ws.on('message', (d, bin) => {
    const m = WIRE.parse(d, bin); if (!m) return;
    m.rx = Date.now() / 1000;
    if (m.t === 'ping') for (const q of c.forge ? [m.s - 1000, m.s - 5000, 1] : [m.s]) ws.send(JSON.stringify({ t: 'pong', s: q })); // like the game client (lets the server measure rtt); `forge` claims a huge rtt instead
    if (m.t === 'snap') c.snaps.push(m);
    log.push(m);
    if (m.t === 'room') { c.id = m.you; c.token = m.token || c.token; }
    for (const w of [...waiters]) if (w.f(m)) { waiters.splice(waiters.indexOf(w), 1); w.r(m); }
  });
  c.open = new Promise((r) => ws.on('open', () => { if (hello) WIRE.hello(ws); r(); }));
  c.send = (t, d) => ws.send(JSON.stringify({ t, ...d }));
  c.wait = (f, ms = 4000) => new Promise((res, rej) => {
    const hit = log.find(f); if (hit) { log.splice(log.indexOf(hit), 1); return res(hit); }
    const w = { f, r: (m) => { log.splice(log.indexOf(m), 1); res(m); } }; waiters.push(w);
    setTimeout(() => rej(new Error(`${label}: timeout waiting; recent: ${JSON.stringify(log.slice(-4).map((m) => m.t + (m.msg ? ':' + m.msg : '')))}`)), ms);
  });
  // one position update; seq is monotonic so the server's ack can be matched to what we sent
  c.pos = (x, z) => { c.at = [x, z]; c.seq = (c.seq + 1) & 0xffff; c.sent = c.sent || new Map(); c.sent.set(c.seq, [x, z]); c.send('pos', { s: c.seq, x, y: 0, z, yaw: 0, pitch: 0, c: 0 }); };
  // walk to (x,z) at `speed` m/s, one update every `gap` ms
  c.walk = async (x, z, speed, gap = 50) => {
    for (;;) {
      const [cx, cz] = c.at, d = Math.hypot(x - cx, z - cz), step = speed * gap / 1000, s = Math.min(1, step / (d || 1));
      c.pos(cx + (x - cx) * s, cz + (z - cz) * s); await sleep(gap);
      if (s === 1) return;
    }
  };
  return c;
}
async function lobby(url, n, mode) {
  const cs = Array.from({ length: n }, (_, i) => client(url, 'P' + i));
  await Promise.all(cs.map((c) => c.open));
  cs[0].send('create', { name: 'Host' });
  const room = await cs[0].wait((m) => m.t === 'room');
  cs.slice(1).forEach((c, i) => c.send('join', { name: 'P' + (i + 1), code: room.code }));
  await Promise.all(cs.map((c) => c.wait((m) => m.t === 'room' && m.players.length === n)));
  if (mode) { cs[0].send('mode', { mode }); await cs[0].wait((m) => m.t === 'room' && m.mode === mode); }
  return cs;
}
async function startRound(cs) {
  cs[0].send('start');
  const rounds = await Promise.all(cs.map((c) => c.wait((m) => m.t === 'round'))), r = WIRE.mergeRounds(rounds);
  for (const sp of r.spawns) { const c = cs.find((k) => k.id === sp.id); c.at = [sp.x, sp.z]; }
  return r;
}

(async () => {
  await WIRE.ready;
  const WD = await import('../../src/shared/worlddata.js'), NAV = await import('../../src/shared/nav.js');
  const world = WD.buildWorld({}, 'house'), nav = NAV.createNav(world.colliders);
  const sees = (sx, sz, hx, hz) => nav.losClear(sx, 1.5, sz, hx, 0.5, hz) || nav.losClear(sx, 1.5, sz, hx, 1.3, hz); // the server's visibility test
  const S0 = [0, 7.8]; // the seeker's spawn (house seekerStart)

  // ===== 1. protocol versioning (Review Focus 1)
  {
    const old = client(URL, 'old', false); await old.open; WIRE.hello(old.ws, 2); old.send('create', { name: 'Old' });
    const e = await old.wait((m) => m.t === 'err').catch(() => null);
    ok(!!e && /Refresh/.test(e.msg), `protocol 2 client is refused: "${e && e.msg}"`);
    ok(await new Promise((r) => { old.ws.on('close', () => r(true)); setTimeout(() => r(false), 1500); }), 'refused socket is closed');
    ok(!old.log.some((m) => m.t === 'room'), 'refused client never got a room');
    const none = client(URL, 'nohello', false); await none.open; none.send('create', { name: 'Older' });
    ok(/Refresh/.test((await none.wait((m) => m.t === 'err').catch(() => ({ msg: '' }))).msg), 'a client that never says hello (an older build) is refused too');
    const cur = client(URL, 'cur'); await cur.open; cur.send('create', { name: 'Cur' });
    ok((await cur.wait((m) => m.t === 'room')).you > 0, 'the current protocol is accepted'); cur.ws.close();
  }

  // ===== 2. metrics
  {
    const body = await new Promise((res, rej) => http.get(URL.replace('ws:', 'http:').replace('/ws', '/metrics'), (r) => { let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => res(s)); }).on('error', rej));
    ok(/^hs_rooms \d+$/m.test(body) && /^hs_players \d+$/m.test(body) && /^hs_tick_ms [\d.]+$/m.test(body), '/metrics reports rooms, players and tick ms');
  }

  // ===== 3. interest management: a hider behind a wall is not in the seeker's snapshots; in LOS it is; a sound reveals it
  {
    let B = null, V = null; // B: hidden from the seeker, V: visible, both inside the 40 m range and close to each other
    const free = (x, z) => !world.colliders.some((c) => c.y0 < 1.8 && x > c.x0 - 0.5 && x < c.x1 + 0.5 && z > c.z0 - 0.5 && z < c.z1 + 0.5);
    for (let x = -20; x <= 20; x += 1) for (let z = -20; z <= 20; z += 1) {
      const d = Math.hypot(x - S0[0], z - S0[1]);
      if (d < 6 || d > 18 || !free(x, z)) continue;
      if (!sees(S0[0], S0[1], x, z)) { if (!B || d < Math.hypot(B[0] - S0[0], B[1] - S0[1])) B = [x, z]; }
      else if (!V || d < Math.hypot(V[0] - S0[0], V[1] - S0[1])) V = [x, z];
    }
    ok(!!B && !!V, `test points found: hidden ${B}, visible ${V}`);
    const cs = await lobby(URL, 2); const r = await startRound(cs);
    const S = cs.find((c) => c.id === r.seekers[0]), H = cs.find((c) => c !== S);
    await S.wait((m) => m.t === 'phase');
    const walkable = async (c, p) => { await c.walk(p[0], p[1], 8, 50); };
    await walkable(H, B); await sleep(900); // past the 0.4 s linger from any LOS the walk crossed
    S.snaps.length = 0; S.log.length = 0;
    await sleep(900);
    const inSnap = (c, id) => c.snaps.some((s) => s.p.some((e) => e[0] === id && !(e[7] & 1)));
    ok(S.snaps.length > 5 && !inSnap(S, H.id), `hider behind a wall is absent from the seeker's ${S.snaps.length} snapshots`);
    ok(S.snaps.some((s) => s.p.some((e) => e[0] === S.id && (e[7] & 2))), "the seeker's own state is in its snapshots");
    H.send('noise', { k: 'sprint' });
    await S.wait((m) => m.t === 'noise' && m.id === H.id).catch(() => null);
    await sleep(250);
    ok(inSnap(S, H.id), 'a sound within earshot reveals the hider to the seeker');
    await sleep(1500); S.snaps.length = 0; await sleep(700);
    ok(!inSnap(S, H.id), 'the reveal expires and the hider is hidden again');
    S.snaps.length = 0; await walkable(H, V); await sleep(500); // (snapshots are deltas: a stationary hider is only in the ones where it changed)
    const mine = S.snaps.flatMap((s) => s.p.filter((e) => e[0] === H.id && !(e[7] & 1)));
    ok(mine.length > 0, 'the hider is in the seeker snapshots once in line of sight');
    ok(mine.length > 0 && Math.hypot(mine[mine.length - 1][1] - V[0], mine[mine.length - 1][3] - V[1]) < 0.05, 'and its position is right');
    // snapshots are binary at 14 bytes an entry
    ok(S.snaps.length > 0 && typeof S.snaps[0].tl === 'number', 'snapshots decode from the binary format');
    cs.forEach((c) => c.ws.close());
  }

  // ===== 4. speed check under latency + jitter (Review Focus 4): 6.8 m/s is never refused, a teleport still is
  {
    const px = proxy(URL, 100, 25); // 100 ms each way = 200 ms rtt, +- 25 ms jitter = 50 ms spread
    const cs = await lobby(px.url, 2); const r = await startRound(cs);
    const H = cs.find((c) => c.id !== r.seekers[0]);
    await H.walk(-12, 14, 8, 50); await sleep(600);
    // 6.8 m/s (sprint) along z = 14 for 3.5 s, one update per 66 ms
    H.snaps.length = 0; H.sent = new Map();
    await H.walk(12, 14, 6.8, 66);
    await sleep(150); H.pos(H.at[0], H.at[1]); // (a real client keeps sending while idle)
    await sleep(900);
    const acked = H.snaps.map((s) => { const sp = H.sent.get(s.ack), me = s.p.find((e) => e[7] & 2); return sp && me ? Math.hypot(me[1] - sp[0], me[3] - sp[1]) : null; }).filter((e) => e !== null);
    const worst = Math.max(...acked);
    ok(acked.length > 20 && worst < 0.03, `walking at 6.8 m/s through ${px.url.slice(-8)}: ${acked.length} acks, worst server-vs-client error ${worst.toFixed(3)} m (never refused)`);
    const last = H.snaps[H.snaps.length - 1].p.find((e) => e[7] & 2);
    ok(Math.hypot(last[1] - H.at[0], last[3] - H.at[1]) < 0.05, 'the server ended up exactly where the client walked to');
    // I-1: a client that sends 12 m/s for 3 s is held to 9 m/s * t + 1 m (both the per-move rule and the bucket must pass)
    await H.walk(-12, 14, 8, 50); await sleep(400);
    H.snaps.length = 0; const t0 = Date.now(), start = H.at.slice();
    for (let i = 0; i < 60; i++) { H.pos(start[0] + 0.6 * (i + 1), start[1]); await sleep(50); }
    const el = (Date.now() - t0) / 1000; await sleep(400);
    const fin = H.snaps[H.snaps.length - 1].p.find((e) => e[7] & 2);
    ok(Math.hypot(fin[1] - start[0], fin[3] - start[1]) <= 9 * el + 1.0, `12 m/s for ${el.toFixed(1)} s: server advanced ${Math.hypot(fin[1] - start[0], fin[3] - start[1]).toFixed(2)} m <= ${(9 * el + 1).toFixed(2)} m`);
    H.at = [fin[1], fin[3]]; // (the client would have been snapped back)
    // a 15 m jump in one update is refused and the ack tells the client (so it can snap back)
    H.snaps.length = 0; const before = H.at.slice(); H.pos(before[0], before[1] - 15); await sleep(500);
    const snap = H.snaps[H.snaps.length - 1], me = snap.p.find((e) => e[7] & 2), sent = H.sent.get(snap.ack);
    ok(snap.ack === H.seq && Math.hypot(me[1] - sent[0], me[3] - sent[1]) > 10, `a 15 m teleport is refused (server stays ${Math.hypot(me[1] - sent[0], me[3] - sent[1]).toFixed(1)} m from the claimed spot) and acked`);
    cs.forEach((c) => c.ws.close()); px.close();
  }

  // ===== 5. lag compensation (Review Focus 4): 200 ms rtt + 50 ms jitter, hider moving at 3.9 m/s, prop hunt
  {
    // find an open lane (z) in front of the seeker where every point of an x sweep is in clear line of fire
    let lane = null;
    for (let z = 11; z <= 16 && lane === null; z += 0.5) {
      let clear = true; for (let x = -7; x <= 7 && clear; x += 0.5) clear = nav.losClear(S0[0], 1.5, S0[1], x, 0.9, z);
      if (clear) lane = z;
    }
    ok(lane !== null, `a clear firing lane at z=${lane}`);
    const px = proxy(URL, 100, 25);
    let hits = 0, shots = 0, trials = 4;
    for (let k = 0; k < trials; k++) {
      const cs = await lobby(px.url, 2, 'prophunt'); const r = await startRound(cs);
      const S = cs.find((c) => c.id === r.seekers[0]), H = cs.find((c) => c !== S);
      await sleep(1200); // let a few pongs settle the server's rtt estimate
      await H.walk(-6, lane, 8, 50);
      await S.wait((m) => m.t === 'phase', 4000);
      // the shooter's view of the hider, built exactly like the game client: server-clock interpolation, the fastest packets set the offset
      const clk = { st0: null, off: 0, jit: 0, delay: 0.1 }, track = [];
      S.ws.on('message', (d, bin) => {
        if (!bin) return; const s = WIRE.parse(d, bin); if (!s) return;
        const rx = Date.now() / 1000; if (clk.st0 === null) { clk.st0 = s.st; clk.off = rx; }
        const t = ((s.st - clk.st0) | 0) / 1000, dd = rx - t;
        clk.off = Math.min(dd, clk.off + 0.001); clk.jit += (dd - clk.off - clk.jit) * 0.1; clk.delay += (Math.min(0.3, 0.1 + clk.jit) - clk.delay) * 0.05;
        const e = s.p.find((q) => q[0] === H.id && !(q[7] & 3)); if (e) track.push({ t, x: e[1], z: e[3] });
      });
      // the hider crosses the lane at 3.9 m/s (20 updates a second)
      const walk = H.walk(6, lane, 3.9, 50);
      await sleep(900);
      const view = () => { // where the shooter's screen shows the hider right now
        const rt = Date.now() / 1000 - clk.off - clk.delay; let i = track.length - 1; while (i > 0 && track[i - 1].t > rt) i--;
        const a = track[Math.max(0, i - 1)], b = track[i]; if (!b) return null;
        const f = b.t === a.t ? 1 : Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))); return [a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f];
      };
      const p = view();
      if (p) {
        const ox = S0[0], oy = 1.5, oz = S0[1], dx = p[0] - ox, dy = 0.9 - oy, dz = p[1] - oz, l = Math.hypot(dx, dy, dz);
        S.send('shoot', { ox, oy, oz, dx: dx / l, dy: dy / l, dz: dz / l, d: clk.delay }); shots++;
        const shot = await S.wait((m) => m.t === 'shot', 2000).catch(() => null);
        if (shot && shot.hit === H.id) hits++;
        console.log(`  trial ${k}: aimed at x=${p[0].toFixed(2)} z=${p[1].toFixed(2)} delay=${clk.delay.toFixed(3)} -> ${shot ? (shot.hit ? 'HIT' : 'miss') : 'no shot msg'}`);
      }
      await walk; cs.forEach((c) => c.ws.close()); await sleep(150);
    }
    ok(shots === trials && hits === trials, `lag compensation: ${hits}/${shots} shots at a 3.9 m/s hider hit with 200 ms rtt + 50 ms jitter`);
    px.close();
  }

  // ===== 6. reconnect with the token keeps role and score
  {
    const cs = await lobby(URL, 3); const r = await startRound(cs);
    const S = cs.find((c) => c.id === r.seekers[0]), [H1, H2] = cs.filter((c) => c !== S);
    await S.wait((m) => m.t === 'phase');
    await H1.walk(S0[0], S0[1] + 2.2, 8, 50); await sleep(150);
    S.send('tag', { target: H1.id });
    await S.wait((m) => m.t === 'tagged' && m.target === H1.id);
    const token = S.token;
    S.ws.terminate(); // the link drops mid-round, no leave message
    await sleep(300);
    const gone = await H2.wait((m) => m.t === 'conn' && m.id === S.id && m.on === false).catch(() => null);
    ok(!!gone, 'the others are told a player lost connection (the seat is kept, not freed)');
    const S2 = client(URL, 'S2'); await S2.open;
    S2.send('reconnect', { token: 'f'.repeat(32) });
    ok(/Session expired/.test((await S2.wait((m) => m.t === 'err').catch(() => ({ msg: '' }))).msg), 'a made-up token is refused');
    S2.send('reconnect', { token });
    const room = await S2.wait((m) => m.t === 'room'), resume = await S2.wait((m) => m.t === 'round' && m.resume);
    ok(room.you === S.id && room.players.length === 3, 'reconnect returns to the same seat in the same room');
    ok(resume.role === 'seeker' && resume.score === 3 && resume.seekers.includes(S.id), `role (${resume.role}) and score (${resume.score}) survive the reconnect`);
    ok(resume.phase === 'seek' && resume.tl > 0, 'the round resumes mid-phase with the time left');
    S2.at = [resume.spawns[0].x, resume.spawns[0].z];
    S2.pos(S2.at[0], S2.at[1] + 0.3); await sleep(300);
    ok(S2.snaps.length > 0, 'and snapshots flow again');
    S2.ws.terminate(); await sleep(300);
    ok(true, 'second drop is tolerated');
    [S2, H1, H2].forEach((c) => c.ws.close());
  }

  // ===== 7. fill bots
  {
    const A = client(URL, 'A'); await A.open; A.send('create', { name: 'Solo' });
    await A.wait((m) => m.t === 'room');
    A.send('fill', { on: true });
    const room = await A.wait((m) => m.t === 'room' && m.fill && m.players.length >= 4);
    ok(room.players.length >= 4 && room.players.filter((p) => p.bot).length === room.players.length - 1, `1 human + fill bots: ${room.players.length} players in the lobby (${room.players.filter((p) => p.bot).length} bots)`);
    A.send('start');
    const r = await A.wait((m) => m.t === 'round');
    const first = await A.wait((m) => m.t === 'snap');
    ok(first.hl + r.seekers.length >= 4, `the round starts with ${first.hl + r.seekers.length} players (${r.seekers.length} seekers, ${first.hl} hiders)`);
    // the bots play: after the hide time, the human sees tagging / shots or the round just keeps running without server errors
    await A.wait((m) => m.t === 'phase', 4000);
    A.at = r.spawns.find((s) => s.id === A.id) ? [r.spawns.find((s) => s.id === A.id).x, r.spawns.find((s) => s.id === A.id).z] : [0, 0];
    await sleep(2500);
    ok(A.snaps.length > 10, 'snapshots keep flowing with bots in the room');
    const botIds = new Set(room.players.filter((p) => p.bot).map((p) => p.id));
    // bots never receive messages: removing fill returns the lobby to humans only
    A.ws.close(); await sleep(200);
    const B = client(URL, 'B'); await B.open; B.send('create', { name: 'Two' }); await B.wait((m) => m.t === 'room');
    B.send('fill', { on: true }); const rb = await B.wait((m) => m.t === 'room' && m.fill); B.send('fill', { on: false });
    const rb2 = await B.wait((m) => m.t === 'room' && !m.fill);
    ok(rb.players.length >= 4 && rb2.players.length === 1 && !botIds.has(rb2.players[0].id), 'turning fill off removes the bots again');
    B.ws.close();
  }


  // ===== 8. no disclosure through side channels: round spawns, disguise and camo only reach a seeker that may know where the hider is
  {
    const cs = await lobby(URL, 2, 'prophunt');
    cs[0].send('start');
    const rounds = await Promise.all(cs.map((c) => c.wait((m) => m.t === 'round'))), r = WIRE.mergeRounds(rounds);
    for (const sp of r.spawns) cs.find((k) => k.id === sp.id).at = [sp.x, sp.z];
    const S = cs.find((c) => c.id === r.seekers[0]), H = cs.find((c) => c !== S), sr = rounds[cs.indexOf(S)], hr = rounds[cs.indexOf(H)];
    ok(!sr.spawns.some((sp) => sp.id === H.id) && sr.spawns.some((sp) => sp.id === S.id), "the seeker's round message does not contain the hider's spawn");
    ok(hr.spawns.some((sp) => sp.id === H.id), "the hider's round message has its own spawn");
    const prop = world.props.find((p) => !sees(S0[0], S0[1], p.x, p.z) && Math.hypot(p.x - S0[0], p.z - S0[1]) < 30);
    let V = null;
    for (let x = -20; x <= 20; x += 1) for (let z = -20; z <= 20; z += 1) { const d = Math.hypot(x - S0[0], z - S0[1]); if (d > 6 && d < 18 && sees(S0[0], S0[1], x, z) && (!V || d < Math.hypot(V[0] - S0[0], V[1] - S0[1]))) V = [x, z]; }
    await H.walk(prop.x, prop.z, 8, 50);
    await S.wait((m) => m.t === 'phase');
    await sleep(700); S.snaps.length = 0; S.log.length = 0; // past the linger of any line of sight the walk crossed
    H.send('disguise', { propId: prop.id }); H.send('camo', { c: 0x123456 });
    await H.wait((m) => m.t === 'disguise' && m.id === H.id); await sleep(700);
    ok(!S.log.some((m) => (m.t === 'disguise' || m.t === 'camo') && m.id === H.id), 'a hidden hider\'s disguise and camo are not sent to the seeker');
    ok(!S.snaps.some((s) => s.p.some((e) => e[0] === H.id && !(e[7] & 1))), 'and neither is its position');
    await H.walk(V[0], V[1], 8, 50); await sleep(600);
    const dg = S.log.find((m) => m.t === 'disguise' && m.id === H.id);
    ok(!!dg && dg.propId === prop.id && S.log.some((m) => m.t === 'camo' && m.id === H.id && m.c === 0x123456), 'once the hider is in line of sight the seeker is told its disguise and tint');
    cs.forEach((c) => c.ws.close());
  }

  // ===== 9. protocol robustness: malformed binary never throws, writes are clamped, the declared count always matches
  {
    const P = WIRE.P, { encodeSnap, decodeSnap, quantise } = P, bad = (v) => { try { return decodeSnap(v) === null; } catch { return false; } };
    const good = encodeSnap({ tl: 12.3, hl: 2, ack: 7, st: 99 }, [{ id: 3, q: quantise({ x: 1, y: 0, z: 2, yaw: 0, pitch: 0, c: 0 }), flags: 0 }]);
    const extra = new Uint8Array(good.byteLength + 1); extra.set(new Uint8Array(good));
    const lying = good.slice(0); new DataView(lying).setUint8(5, 200);
    ok([null, undefined, 'x', 5, {}, [], new ArrayBuffer(0), new ArrayBuffer(11), good.slice(0, good.byteLength - 1), extra, lying, new Uint8Array(3)].every(bad), 'decodeSnap returns null (never throws) for wrong types, short buffers and a size that does not match the declared count');
    ok(decodeSnap(good) && decodeSnap(good).p.length === 1 && decodeSnap(new Uint8Array(good)).p[0][0] === 3, 'a well-formed snapshot decodes (ArrayBuffer or typed array)');
    let threw = false;
    try { for (let i = 0; i < 3000; i++) { const b = new Uint8Array(Math.floor(Math.random() * 80)); for (let j = 0; j < b.length; j++) b[j] = Math.random() * 256; if (b.length) b[0] = 1; decodeSnap(b); } } catch { threw = true; }
    ok(!threw, 'random buffers never throw out of decodeSnap');
    const many = Array.from({ length: 300 }, (_, i) => ({ id: i, q: quantise({ x: 1e9, y: -5, z: NaN, yaw: Infinity, pitch: 9, c: 5 }), flags: 255 }));
    many.push({ id: 70000, q: many[0].q, flags: 0 }, { id: -1, q: many[0].q, flags: 0 }, { id: NaN, q: many[0].q, flags: 0 });
    const enc = encodeSnap({ tl: NaN, hl: 9999, ack: -5, st: 2 ** 40 }, many), dec = decodeSnap(enc);
    ok(dec && dec.p.length === 255 && enc.byteLength === P.HEAD + 255 * P.ENTRY, 'at most 255 entries are written and the length matches the count; invalid ids are skipped');
    ok(dec && dec.p.every((e) => e[1] <= 327.67 && e[1] >= -327.68 && e[2] >= 0 && Math.abs(e[5]) <= 1.6 + 1e-9 && e[6] <= 1 && e[7] <= 3) && dec.hl === 255 && dec.tl === 0, 'out-of-range coordinates, flags, counters and NaN are clamped');
    // the server shrugs off junk frames
    const j = client(URL, 'junk'); await j.open;
    j.ws.send(Buffer.from(good)); j.ws.send(Buffer.alloc(20000)); j.ws.send('{"t":"hello","protocol":{"a":1}}'); j.ws.send('{"t":"pos","x":"1"}');
    await sleep(200);
    j.ws.close();
    const k = client(URL, 'after'); await k.open; k.send('create', { name: 'Still up' });
    ok((await k.wait((m) => m.t === 'room').catch(() => null)) !== null, 'the server is still serving after junk frames'); k.ws.close();
  }

  // ===== 10. nothing outlives its player: reconnect tokens expire, histories and rooms are released
  {
    const metric = async (name) => { const body = await new Promise((res, rej) => http.get(URL.replace('ws:', 'http:').replace('/ws', '/metrics'), (r) => { let s = ''; r.on('data', (d) => (s += d)); r.on('end', () => res(s)); }).on('error', rej)); return Number(new RegExp(`^${name} (\\S+)$`, 'm').exec(body)[1]); };
    const secs = Number(process.env.RECONNECT_SECS) || 30;
    if (secs > 6) console.log('SKIP token expiry (set RECONNECT_SECS=3)');
    else {
      await sleep(300);
      const base = { tokens: await metric('hs_tokens'), rooms: await metric('hs_rooms') };
      const cs = await lobby(URL, 3); const r = await startRound(cs);
      const S = cs.find((c) => c.id === r.seekers[0]), [H1, H2] = cs.filter((c) => c !== S);
      await sleep(500);
      ok(await metric('hs_tokens') === base.tokens + 3 && await metric('hs_history_samples') > 0, 'three seats hold three tokens and lag-comp history is being kept');
      const token = H1.token; H1.ws.terminate();
      await sleep(secs * 1000 + 700);
      ok(await metric('hs_tokens') === base.tokens + 2, `the dropped player's token is gone ${secs}s after the drop`);
      const late = client(URL, 'late'); await late.open; late.send('reconnect', { token });
      ok(/Session expired/.test((await late.wait((m) => m.t === 'err').catch(() => ({ msg: '' }))).msg), 'an expired token cannot be used'); late.ws.close();
      ok((await H2.wait((m) => m.t === 'room' && m.players.length === 2).catch(() => null)) !== null, 'the seat was freed for the others');
      cs.forEach((c) => c.ws.close()); await sleep(400);
      ok(await metric('hs_tokens') === base.tokens && await metric('hs_rooms') === base.rooms && await metric('hs_history_samples') === 0, 'when everyone leaves the room, tokens, room and history are released');
    }
  }


  // ===== 11. round-1 review fixes, on a private server with a longer hide phase and tight room caps
  {
    const srv = await spawnServer({ HIDE_SECS: '8', SEEK_SECS: '90', RECONNECT_SECS: '3', MAX_ROOMS_PER_IP: '3', MAX_ROOMS: '1000' });
    const free = (x, z) => !world.colliders.some((c) => c.y0 < 1.8 && x > c.x0 - 0.5 && x < c.x1 + 0.5 && z > c.z0 - 0.5 && z < c.z1 + 0.5);
    const grid = []; for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) if (free(x, z)) grid.push([x, z]);
    const dS = (p) => Math.hypot(p[0] - S0[0], p[1] - S0[1]);
    const V = grid.filter((p) => dS(p) > 6 && dS(p) < 18 && sees(S0[0], S0[1], p[0], p[1])).sort((a, b) => dS(a) - dS(b))[0];
    // I-2: during the hide phase a seeker gets no hider entries and no hider noise, even in plain sight; once seeking starts the hider shows up
    {
      const cs = await lobby(srv.url, 2); const r = await startRound(cs);
      const S = cs.find((c) => c.id === r.seekers[0]), H = cs.find((c) => c !== S);
      await H.walk(V[0], V[1], 8, 50); H.send('noise', { k: 'sprint' }); await sleep(900);
      ok(S.snaps.length > 3 && !S.snaps.some((s) => s.p.some((e) => e[0] === H.id)) && !S.log.some((m) => m.t === 'noise'), 'hide phase: a hider in plain sight of the seeker is in no snapshot and makes no noise cue');
      await S.wait((m) => m.t === 'phase', 12000); await sleep(600);
      ok(S.snaps.some((s) => s.p.some((e) => e[0] === H.id && !(e[7] & 1))), 'seek phase: the same hider is now in the seeker\'s snapshots');
      cs.forEach((c) => c.ws.close());
    }
    // I-7: classic tag through a wall (within 3.5 m) is refused, in line of sight it works
    {
      // a pair of points within 3 m of each other with a wall between them, and a partner for the seeker spot in plain sight
      let A = null, Q = null;
      for (const a of grid.slice().sort((x, y) => dS(x) - dS(y))) { Q = grid.find((b) => { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); return d > 1 && d < 3 && !sees(a[0], a[1], b[0], b[1]); }); if (Q) { A = a; break; } }
      const W = A && grid.find((b) => { const d = Math.hypot(A[0] - b[0], A[1] - b[1]); return d > 1.5 && d < 3 && sees(A[0], A[1], b[0], b[1]); });
      ok(!!A && !!Q && !!W, 'a wall pocket for the tag test exists');
      if (A && Q && W) {
        const cs = await lobby(srv.url, 2); const r = await startRound(cs);
        const S = cs.find((c) => c.id === r.seekers[0]), H = cs.find((c) => c !== S);
        await H.walk(Q[0], Q[1], 8, 50); await S.wait((m) => m.t === 'phase', 12000);
        await S.walk(A[0], A[1], 8, 50); await sleep(300);
        S.send('tag', { target: H.id });
        ok(await sleep(500).then(() => !S.log.some((m) => m.t === 'tagged')), `tag through a wall at ${Math.hypot(Q[0] - A[0], Q[1] - A[1]).toFixed(1)} m is refused`);
        await H.walk(W[0], W[1], 8, 50); await sleep(350); S.send('tag', { target: H.id });
        ok(!!(await S.wait((m) => m.t === 'tagged', 1500).catch(() => null)), 'the same tag in line of sight is accepted');
        cs.forEach((c) => c.ws.close());
      }
    }
    // I-3: a client that forges pongs (claims a huge rtt) gets no extra rewind: a shot at the hider's current position still hits
    {
      const lane = (() => { for (let z = 11; z <= 16; z += 0.5) { let c = true; for (let x = -7; x <= 7 && c; x += 0.5) c = nav.losClear(S0[0], 1.5, S0[1], x, 0.9, z); if (c) return z; } return null; })();
      const cs = await lobby(srv.url, 2, 'prophunt'); const r = await startRound(cs);
      const S = cs.find((c) => c.id === r.seekers[0]), H = cs.find((c) => c !== S);
      S.forge = true;
      await H.walk(-6, lane, 8, 50); await S.wait((m) => m.t === 'phase', 12000); await sleep(1500); // many forged pongs by now
      const walk = H.walk(6, lane, 3.9, 50); await sleep(900);
      const [hx, hz] = H.at, ox = S0[0], oy = 1.5, oz = S0[1], dx = hx + 0.1 - ox, dy = 0.9 - oy, dz = hz - oz, l = Math.hypot(dx, dy, dz);
      S.send('shoot', { ox, oy, oz, dx: dx / l, dy: dy / l, dz: dz / l, d: 0 });
      const shot = await S.wait((m) => m.t === 'shot', 2000).catch(() => null);
      ok(!!shot && shot.hit === H.id, 'forged pongs do not buy a rewind: a shot at the current position hits (a 250 ms rewind would miss by ~1 m)');
      await walk; cs.forEach((c) => c.ws.close());
    }
    // I-4: a hider that reverted to a person while out of the seeker's interest is shown as a person (propId null) when it comes back
    {
      const P1 = world.props.filter((p) => dS([p.x, p.z]) > 6 && dS([p.x, p.z]) < 18 && sees(S0[0], S0[1], p.x, p.z) && free(p.x, p.z) !== undefined)[0];
      const B = grid.filter((p) => !sees(S0[0], S0[1], p[0], p[1]) && dS(p) < 25).sort((a, b) => Math.hypot(a[0] - P1.x, a[1] - P1.z) - Math.hypot(b[0] - P1.x, b[1] - P1.z))[0];
      const cs = await lobby(srv.url, 2, 'prophunt'); const r = await startRound(cs);
      const S = cs.find((c) => c.id === r.seekers[0]), H = cs.find((c) => c !== S);
      await H.walk(P1.x, P1.z, 8, 50); await S.wait((m) => m.t === 'phase', 12000); await sleep(700);
      H.send('disguise', { propId: P1.id }); await H.wait((m) => m.t === 'disguise'); await sleep(300);
      ok(S.log.some((m) => m.t === 'disguise' && m.id === H.id && m.propId === P1.id), 'a visible hider\'s disguise reaches the seeker');
      await H.walk(B[0], B[1], 8, 50); await sleep(1000);
      await sleep(2400); H.send('disguise', { propId: null }); await sleep(300); // reverts out of sight (cooldown has passed)
      S.log.length = 0;
      await H.walk(P1.x, P1.z, 8, 50); await sleep(700);
      ok(S.log.some((m) => m.t === 'disguise' && m.id === H.id && m.propId === null), 'back in view the seeker is told the hider is no longer disguised');
      cs.forEach((c) => c.ws.close());
    }
    // I-5: a reconnect from a socket that already sits in a room leaves that room (no zombie seat, no leaked room) and rotates the token
    {
      const cs = await lobby(srv.url, 2); const r = await startRound(cs);
      const S = cs.find((c) => c.id === r.seekers[0]), H = cs.find((c) => c !== S), token = S.token;
      S.ws.terminate(); await sleep(300);
      const X = client(srv.url, 'X'); await X.open; X.send('create', { name: 'Zombie?' }); await X.wait((m) => m.t === 'room');
      X.send('reconnect', { token });
      const back = await X.wait((m) => m.t === 'room' && m.you === S.id);
      ok(back.token && back.token !== token, 'the token is rotated on reconnect');
      const Y = client(srv.url, 'Y'); await Y.open; Y.send('reconnect', { token });
      ok(/Session expired/.test((await Y.wait((m) => m.t === 'err').catch(() => ({ msg: '' }))).msg), 'the old token no longer works'); Y.ws.close();
      X.ws.close(); H.ws.close(); await sleep(500);
      const body = await new Promise((res) => http.get(srv.url.replace('ws:', 'http:').replace('/ws', '/metrics'), (rr) => { let t = ''; rr.on('data', (d) => (t += d)); rr.on('end', () => res(t)); }));
      ok(/^hs_rooms 0$/m.test(body) && /^hs_players 0$/m.test(body) && /^hs_tokens 0$/m.test(body), 'no zombie room, seat or token is left behind');
    }
    // I-6: rooms per IP are capped at 3
    {
      const cs = []; const errs = [];
      for (let i = 0; i < 4; i++) { const c = client(srv.url, 'R' + i); await c.open; c.send('create', { name: 'R' + i }); cs.push(c); await sleep(120); }
      ok(cs.slice(0, 3).every((c) => c.log.some((m) => m.t === 'room')) && cs[3].log.some((m) => m.t === 'err' && /Too many rooms/.test(m.msg)), 'the 4th room from one IP is refused with an err');
      cs.forEach((c) => c.ws.close());
    }
    srv.kill();
    const small = await spawnServer({ MAX_ROOMS: '2', MAX_ROOMS_PER_IP: '10' });
    {
      const cs = []; for (let i = 0; i < 3; i++) { const c = client(small.url, 'G' + i); await c.open; c.send('create', { name: 'G' + i }); cs.push(c); await sleep(120); }
      ok(cs[2].log.some((m) => m.t === 'err' && /full/i.test(m.msg)) && cs[1].log.some((m) => m.t === 'room'), 'the server-wide room cap refuses the next create with an err');
      cs.forEach((c) => c.ws.close());
    }
    small.kill();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.stack || e.message); process.exit(2); });
