import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addSystem } from '../core/loop.js';
import { tier } from './textures.js';

// Tall swaying grass / corn for maps that export `trial.grass` (rectangles): ~1 m clumps, dense enough that a crouched player
// (eye ~1.0 m) is hidden inside. One InstancedMesh for all rectangles. COUNT = clump budget per quality tier, split by area.
// buildGrassFields(world, ownMats, rects) -> dispose fn (removes the wind system). Seeded, so every client grows the same field.
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const COUNT = { potato: 1000, low: 3000, med: 7000, high: 13000, ultra: 18000 };

// one clump: 7 tapered blades (2 segments, 3 tris each) fanned around the origin, 0.8-1.05 m tall; dark at the root, bright at the tip
function clumpGeometry() {
  const rand = mulberry(5), parts = [];
  for (let b = 0; b < 7; b++) {
    const a = (b / 7) * Math.PI * 2 + rand() * 0.6, r0 = 0.05 + rand() * 0.12, h = 0.82 + rand() * 0.24, w = 0.045 + rand() * 0.02;
    const lean = (0.1 + rand() * 0.22), lx = Math.cos(a) * lean, lz = Math.sin(a) * lean, ox = Math.cos(a) * r0, oz = Math.sin(a) * r0;
    const dx = -Math.sin(a), dz = Math.cos(a), mid = h * 0.55;
    const P = [
      ox - dx * w, 0, oz - dz * w, ox + dx * w, 0, oz + dz * w,
      ox + lx * 0.25 - dx * w * 0.8, mid, oz + lz * 0.25 - dz * w * 0.8, ox + lx * 0.25 + dx * w * 0.8, mid, oz + lz * 0.25 + dz * w * 0.8,
      ox + lx, h, oz + lz,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 4]);
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.3, 0.3, 0.22, 0.3, 0.3, 0.22, 0.75, 0.75, 0.55, 0.75, 0.75, 0.55, 1.25, 1.2, 0.85], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(15).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); // lit like the ground
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts);
}

export function buildGrassFields(world, ownMats, rects) {
  if (!rects?.length) return () => {};
  const q = tier(), total = COUNT[q] ?? COUNT.high, area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
  const rand = mulberry(31), r = (a, b) => a + rand() * (b - a), d = new THREE.Object3D(), uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color: 0xb8a860, roughness: 1, vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float ph = instanceMatrix[3].x * 0.5 + instanceMatrix[3].z * 0.37;
       float sway = (sin(uTime * 1.5 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25) * 0.11 * position.y;
       transformed.x += sway; transformed.z += sway * 0.55;`);
  };
  ownMats.push(mat);
  const im = new THREE.InstancedMesh(clumpGeometry(), mat, total), col = new THREE.Color(), pal = [0x9aa860, 0x8a9a50, 0xb0b068, 0x7a9048, 0xa89c58];
  let i = 0;
  for (const rc of rects) {
    const n = Math.round(total * ((rc.x1 - rc.x0) * (rc.z1 - rc.z0)) / area);
    for (let k = 0; k < n && i < total; k++) {
      d.position.set(r(rc.x0, rc.x1), 0, r(rc.z0, rc.z1)); d.rotation.set(0, r(0, 6.3), 0);
      d.scale.set(r(1.0, 1.5), r(0.95, 1.15), r(1.0, 1.5)); d.updateMatrix();
      im.setMatrixAt(i, d.matrix); im.setColorAt(i, col.setHex(pal[(rand() * pal.length) | 0]).multiplyScalar(r(0.8, 1.1)));
      i++;
    }
  }
  im.count = i; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true;
  world.add(im);
  return q === 'potato' ? () => {} : addSystem({ name: 'grass-wind', order: 40, update: (dt, t) => { uTime.value = t; } });
}
