// First-person camera feel: eye height, head bob (settings.headBob), landing dip spring, FOV kick (sprint) + ADS zoom, 1.5 degree strafe roll, recoil, shake.
import { camera } from '../render/renderer.js';
import { settings } from '../core/settings.js';
import { gun, recoilOffset, ADS_ZOOM } from '../fx/gun.js';
import { shakeOffset } from '../fx/shake.js';

const ROLL = (1.5 * Math.PI) / 180;
const f = { dip: 0, dv: 0, roll: 0, kick: 0 };
camera.rotation.order = 'YXZ'; // yaw, then pitch, then roll: the correct order for a first-person view

export const setFov = (deg) => { if (Math.abs(camera.fov - deg) > 0.01) { camera.fov = deg; camera.updateProjectionMatrix(); } };
export function landDip(impact) { f.dv -= Math.min(impact, 12) * 0.5; } // impact m/s -> downward spring velocity
export function applyFps(P, dt, { speed, strafe, sprint }) {
  f.kick += ((sprint && speed > 3 ? 7 : 0) - f.kick) * Math.min(1, dt * 6);
  f.roll += (-strafe * ROLL - f.roll) * Math.min(1, dt * 10);
  f.dv += (-140 * f.dip - 15 * f.dv) * dt; f.dip += f.dv * dt;
  const half = Math.tan(((settings.fov + f.kick) * Math.PI) / 360) / (1 + (ADS_ZOOM - 1) * gun.ads);
  setFov((Math.atan(half) * 360) / Math.PI);
  const sh = shakeOffset(dt), rc = recoilOffset(), bob = Math.min(1, speed / 3) * settings.headBob;
  camera.position.set(P.x, P.y + P.eyeY + Math.sin(P.bob) * 0.035 * bob + Math.max(-0.18, f.dip) + sh.py, P.z);
  camera.rotation.set(P.pitch + rc.p + sh.rx, P.yaw + rc.y + sh.ry, f.roll + sh.rz);
}
