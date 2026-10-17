// Paint impacts: pooled splat decals aligned to the surface normal + a small particle puff. Last MAX decals only.
import * as THREE from 'three';
import { scene } from '../render/renderer.js';
import { burst } from '../render/fx.js';
import { splatMat } from '../characters/index.js';

const MAX = 60, decals = [];
const geo = new THREE.PlaneGeometry(1, 1), Z = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), qr = new THREE.Quaternion();
let next = 0;
export function splat(point, normal, color) {
  let m;
  if (decals.length < MAX) { m = new THREE.Mesh(geo, splatMat(color)); scene.add(m); decals.push(m); }
  else { m = decals[next]; next = (next + 1) % MAX; m.material = splatMat(color); } // recycle the oldest
  m.position.copy(point).addScaledVector(normal, 0.02);
  q.setFromUnitVectors(Z, normal); qr.setFromAxisAngle(Z, Math.random() * 6.28); m.quaternion.copy(q).multiply(qr);
  m.scale.setScalar(0.5 + Math.random() * 0.45); m.visible = true;
}
export function impact(point, normal, color) {
  splat(point, normal, color);
  burst(point.x + normal.x * 0.05, point.y + normal.y * 0.05, point.z + normal.z * 0.05, color, 10, 0.4, 1.4, 0.1);
}
export function clearImpacts() { for (const d of decals) scene.remove(d); decals.length = 0; next = 0; }
