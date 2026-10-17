// Hats and seeker gear for the glTF characters: each one is a SINGLE merged vertex-coloured mesh (1 draw call), built in
// head-centre space (metres, character faces -Z like character.js) from the same shapes as the procedural character.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const sphere = new THREE.SphereGeometry(1, 12, 8);
const dome = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const cone = new THREE.ConeGeometry(1, 1, 6);
const band = new THREE.TorusGeometry(0.255, 0.024, 6, 16); band.rotateX(Math.PI / 2);
const lens = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10); lens.rotateX(Math.PI / 2);

const part = (geo, hex, x, y, z, sx = 1, sy = sx, sz = sx) => {
  const g = geo.clone(); g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().makeScale(sx, sy, sz).premultiply(new THREE.Matrix4().makeTranslation(x, y, z)));
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const merge = (parts) => mergeGeometries(parts, false);

// head scale `k`: the robot's head is bigger than the toy character's, so hats are scaled and lifted to sit on it
const SPEC = {
  cap: (k) => [part(dome, 0xf4722b, 0, 0.02, 0, 0.27 * k), part(cyl, 0xf4722b, 0, 0.1, -0.26 * k, 0.15 * k, 0.02 * k, 0.14 * k)],
  beanie: (k) => [part(dome, 0x7b2cbf, 0, 0.02, 0, 0.27 * k), part(sphere, 0xf1f1f1, 0, 0.3 * k, 0, 0.06 * k)],
  bucket: (k) => [part(cyl, 0xe9c46a, 0, 0.17 * k, 0, 0.21 * k, 0.16 * k, 0.21 * k), part(cyl, 0xe9c46a, 0, 0.1 * k, 0, 0.34 * k, 0.02 * k, 0.34 * k)],
  crown: (k) => [part(cyl, 0xffd23f, 0, 0.24 * k, 0, 0.2 * k, 0.09 * k, 0.2 * k),
    ...[0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2; return part(cone, 0xffd23f, Math.sin(a) * 0.15 * k, 0.34 * k, Math.cos(a) * 0.15 * k, 0.05 * k, 0.12 * k, 0.05 * k); })],
  seeker: (k) => [part(band, 0xd62828, 0, 0.1 * k, 0, 1.25 * k, k, 1.25 * k), part(lens, 0xff4d4d, -0.15 * k, 0.05 * k, -0.3 * k, 1.7 * k), part(lens, 0xff4d4d, 0.15 * k, 0.05 * k, -0.3 * k, 1.7 * k)],
};
const cache = new Map();
export function gearGeometry(name, k = 1) {
  const key = `${name}@${k}`;
  if (!cache.has(key)) cache.set(key, SPEC[name] ? merge(SPEC[name](k)) : null);
  return cache.get(key);
}
export const gearMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });
export const seekerGearMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: 0x5a1010, emissiveIntensity: 0.9 });
