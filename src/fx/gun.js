// Gunplay feel: spring recoil (camera + viewmodel), viewmodel sway, ADS-lite and spread. Purely visual / client-side aim jitter.
import { settings } from '../core/settings.js';
import { look } from '../core/input.js';
import { addShake } from './shake.js';

export const ADS_ZOOM = 1.25, SPREAD_HIP = 0.012, SPREAD_ADS = 0.003; // radians of random cone applied to the shot direction
export const gun = { ads: 0, adsOn: false }; // ads: 0..1 smoothed
const rec = { p: 0, pv: 0, y: 0, yv: 0 };   // camera recoil spring (radians)
const kk = { z: 0, zv: 0 };                    // viewmodel kick spring
const sway = { x: 0, xv: 0, y: 0, yv: 0, bob: 0 };

const spring = (x, v, k, c, dt) => { v += (-k * x - c * v) * dt; return [x + v * dt, v]; };

export const setAds = (on) => { gun.adsOn = on; };
export function kick() {
  const s = gun.adsOn ? 0.6 : 1;
  rec.pv += 0.55 * s; rec.yv += (Math.random() - 0.5) * 0.3 * s; kk.zv += 2.2 * s;
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
  [rec.p, rec.pv] = spring(rec.p, rec.pv, 90, 13, dt); [rec.y, rec.yv] = spring(rec.y, rec.yv, 90, 13, dt);
  [kk.z, kk.zv] = spring(kk.z, kk.zv, 160, 16, dt);
}
// viewmodel pose: base position + bob + inertia sway from mouse look + kick; ADS pulls it to screen centre
export function applyViewmodel(vm, base, dt, speed, airborne) {
  const moving = speed > 0.5 && !airborne;
  sway.bob += dt * (moving ? 9 : 1.5) * (1 + speed * 0.05);
  const lk = 0.012 * (1 - gun.ads * 0.6); sway.xv -= look.dx * lk; sway.yv += look.dy * lk;
  look.dx = look.dy = 0;
  [sway.x, sway.xv] = spring(sway.x, sway.xv, 70, 9, dt); [sway.y, sway.yv] = spring(sway.y, sway.yv, 70, 9, dt);
  const bobAmt = (moving ? 1 : 0.2) * (1 - gun.ads * 0.85) * settings.headBob, a = gun.ads;
  vm.position.set(
    base.x * (1 - a * 0.9) + Math.sin(sway.bob * 0.5) * 0.008 * bobAmt + sway.x,
    base.y * (1 - a * 0.55) + Math.abs(Math.sin(sway.bob)) * 0.01 * bobAmt + sway.y,
    base.z + kk.z * 0.045);
  vm.rotation.x = kk.z * 0.12 + sway.y * 1.5; vm.rotation.y = 0.06 * (1 - a) - sway.x * 2;
}
