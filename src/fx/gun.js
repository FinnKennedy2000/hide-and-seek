// Gunplay feel: spring recoil (camera + viewmodel), viewmodel sway, ADS-lite and spread. Purely visual / client-side aim jitter.
import { settings } from '../core/settings.js';
import { look } from '../core/input.js';
import { addShake } from './shake.js';

export const ADS_ZOOM = 1.25, SPREAD_HIP = 0.012, SPREAD_ADS = 0.003; // radians of random cone applied to the shot direction
export const gun = { ads: 0, adsOn: false }; // ads: 0..1 smoothed
const rec = { p: 0, pv: 0, y: 0, yv: 0 };   // camera recoil spring (radians)
const sp = { recP: { x: 0, v: 0 }, recY: { x: 0, v: 0 }, kick: { x: 0, v: 0 }, swX: { x: 0, v: 0 }, swY: { x: 0, v: 0 } }; // spring states, mutated in place
let bob = 0;

const spring = (o, k, c, dt) => { o.v += (-k * o.x - c * o.v) * dt; o.x += o.v * dt; };

export const setAds = (on) => { gun.adsOn = on; };
export function kick() {
  const s = gun.adsOn ? 0.6 : 1;
  sp.recP.v += 0.55 * s; sp.recY.v += (Math.random() - 0.5) * 0.3 * s; sp.kick.v += 2.2 * s;
  addShake(gun.adsOn ? 0.08 : 0.14);
}
export const recoilOffset = () => rec;
export function spreadDir(dir, out = dir) { // jitter a unit direction inside the spread cone
  const s = gun.ads > 0.5 ? SPREAD_ADS : SPREAD_HIP, a = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * s;
  // ponytail: jitter in world axes (not the aim basis); fine for a 0.7 degree cone, redo with a basis if cones grow
  return out.set(dir.x + Math.cos(a) * r, dir.y + Math.sin(a) * r, dir.z + Math.cos(a + 1.7) * r).normalize();
}
export function updateGun(dt) {
  gun.ads += ((gun.adsOn ? 1 : 0) - gun.ads) * Math.min(1, dt * 14);
  spring(sp.recP, 90, 13, dt); spring(sp.recY, 90, 13, dt); spring(sp.kick, 160, 16, dt);
  rec.p = sp.recP.x; rec.y = sp.recY.x;
}
// viewmodel pose: base position + bob + inertia sway from mouse look + kick; ADS pulls it to screen centre
export function applyViewmodel(vm, base, dt, speed, airborne) {
  const moving = speed > 0.5 && !airborne;
  bob += dt * (moving ? 9 : 1.5) * (1 + speed * 0.05);
  const lk = 0.012 * (1 - gun.ads * 0.6); sp.swX.v -= look.dx * lk; sp.swY.v += look.dy * lk;
  look.dx = look.dy = 0;
  spring(sp.swX, 70, 9, dt); spring(sp.swY, 70, 9, dt);
  const bobAmt = (moving ? 1 : 0.2) * (1 - gun.ads * 0.85) * settings.headBob, a = gun.ads, kz = sp.kick.x;
  vm.position.set(
    base.x * (1 - a * 0.9) + Math.sin(bob * 0.5) * 0.008 * bobAmt + sp.swX.x,
    base.y * (1 - a * 0.55) + Math.abs(Math.sin(bob)) * 0.01 * bobAmt + sp.swY.x,
    base.z + kz * 0.045);
  vm.rotation.x = kz * 0.12 + sp.swY.x * 1.5; vm.rotation.y = 0.06 * (1 - a) - sp.swX.x * 2;
}
