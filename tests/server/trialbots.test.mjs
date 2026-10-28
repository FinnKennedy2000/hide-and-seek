import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createNav } from '../../src/shared/nav.js';
const { think } = createRequire(import.meta.url)('../../server/trialbots.js');

const box = (x0, x1, z0, z1) => ({ x0, x1, z0, z1, y0: 0, y1: 3 });
function mk(cols = [box(-1, 1, -12, -6)]) {
  const nav = createNav(cols); nav.buildNav();
  const calls = { chan: [], swing: 0, power: 0 };
  let clock = 0;
  const players = [];
  const api = {
    nav, now: () => clock,
    goTo(room, b, x, z, st, sp) { b.path = nav.findPath(b.x, b.z, x, z); b.pi = 0; b.st = st; b.speed = sp; },
    startChannel(room, b, what, i) { calls.chan.push({ what, i, b }); b.chan = { what, i }; },
    stopChannel(room, b) { b.chan = null; },
    swing() { calls.swing++; }, usePower() { calls.power++; },
    hidersOf: () => players.filter((p) => p.role === 'hider'), seekersOf: () => players.filter((p) => p.role === 'seeker'),
  };
  const room = { phase: 'seek', trial: { relics: [{ i: 0, x: 10, z: 10, p: 0, done: false }], gates: [], cages: [], gatesOpen: false, n: 0, cls: 'tracker', vaults: [], grass: [{ x0: -10, x1: -6, z0: 5, z1: 9 }] } };
  const P = (role, x, z, extra = {}) => { const p = { role, st: 'free', x, y: 0, z, heading: 0, c: 0, speed: 0, path: [], pi: 0, ...extra }; players.push(p); return p; };
  return { api, room, calls, P, tick: (b, n, dt = 0.1) => { for (let k = 0; k < n; k++) { clock += dt; think(room, b, clock, dt, api); } } };
}

test('hider with a free relic eventually starts channelling it', () => {
  const m = mk(); const h = m.P('hider', 0, 0);
  m.tick(h, 600);
  assert.ok(m.calls.chan.some((c) => c.what === 'relic' && c.i === 0));
});

test('hider never starts a channel with the seeker 8 m away in LOS', () => {
  const m = mk(); const h = m.P('hider', 0, 0, { tb: { hideUntil: 0, skip: {}, tries: 0 } });
  m.room.trial.relics[0] = { i: 0, x: 0.5, z: 0.5, done: false };
  m.P('seeker', 8, 0, { heading: -Math.PI / 2 });
  m.tick(h, 20);
  assert.equal(m.calls.chan.length, 0);
});

test('seeker swings when a hider is adjacent', () => {
  const m = mk(); const s = m.P('seeker', 0, 0, { heading: 0, cls: 'tracker' }); m.P('hider', 0, 1.5);
  m.tick(s, 3);
  assert.ok(m.calls.swing >= 1);
});

test('seeker does not see a still crouched hider in grass at 6 m', () => {
  const m = mk(); const s = m.P('seeker', -8, 0, { heading: 0, cls: 'tracker' }); m.P('hider', -8, 6, { c: 1, speed: 0 });
  m.tick(s, 1);
  assert.equal(m.calls.swing, 0); assert.ok(!s.tb.last);
});

test('no exceptions on malformed state', () => {
  const m = mk(); const h = m.P('hider', 0, 0), s = m.P('seeker', 5, 5);
  for (const room of [undefined, {}, { trial: null }, { phase: 'seek', trial: { relics: 'x', grass: 5, cages: [null] } }, { phase: 'seek', trial: {} }]) {
    for (const b of [h, s, null, {}, { role: 'hider', st: 'free' }]) assert.doesNotThrow(() => think(room, b, 1, 0.1, m.api));
  }
  assert.doesNotThrow(() => think(m.room, h, 1, 0.1, null));
});
