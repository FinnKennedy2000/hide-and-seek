// Movement core in Node (rapier-compat WASM, no browser): wall stop, stairs, box climb, stamina, slide, coyote, AABB fallback.
import RAPIER from '@dimforge/rapier3d-compat';
import { rapierBackend, aabbBackend } from '../../src/player/backends.js';
import { createMotion, TUNE } from '../../src/player/motion.js';

let fail = 0;
const ok = (c, n) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
const box = (x0, x1, z0, z1, y0, y1) => ({ x0, x1, z0, z1, y0, y1 });
const bounds = { x0: -50, x1: 50, z0: -50, z1: 50 };
const fresh = (o = {}) => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, crouch: 0, r: 0.3, ph: 1.7, eyeY: 1.6, mul: 1, fixedPh: 0, airborne: false, stamina: 1, ...o });
const FWD = { ix: 0, iz: -1, sprint: false, crouch: false, jump: false, can: true }; // yaw 0: forward is -z
const run = (mo, s, inp, secs, dt = 1 / 60, each) => { const evs = []; for (let i = 0; i < Math.round(secs / dt); i++) { evs.push(mo.step(s, typeof inp === 'function' ? inp(i * dt) : inp, dt)); each?.(); } return evs; };

await RAPIER.init();
const cols = [box(-5, 5, -3.02, -3, 0, 3), box(-5, 5, -8, -6, 0, 0.25), box(-5, 5, -12, -10, 0, 0.6)]; // wall z=-3, 0.25 m stair at z -8..-6, 0.6 m box at z -12..-10

for (const [name, mk] of [['rapier', () => rapierBackend(RAPIER, cols)], ['aabb', () => aabbBackend(cols)]]) {
  const be = mk(), mo = createMotion(be, bounds);
  let s = fresh();
  run(mo, s, FWD, 3);
  ok(Math.abs(s.z - (-3 + s.r)) <= 0.02, `${name}: walk into wall stops at radius +-0.02 (z=${s.z.toFixed(3)})`);
  s = fresh({ z: -5 }); mo.reset();
  run(mo, s, FWD, 0.55);
  ok(s.z < -6.3 && s.y > 0.2 && s.y < 0.3, `${name}: steps up a 0.25 m stair (z=${s.z.toFixed(2)} y=${s.y.toFixed(2)})`);
  s = fresh({ z: -9 }); mo.reset();
  run(mo, s, FWD, 2);
  ok(s.y < 0.05 && s.z >= -9.71, `${name}: blocked by a 0.6 m box without jumping (z=${s.z.toFixed(2)} y=${s.y.toFixed(2)})`);
  s = fresh({ z: -9 }); mo.reset();
  run(mo, s, (t) => ({ ...FWD, jump: t < 0.5 && t > 0.3 }), 1.0);
  ok(Math.abs(s.y - 0.6) < 0.05, `${name}: climbs the 0.6 m box with a jump (standing y=${s.y.toFixed(2)})`);
  be.dispose();
}

{ // rapier: stamina, slide, coyote, speed cap
  const be = rapierBackend(RAPIER, []), mo = createMotion(be, bounds);
  let s = fresh();
  const SPR = { ...FWD, sprint: true };
  run(mo, s, SPR, 2);
  ok(s.stamina < 0.7 && s.stamina > 0.5 && Math.hypot(s.vx, s.vz) > 6.5, `sprint drains stamina (${s.stamina.toFixed(2)}) at ~6.8 m/s`);
  run(mo, s, SPR, 4);
  ok(s.stamina < 0.25 && Math.hypot(s.vx, s.vz) < 4.5, 'exhausted: sprint falls back to walk speed');
  run(mo, s, { ...FWD }, 1); const low = s.stamina;
  run(mo, s, { ix: 0, iz: 0, sprint: false, crouch: false, jump: false, can: true }, 3);
  ok(s.stamina > low + 0.3, `stamina regenerates (${low.toFixed(2)} -> ${s.stamina.toFixed(2)})`);
  s = fresh({ stamina: 1 }); mo.reset();
  run(mo, s, SPR, 1);
  let evs = run(mo, s, { ...SPR, crouch: true }, 0.2);
  ok(evs.some((e) => e.slid), 'sprint + C starts a slide');
  let peak = 0; evs = run(mo, s, { ...SPR, crouch: true }, 1, 1 / 60); peak = Math.max(peak, Math.hypot(s.vx, s.vz));
  ok(Math.hypot(s.vx, s.vz) < TUNE.slideSpeed + 0.01, 'slide never exceeds 7.6 m/s (< 9 m/s server limit)');
  // coyote: a backend that stops reporting ground at t=0; a jump 0.06 s later works, 0.3 s later does not
  const IDLE = { ix: 0, iz: 0, sprint: false, crouch: false, jump: false, can: true };
  for (const [delay, want] of [[0.06, true], [0.3, false]]) {
    let ground = true; const fake = { move: (st, dx, dy, dz) => { st.y += dy; return ground; } };
    const mo2 = createMotion(fake, bounds); s = fresh();
    run(mo2, s, IDLE, 0.2); ground = false; run(mo2, s, IDLE, delay);
    const e = run(mo2, s, { ...IDLE, jump: true }, 1 / 60);
    ok(e.some((x) => x.jumped) === want, `coyote: jump ${delay}s after leaving ground ${want ? 'works' : 'is refused'}`);
  }
  const jm = createMotion(rapierBackend(RAPIER, []), bounds); s = fresh(); // jump buffer: pressed 0.05 s before landing
  s.y = 0.3; s.vy = -4; s.airborne = true;
  const evB = run(jm, s, (t) => ({ ix: 0, iz: 0, sprint: false, crouch: false, jump: t > 0.0 && t < 0.03, can: true }), 0.4);
  ok(evB.some((e) => e.jumped), 'jump buffer: early press fires on landing');
}
console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
