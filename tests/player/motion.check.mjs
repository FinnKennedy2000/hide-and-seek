// Node check (no browser): node tests/player/motion.check.mjs. Speeds, smooth accel, and crouch headroom under a low ceiling.
import assert from 'node:assert/strict';
import { createMotion, TUNE } from '../../src/player/motion.js';
import { aabbBackend } from '../../src/player/backends.js';

assert.deepEqual([TUNE.walk, TUNE.sprint, TUNE.crouch], [3.9, 6.8, 2.0]);
const mk = (cols) => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, r: 0.3, ph: 1.7, crouch: 0, mul: 1, airborne: false, fixedPh: 0, stamina: 1, eyeY: 1.6 });
const run = (s, mo, inp, secs) => { let maxStep = 0; for (let t = 0; t < secs; t += 1 / 60) { const v0 = Math.hypot(s.vx, s.vz); mo.step(s, { ix: 0, iz: 0, sprint: false, crouch: false, jump: false, can: true, ...inp }, 1 / 60); maxStep = Math.max(maxStep, Math.abs(Math.hypot(s.vx, s.vz) - v0)); } return maxStep; };
const B = { x0: -50, x1: 50, z0: -50, z1: 50 };
const speed = (s) => Math.hypot(s.vx, s.vz);

let s = mk(), mo = createMotion(aabbBackend([]), B);
const step = run(s, mo, { iz: -1 }, 1);
assert.ok(Math.abs(speed(s) - 3.9) < 0.01, `walk ${speed(s)}`);
assert.ok(step <= TUNE.accel / 60 + 1e-6, 'acceleration is bounded per frame (smooth)');
run(s, mo, { iz: -1, sprint: true }, 1); assert.ok(Math.abs(speed(s) - 6.8) < 0.01, `sprint ${speed(s)}`);
s = mk(); mo = createMotion(aabbBackend([]), B); run(s, mo, { iz: -1, crouch: true }, 1);
assert.ok(Math.abs(speed(s) - 2.0) < 0.01, `crouch ${speed(s)}`); assert.ok(s.ph < 1.05, `crouch collider height ${s.ph}`);

// low beam at y 1.2..1.5 over the player: releasing crouch must not stand up under it
s = mk(); mo = createMotion(aabbBackend([{ x0: -2, x1: 2, z0: -2, z1: 2, y0: 1.2, y1: 1.5 }]), B);
run(s, mo, { crouch: true }, 0.5); run(s, mo, {}, 1);
assert.ok(s.ph < 1.3, `stayed crouched under the beam (ph ${s.ph})`);
s.x = 5; run(s, mo, {}, 1); assert.ok(s.ph > 1.65, `stands again once clear (ph ${s.ph})`);
console.log('motion ok');
