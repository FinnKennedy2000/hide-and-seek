import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addSystem } from '../core/loop.js';
import { camera } from '../render/renderer.js';
import { DEBUG } from '../core/state.js';
import { tier } from './textures.js';
import { grassSpec, planClumps, NEAR_FADE } from './grassplan.js';

// Tall swaying grass / corn for maps that export `trial.grass` (rectangles). One InstancedMesh for all rectangles; clump count comes from
// grassplan.js and is the SAME at every quality preset (it is the hiding mechanic). Blades 1.1-1.65 m, dense enough that a crouched player
// (~0.9 m) vanishes from 6+ m but shows up close. Seeded, so every client grows the same field. Returns a dispose fn.
// Near-camera fade (< 0.6 m, dithered, in the shader) only ever looks at the camera distance, so it cannot reveal or hide other players; off for the seeker.
const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// one clump: 9 wide tapered blades (2 segments), 1.65 m tall at scale 1; dark at the root, dusk-bright at the tip
function clumpGeometry() {
  const rand = mulberry(5), parts = [];
  for (let b = 0; b < 9; b++) {
    const a = (b / 9) * Math.PI * 2 + rand() * 0.5, r0 = 0.04 + rand() * 0.2, h = 1.2 + rand() * 0.45, w = 0.07 + rand() * 0.04;
    const lean = 0.06 + rand() * 0.2, lx = Math.cos(a) * lean, lz = Math.sin(a) * lean, ox = Math.cos(a) * r0, oz = Math.sin(a) * r0;
    const dx = -Math.sin(a), dz = Math.cos(a), mid = h * 0.55;
    const P = [
      ox - dx * w, 0, oz - dz * w, ox + dx * w, 0, oz + dz * w,
      ox + lx * 0.25 - dx * w * 0.85, mid, oz + lz * 0.25 - dz * w * 0.85, ox + lx * 0.25 + dx * w * 0.85, mid, oz + lz * 0.25 + dz * w * 0.85,
      ox + lx, h, oz + lz,
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex([0, 1, 3, 0, 3, 2, 2, 3, 4]);
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.22, 0.22, 0.17, 0.22, 0.22, 0.17, 0.62, 0.6, 0.45, 0.62, 0.6, 0.45, 1.05, 0.98, 0.78], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(15).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3)); // lit like the ground
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts);
}

// soft dark patch under each rect (contact shadow of the dense grass): radial alpha, so it fades out toward the rect edge
function shadowPatches(rects) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.45, depthWrite: false, color: 0x120c16, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  mat.userData.ownMap = true;
  const geos = rects.map((rc) => {
    const q = new THREE.PlaneGeometry(rc.x1 - rc.x0 + 1.5, rc.z1 - rc.z0 + 1.5); q.rotateX(-Math.PI / 2);
    q.translate((rc.x0 + rc.x1) / 2, 0.04, (rc.z0 + rc.z1) / 2); return q;
  });
  const m = new THREE.Mesh(mergeGeometries(geos), mat); m.renderOrder = 1; m.userData.noScan = true;
  return { mesh: m, mat };
}

// Wind sway + the hider-only near-camera fade, as an onBeforeCompile patch. Shared by the procedural fields below and the authored GLB
// grass (src/world/mapglb.js). drive(meshes) keeps the patch on whatever material a preset swaps in and returns a stop fn.
export function grassShader() {
  const uTime = { value: 0 }, uFade = { value: 0 };
  const patch = (s) => {
    s.uniforms.uTime = uTime; s.uniforms.uFade = uFade;
    s.vertexShader = 'uniform float uTime; varying float vCamD;\n' + s.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float ph = instanceMatrix[3].x * 0.5 + instanceMatrix[3].z * 0.37;
       float gust = sin(uTime * 0.6 + instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.07) * 0.5 + 0.7;
       float sway = (sin(uTime * 1.5 + ph) * 0.55 + sin(uTime * 2.7 + ph * 1.7) * 0.2) * gust * 0.09 * position.y * position.y;
       transformed.x += sway; transformed.z += sway * 0.55;`).replace('#include <project_vertex>', '#include <project_vertex>\n vCamD = length(mvPosition.xyz);');
    s.fragmentShader = 'uniform float uFade; varying float vCamD;\n' + s.fragmentShader.replace('#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
       if (uFade > 0.5 && vCamD < ${NEAR_FADE.toFixed(2)}) { float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453); if (n > smoothstep(0.15, ${NEAR_FADE.toFixed(2)}, vCamD)) discard; }`);
  };
  const apply = (m) => { if (m.onBeforeCompile !== patch) { m.onBeforeCompile = patch; m.userData.gp = true; m.needsUpdate = true; } };
  function drive(meshes) {
    let seeker = false, off = false;
    import('../modes/trial.js').then((m) => { if (!off) seeker = m.trial; }).catch(() => {}); // lazy: trial.js imports the world indirectly
    const stop = addSystem({ name: 'grass-wind', order: 40, update: (dt, t) => {
      uTime.value = t;
      for (const im of meshes) apply(im.material); // the Lambert twin on potato / low
      uFade.value = seeker && seeker.on && seeker.role === 'seeker' ? 0 : 1;
    } });
    return () => { off = true; stop(); };
  }
  return { patch, apply, drive, uTime, uFade };
}

export function buildGrassFields(world, ownMats, rects) {
  if (!rects?.length) return () => {};
  const spec = grassSpec(tier()), clumps = planClumps(rects, spec), sh = grassShader();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, vertexColors: true, side: THREE.DoubleSide });
  // Patched on whatever material the preset swaps in (Standard, or the Lambert twin on potato/low): both share these shader chunks.
  sh.apply(mat);
  ownMats.push(mat);
  const im = new THREE.InstancedMesh(clumpGeometry(), mat, Math.max(1, clumps.length)), d = new THREE.Object3D(), col = new THREE.Color();
  // dusk palette: olive, straw, a cool violet-grey for variety (matches the 0xa8a4d0 ambient)
  const pal = [0x7c8048, 0x6a7842, 0x8e8450, 0x74703f, 0x84804e, 0x6c6c58].map((h) => new THREE.Color(h));
  clumps.forEach((c, i) => {
    d.position.set(c.x, 0, c.z); d.rotation.set(0, c.rot, 0); d.scale.set(c.sx, c.sy, c.sz); d.updateMatrix();
    im.setMatrixAt(i, d.matrix); im.setColorAt(i, col.copy(pal[(c.tint * pal.length) | 0]).multiplyScalar(0.85 + ((c.tint * 97) % 1) * 0.3));
  });
  im.count = clumps.length; im.computeBoundingSphere(); im.castShadow = false; im.receiveShadow = true; im.userData.noScan = true; im.userData.gameplayGrass = true;
  world.add(im);
  const patches = shadowPatches(rects); world.add(patches.mesh); ownMats.push(patches.mat);
  im.userData.stats = { clumps: clumps.length, tris: clumps.length * 9 * 3 };

  const stop = sh.drive([im]);
  // dev-only: hold the camera at x, y, z, yaw, pitch so comparison shots are repeatable (window.__grassTest.set(x, y, z, yaw, pitch); .set(null) releases)
  let hold = null, stopHold = () => {};
  if (DEBUG) {
    stopHold = addSystem({ name: 'grass-test', order: 90, update: () => { if (hold) { camera.position.set(hold[0], hold[1], hold[2]); camera.rotation.set(hold[4], hold[3], 0, 'YXZ'); } } });
    window.__grassTest = { set: (x, y, z, yaw = 0, pitch = 0) => { hold = x == null ? null : [x, y, z, yaw, pitch]; }, stats: () => im.userData.stats, rects };
  }
  return () => { stop(); stopHold(); if (DEBUG) delete window.__grassTest; };
}
