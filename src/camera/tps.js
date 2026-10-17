// Third-person spring arm: orbit camera behind (and over a swappable shoulder of) the player, pulled in by the first solid in the way
// and eased back out. Q swaps shoulder.
import * as THREE from 'three';
import { camera } from '../render/renderer.js';
import { solids } from '../world/build.js';
import { settings } from '../core/settings.js';
import { shakeOffset } from '../fx/shake.js';
import { setFov } from './fps.js';

const ray = new THREE.Raycaster(), pivot = new THREE.Vector3(), back = new THREE.Vector3(), right = new THREE.Vector3(), shoulderPt = new THREE.Vector3();
const arm = { len: 3.2, side: 0, dir: 1 }; // len: current arm length (eases out after a collision); side: smoothed shoulder offset; dir: +1 right / -1 left
export const swapShoulder = () => { arm.dir = -arm.dir; };
export const resetArm = () => { arm.len = 0.3; arm.dir = 1; arm.side = 0; };
const cast = (from, to, margin) => { // distance along from->to that is free of solids (full length when clear)
  back.copy(to).sub(from); const d = back.length(); if (d < 1e-4) return 0;
  ray.set(from, back.divideScalar(d)); ray.far = d;
  const h = ray.intersectObjects(solids, false)[0];
  return h ? Math.max(0, h.distance - margin) : d;
};
// P: player state; height: pivot height above feet; dist: wanted arm length
export function applyTps(P, dt, height, dist) {
  const cp = Math.cos(P.pitch);
  back.set(Math.sin(P.yaw) * cp, -Math.sin(P.pitch), Math.cos(P.yaw) * cp); // from pivot toward the camera
  right.set(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
  arm.side += (arm.dir * 0.55 - arm.side) * Math.min(1, dt * 8);
  pivot.set(P.x, P.y + height, P.z);
  // shoulder point: slide the pivot sideways unless a wall is there
  shoulderPt.copy(pivot).addScaledVector(right, arm.side);
  const free = cast(pivot, shoulderPt, 0.15), sideLen = Math.abs(arm.side);
  if (free < sideLen) shoulderPt.copy(pivot).addScaledVector(right, Math.sign(arm.side) * free);
  const target = cast(shoulderPt, shoulderPt.clone().addScaledVector(back, dist), 0.2);
  arm.len = target < arm.len ? target : arm.len + (target - arm.len) * Math.min(1, dt * 5); // snap in, ease out
  const sh = shakeOffset(dt);
  camera.position.copy(shoulderPt).addScaledVector(back, arm.len);
  camera.position.y = Math.max(0.12, camera.position.y + sh.py);
  camera.rotation.set(P.pitch + sh.rx, P.yaw + sh.ry, sh.rz);
  setFov(settings.fov);
}
