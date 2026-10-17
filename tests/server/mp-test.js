const WebSocket = require('ws');
const URL = process.env.URL || `ws://localhost:${process.env.PORT || 3457}/ws`;
let pass = 0, fail = 0;
const ok = (c, name) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(label) {
  const ws = new WebSocket(URL), log = [], waiters = [];
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
    setTimeout(() => rej(new Error(`${label}: timeout waiting; recent: ${JSON.stringify(log.slice(-4).map((m) => m.t + (m.msg ? ":" + m.msg : "") + (m.phase ? ":" + m.phase : "")))}`)), ms);
  });
  c.none = async (f, ms = 500) => { await sleep(ms); return !log.some(f); };
  return c;
}

(async () => {
  const [A, B, C] = [client('A'), client('B'), client('C')];
  await Promise.all([A.open, B.open, C.open]);
  // robustness: junk must not crash or disconnect
  A.ws.send('not json'); A.ws.send(JSON.stringify([1])); A.ws.send(JSON.stringify({ t: 'start' })); A.ws.send('x'.repeat(5000));
  A.ws.send(JSON.stringify({ t: '__proto__' })); A.ws.send(JSON.stringify({ t: 'constructor' }));
  A.send('create', { name: 'Alex\u0007\u{1F600}   ' + 'z'.repeat(30) });
  const room = await A.wait((m) => m.t === 'room');
  ok(/^[A-Z]{4}$/.test(room.code), `create -> room code ${room.code}`);
  ok(room.players[0].name.length <= 16 && /^[\x20-\x7e]+$/.test(room.players[0].name), `name clamped/printable: "${room.players[0].name}"`);
  ok(room.host === A.id, 'creator is host');
  B.send('join', { name: 'Sam', code: room.code.toLowerCase() });
  C.send('join', { name: 'Kim', code: room.code });
  await B.wait((m) => m.t === 'room'); await C.wait((m) => m.t === 'room' && m.players.length === 3);
  ok(true, '3 players in room');
  const D = client('D'); await D.open; D.send('join', { name: 'Nope', code: 'ZZZZ' });
  ok((await D.wait((m) => m.t === 'err')).msg === 'Room not found', 'unknown room rejected'); D.ws.close();
  B.send('start'); ok(await A.none((m) => m.t === 'round', 300), 'non-host start ignored');

  A.send('start');
  const rounds = await Promise.all([A, B, C].map((c) => c.wait((m) => m.t === 'round')));
  const r = rounds[0];
  ok(r.seekers.length === 1 && r.spawns.length === 3, `round: 1 seeker (${r.seekers}), 3 spawns`);
  const by = { A, B, C }, all = [A, B, C];
  const seeker = all.find((c) => c.id === r.seekers[0]), hiders = all.filter((c) => c !== seeker);
  const [H1, H2] = hiders;
  // tag during hide phase must be rejected
  seeker.send('tag', { target: H1.id });
  ok(await seeker.none((m) => m.t === 'tagged', 300), 'tag during HIDE phase rejected');
  await seeker.wait((m) => m.t === 'phase' && m.phase === 'seek', 3000); ok(true, 'phase -> seek after HIDE timer');
  // walk in 0.8m steps every 45ms: the server drops moves faster than ~9 m/s
  for (const sp of r.spawns) { const c = all.find((k) => k.id === sp.id); c.at = [sp.x, sp.z]; }
  const pos = async (c, x, z) => {
    for (;;) {
      const [cx, cz] = c.at, d = Math.hypot(x - cx, z - cz), s = Math.min(1, 0.8 / (d || 1));
      c.at = [cx + (x - cx) * s, cz + (z - cz) * s];
      c.send('pos', { x: c.at[0], y: 0, z: c.at[1], yaw: 0, pitch: 0, c: 0 }); await sleep(45);
      if (s === 1) return;
    }
  };
  // 60ms gaps (server drops >25Hz)
  await pos(seeker, 0, 10); await pos(H1, 0, 12); await sleep(60); await pos(H2, 10, 10);
  await sleep(250);
  const snap = await H1.wait((m) => m.t === 'snap' && m.p.some((p) => p[0] === seeker.id && p[3] === 10));
  ok(snap.hl === 2 && snap.tl > 0 && snap.tl <= 20, `snapshot broadcast: hidersLeft=${snap.hl} tl=${snap.tl}`);
  // out of range (H2 is 10m away) and bogus ids
  seeker.send('tag', { target: H2.id }); seeker.send('tag', { target: 9999 }); seeker.send('tag', { target: 'x' });
  ok(await seeker.none((m) => m.t === 'tagged', 500), 'out-of-range tag rejected');
  // hider cannot tag
  H1.send('tag', { target: H2.id });
  ok(await H1.none((m) => m.t === 'tagged', 300), 'hider tag rejected');
  // in range
  seeker.send('tag', { target: H1.id });
  const tg = await H2.wait((m) => m.t === 'tagged');
  ok(tg.by === seeker.id && tg.target === H1.id && tg.hl === 1, 'in-range tag accepted, hidersLeft=1');
  // infection: H1 now seeker, can tag H2 only when near
  H1.send('tag', { target: H2.id });
  ok(await H2.none((m) => m.t === 'tagged', 300), 'infected seeker out of range rejected');
  // noise
  H2.send('noise', { k: 'sprint' }); H2.send('noise', { k: 'bogus' });
  const nz = await seeker.wait((m) => m.t === 'noise');
  ok(nz.id === H2.id && nz.k === 'sprint' && nz.x === 10 && nz.z === 10, 'noise broadcast with sender position');
  ok(await H2.none((m) => m.t === 'noise', 200), 'sender does not get own noise');
  // move H2 in range, tag -> round ends
  await pos(H2, 1, 10); await sleep(200);
  A.log.length = 0;
  seeker.send('tag', { target: H2.id });
  const end = await A.wait((m) => m.t === 'end');
  ok(end.winner === 'seekers', 'all tagged -> seekers win');
  const sc = Object.fromEntries(end.players.map((p) => [p.id, p.score]));
  ok(sc[seeker.id] === 6 && sc[H1.id] === 0 && sc[H2.id] === 0 || sc[seeker.id] === 6, `scores: seeker +6 (${JSON.stringify(sc)})`);
  const back = await A.wait((m) => m.t === 'room' && m.phase === 'lobby');
  ok(back.players.length === 3, 'room returns to lobby');

  // timeout path + host migration + disconnect ending the round
  await Promise.all([B, C].map((c) => c.wait((m) => m.t === 'end').catch(() => {}))); // drop stale round-1 ends
  A.send('start'); await Promise.all([A, B, C].map((c) => c.wait((m) => m.t === 'round')));
  A.ws.close(); // host leaves mid-round
  const rm = await B.wait((m) => m.t === 'room' && m.players.length === 2);
  ok(rm.host === B.id, 'host migrated to next player');
  const e2 = await B.wait((m) => m.t === 'end', 25000).catch(() => null);
  ok(e2 !== null, `round ends when a side runs out (${e2 && e2.winner})`);
  // late join mid-round rejected, then leave empties room
  await B.wait((m) => m.t === 'room' && m.phase === 'lobby', 10000).catch(() => {}); B.send('start'); await B.wait((m) => m.t === 'round');
  const E = client('E'); await E.open; E.send('join', { name: 'Late', code: room.code });
  ok((await E.wait((m) => m.t === 'err')).msg.startsWith('Round in progress'), 'join mid-round rejected');
  E.ws.close(); B.ws.close(); C.ws.close(); await sleep(300);
  const F = client('F'); await F.open; F.send('join', { name: 'x', code: room.code });
  ok((await F.wait((m) => m.t === 'err')).msg === 'Room not found', 'empty room deleted');
  F.ws.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
