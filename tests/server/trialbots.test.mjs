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
  assert.equal(m.calls.swing, 0); assert.ok(!s.tb.mem);
});

const S = (m, x, z, heading = 0) => m.P('seeker', x, z, { heading, cls: 'tracker' });
const end = (b) => b.path[b.path.length - 1];

test('seeker sees an open-ground hider in its FOV and chases', () => {
  const m = mk(); const s = S(m, 0, 0, 0); m.P('hider', 0, 10);
  m.tick(s, 2);
  assert.equal(s.tb.mode, 'chase'); assert.equal(s.tb.mem.kind, 'seen');
});

test('seeker does not see a hider behind it (outside the ~110 deg FOV)', () => {
  const m = mk(); const s = S(m, 0, 0, 0); m.P('hider', 0, -10);
  m.tick(s, 2);
  assert.ok(!s.tb.mem); assert.notEqual(s.tb.mode, 'chase');
});

test('a wall blocks sight', () => {
  const m = mk(); const s = S(m, 0, 0, Math.PI); m.P('hider', 0, -14); // box at z -12..-6 between them
  m.tick(s, 2);
  assert.ok(!s.tb.mem || s.tb.mem.kind !== 'seen');
});

test('after losing sight it goes to the last SEEN spot, not the hider live position', () => {
  const m = mk(); const s = S(m, 0, 0, 0), h = m.P('hider', 0, 8);
  m.tick(s, 1); assert.equal(s.tb.mem.kind, 'seen');
  h.x = 30; h.z = 30; // hider is now far away and unseen
  m.tick(s, 3);
  assert.equal(s.tb.mode, 'investigate');
  const e = end(s); assert.ok(Math.hypot(e.x - 0, e.z - 8) < 2.5, 'heads to where it was seen ' + JSON.stringify(e));
});

test('hiding in grass while pursued does not erase memory instantly; it decays after ~8 s', () => {
  const m = mk(); const s = S(m, -8, 0, 0), h = m.P('hider', -8, 4);
  m.tick(s, 1); assert.equal(s.tb.mem.kind, 'seen');
  h.z = 7; h.c = 1; h.speed = 0; // into the grass, crouched, 7 m away: concealed
  m.tick(s, 50);
  assert.ok(s.tb.mem && s.tb.mode !== 'patrol', 'still investigating/searching 5 s later: ' + s.tb.mode);
  h.x = 30; h.z = -30; // search finished / hider gone: nothing left to remember
  m.tick(s, 250);
  assert.equal(s.tb.mode, 'patrol'); assert.ok(!s.tb.mem);
});

test('a hider closer than 2.5 m in grass is always seen, even behind the seeker', () => {
  const m = mk(); const s = S(m, -8, 3.8, Math.PI); m.P('hider', -8, 6, { c: 1, speed: 0 });
  m.tick(s, 1);
  assert.equal(s.tb.mem && s.tb.mem.kind, 'seen');
});

test('sprint footsteps behind the seeker are heard: it investigates the spot', () => {
  const m = mk(); const s = S(m, 0, 0, 0); m.P('hider', 0, -10, { speed: 6.5 });
  m.tick(s, 1);
  assert.equal(s.tb.mem.kind, 'heard'); assert.equal(s.tb.mode, 'hear');
});

test('a server noise cue is heard too, once', () => {
  const m = mk(); const s = S(m, 0, 0, 0); s.heard = { x: 5, z: -8, t: 1, k: 'land' };
  m.tick(s, 1); assert.equal(s.tb.mem.kind, 'heard'); assert.equal(s.tb.mem.x, 5);
});

test('hider bot crouches still in grass when the seeker is close', () => {
  const m = mk([box(-9, -7, 2, 3)]); const h = m.P('hider', -8, 7, { tb: { hideUntil: 1e9, skip: {}, tries: 0 } }); m.P('seeker', -8, -2, { heading: 0 });
  m.tick(h, 30);
  assert.equal(h.c, 1); assert.equal(h.speed, 0);
});

test('hider bot relocates away from a relic it just collected', () => {
  const m = mk(); const h = m.P('hider', 0, 0, { tb: { hideUntil: 0, skip: {}, tries: 0, relic: 0 } });
  m.room.trial.relics[0].done = true; m.room.trial.grass = [{ x0: 8, x1: 12, z0: 8, z1: 12 }, { x0: -10, x1: -6, z0: 5, z1: 9 }];
  m.tick(h, 1);
  assert.ok(h.tb.relic == null && h.tb.hideUntil > 5 && h.tb.spot.x < 0, 'picks cover away from the relic ' + JSON.stringify(h.tb.spot));
});

test('no exceptions on malformed state', () => {
  const m = mk(); const h = m.P('hider', 0, 0), s = m.P('seeker', 5, 5);
  for (const room of [undefined, {}, { trial: null }, { phase: 'seek', trial: { relics: 'x', grass: 5, cages: [null] } }, { phase: 'seek', trial: {} }]) {
    for (const b of [h, s, null, {}, { role: 'hider', st: 'free' }]) assert.doesNotThrow(() => think(room, b, 1, 0.1, m.api));
  }
  assert.doesNotThrow(() => think(m.room, h, 1, 0.1, null));
});
