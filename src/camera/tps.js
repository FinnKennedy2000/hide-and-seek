// Third-person spring arm: orbit camera behind (and over a swappable shoulder of) the player, pulled in by the first solid in the way
// and eased back out. Q swaps shoulder. One raycast per frame (every other frame on low / potato).
import * as THREE from 'three';
import { camera } from '../render/renderer.js';
import { solids } from '../world/build.js';
import { settings } from '../core/settings.js';
import { shakeOffset } from '../fx/shake.js';
import { setFov } from './fps.js';

const ray = new THREE.Raycaster(), pivot = new THREE.Vector3(), back = new THREE.Vector3(), right = new THREE.Vector3(), dirv = new THREE.Vector3();
const arm = { len: 1, side: 0, dir: 1, free: 1, frame: 0 }; // len: eased fraction (0..1) of the pivot -> camera line; free: last raycast result
export const swapShoulder = () => { arm.dir = -arm.dir; };
export const resetArm = () => { arm.len = 0.1; arm.dir = 1; arm.side = 0; arm.free = 1; };
// P: player state; height: pivot height above feet; dist: wanted arm length
export function applyTps(P, dt, height, dist) {
  const cp = Math.cos(P.pitch);
  back.set(Math.sin(P.yaw) * cp, -Math.sin(P.pitch), Math.cos(P.yaw) * cp); // from pivot toward the camera
  right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  arm.side += (arm.dir * 0.55 - arm.side) * Math.min(1, dt * 8);
  pivot.set(P.x, P.y + height, P.z);
  dirv.copy(back).multiplyScalar(dist).addScaledVector(right, arm.side); // pivot -> wanted camera position
  const full = dirv.length();
  const cheap = settings.quality === 'low' || settings.quality === 'potato';
  if (!cheap || (arm.frame++ & 1) === 0) {
    ray.ray.origin.copy(pivot); ray.ray.direction.copy(dirv).multiplyScalar(1 / full); ray.far = full;
    const h = ray.intersectObjects(solids, false)[0];
    arm.free = h ? Math.max(0, h.distance - 0.2) / full : 1;
  }
  arm.len = arm.free < arm.len ? arm.free : arm.len + (arm.free - arm.len) * Math.min(1, dt * 5); // snap in, ease out
  const sh = shakeOffset(dt);
  camera.position.copy(pivot).addScaledVector(dirv, arm.len);
  camera.position.y = Math.max(0.12, camera.position.y + sh.py);
  camera.rotation.set(P.pitch + sh.rx, P.yaw + sh.ry, sh.rz);
  setFov(settings.fov);
}
