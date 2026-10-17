// A real Rapier character (src/player/backends.js: autostep 0.3, radius 0.3, 1.7 m tall) walks up each school stairwell flight onto the upper deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { buildWorld } from '../../src/shared/worlddata.js';
import { rapierBackend } from '../../src/player/backends.js';

await RAPIER.init();
const w = buildWorld(undefined, 'school');
for (const x of [9.0, 12.0]) test(`school: walking north up the flight at x=${x} reaches the deck (y 3.0)`, () => {
  const be = rapierBackend(RAPIER, w.colliders), s = { x, y: 0, z: -0.5, r: 0.3, ph: 1.7 };
  let vy = 0; // same integration as src/player/motion.js: 3.9 m/s, gravity 22, 60 Hz
  for (let i = 0; i < 400; i++) { vy -= 22 / 60; if (be.move(s, 0, vy / 60, -3.9 / 60)) vy = 0; }
  assert.ok(s.y > 2.9 && s.z < -8, `ended at y=${s.y.toFixed(2)} z=${s.z.toFixed(2)}`);
  be.dispose();
});
