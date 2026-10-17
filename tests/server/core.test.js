// Engine core, no browser: bus on/off/emit isolation and the loadGroup failure contract (failed entry -> null + 'assetFail', never rejects).
let fail = 0;
const ok = (c, n) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
(async () => {
  const { bus, EV } = await import('../../src/core/bus.js');
  const { loadGroup } = await import('../../src/core/assets.js');
  ok(['sound', 'shot', 'tagged', 'disguise', 'round', 'phase', 'end', 'quality', 'hitmarker', 'ammo', 'stamina', 'cue', 'net', 'assetFail', 'settings'].every((n) => Object.values(EV).includes(n)) && Object.isFrozen(EV), 'EV holds every frozen event name');
  const got = [];
  const off = bus.on('phase', (p) => got.push(p.phase));
  const origErr = console.error; console.error = () => {};
  bus.on('phase', () => { throw new Error('bad listener'); });
  bus.emit('phase', { phase: 'a' });
  off(); bus.emit('phase', { phase: 'b' });
  console.error = origErr;
  ok(JSON.stringify(got) === '["a"]', 'bus: on -> off() stops delivery, a throwing listener does not block others');
  const fails = []; bus.on(EV.ASSET_FAIL, (e) => fails.push(e.key));
  const origWarn = console.warn; console.warn = () => {};
  const prog = [];
  const m = await loadGroup('t', [{ key: 'a', url: '/x.bin', type: 'bogus' }, { key: 'b', url: 'http://localhost:1/none.ogg', type: 'audio' }], (d, n) => prog.push(`${d}/${n}`));
  console.warn = origWarn;
  ok(m.get('a') === null && m.get('b') === null && m.size === 2, 'loadGroup: failed entries resolve to null');
  ok(fails.sort().join() === 'a,b', "loadGroup: each failure emits 'assetFail'");
  ok(prog.length === 2 && prog[1] === '2/2', 'loadGroup: progress reported per entry');
  process.exit(fail ? 1 : 0);
})();
