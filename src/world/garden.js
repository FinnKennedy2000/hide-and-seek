import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addSystem } from '../core/loop.js';
import { tier } from './textures.js';

// House scenery, all instanced (a handful of draw calls): grass tufts that sway, flowers along the path and porch, distant pines.
// Seeded, so every client grows the same garden. buildGarden(world, ownMats) adds to `world`; ownMats collects materials to dispose.
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const COUNT = { potato: 500, low: 1400, med: 3200, high: 6000, ultra: 9000 };

// one tuft = three tapered blades fanned around the origin; vertex colour runs dark at the root to bright at the tip
function tuftGeometry() {
  const parts = [];
  for (let b = 0; b < 3; b++) {
    const g = new THREE.BufferGeometry(), w = 0.035, h = 0.38 + b * 0.05, a = b * 2.1;
    const dx = Math.cos(a), dz = Math.sin(a), lean = 0.06;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w * dx, 0, -w * dz, w * dx, 0, w * dz, lean * dz, h, -lean * dx], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.35, 0.45, 0.3, 0.35, 0.45, 0.3, 1.1, 1.2, 0.8], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); // lit like the ground, not like a flat blade
    parts.push(g);
  }
  return mergeGeometries(parts);
}

export function buildGarden(world, ownMats) {
  const own = (m) => { ownMats.push(m); return m; };
  const rand = mulberry(77), r = (a, b) => a + rand() * (b - a), d = new THREE.Object3D(), q = tier();
  const inYard = (x, z) => Math.abs(x) < 8.8 && Math.abs(z) < 6.8; // house footprint + walls
  const onPath = (x, z) => Math.abs(x) < 0.9 && z > 6.5;
  const uTime = { value: 0 };
  const grassMat = own(new THREE.MeshStandardMaterial({ color: 0x6a9a48, roughness: 1, vertexColors: true, side: THREE.DoubleSide }));
  if (q !== 'potato') {
    grassMat.onBeforeCompile = (s) => {
      s.uniforms.uTime = uTime;
      s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float sway = sin(uTime * 1.7 + instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.45) * 0.07 * position.y;
         transformed.x += sway; transformed.z += sway * 0.6;`);
    };
  }
  const n = COUNT[q] ?? COUNT.high, tufts = new THREE.InstancedMesh(own(tuftGeometry()), grassMat, n);
  let i = 0;
  for (let tries = 0; i < n && tries < n * 4; tries++) {
    const x = r(-23.2, 23.2), z = r(-23.2, 23.2);
    if (inYard(x, z) || onPath(x, z)) continue;
    d.position.set(x, 0, z); d.rotation.set(0, r(0, 6.3), 0); d.scale.set(r(0.8, 1.5), r(0.7, 1.7), r(0.8, 1.5)); d.updateMatrix();
    tufts.setMatrixAt(i++, d.matrix);
  }
  tufts.count = i; tufts.frustumCulled = false; // spread over the whole garden: culling by one big sphere is pointless
  world.add(tufts);

  // flowers: low blooms along both sides of the stepping path and the porch
  const flowers = new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(0.07, 0)), own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 })), 90);
  const col = new THREE.Color(), pal = [0xe85a6a, 0xf2c14e, 0xf0eadf, 0xb48ae0, 0xf08a4a];
  for (let k = 0; k < 90; k++) {
    const side = k % 2 ? 1 : -1, x = side * r(1.0, 1.7), z = 7.2 + (k >> 1) * 0.34 + r(-0.1, 0.1);
    d.position.set(x, r(0.12, 0.3), z); d.rotation.set(0, 0, 0); d.scale.setScalar(r(0.8, 1.4)); d.updateMatrix();
    flowers.setMatrixAt(k, d.matrix); flowers.setColorAt(k, col.setHex(pal[(rand() * pal.length) | 0]));
  }
  world.add(flowers);

  // distant pines: two stacked cones per tree, one draw call
  const pineGeo = mergeGeometries([new THREE.ConeGeometry(2.2, 6, 7).translate(0, 3, 0), new THREE.ConeGeometry(1.6, 5, 7).translate(0, 6.2, 0)]);
  const pines = new THREE.InstancedMesh(own(pineGeo), own(new THREE.MeshStandardMaterial({ color: 0x16221f, roughness: 1, flatShading: true })), 90);
  for (let k = 0; k < 90; k++) {
    const a = (k / 90) * Math.PI * 2 + r(-0.05, 0.05), rad = r(30, 62);
    d.position.set(Math.cos(a) * rad, 0.4, Math.sin(a) * rad); d.rotation.set(0, r(0, 6), 0); d.scale.setScalar(r(0.8, 1.7)); d.updateMatrix();
    pines.setMatrixAt(k, d.matrix);
  }
  world.add(pines);

  // wind: only the tufts sway; a system on the anim order, removed with the map
  return q === 'potato' ? () => {} : addSystem({ name: 'garden-wind', order: 40, update: (dt, t) => { uTime.value = t; } });
}
