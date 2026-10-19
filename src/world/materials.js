import * as THREE from 'three';
import { rnd } from '../core/util.js';

// procedural textures + the shared material table (maps may add more via their `materials` export, see setWorld)
function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const speckle = (g, s, n, hue, sat, l0, l1, sz = 2) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(${hue + rnd(-8, 8)},${sat + rnd(-8, 8)}%,${rnd(l0, l1)}%)`;
    g.fillRect(Math.random() * s, Math.random() * s, sz, sz + rnd(0, 3));
  }
};
export const grassTex = canvasTex(256, (g, s) => { g.fillStyle = '#2a4226'; g.fillRect(0, 0, s, s); speckle(g, s, 5000, 105, 38, 14, 30); }, 36, 36);
const hedgeTex = canvasTex(128, (g, s) => { g.fillStyle = '#1f3a22'; g.fillRect(0, 0, s, s); speckle(g, s, 2500, 110, 40, 12, 32, 3); }, 3, 1);
const plasterTex = canvasTex(128, (g, s) => { g.fillStyle = '#cdbfae'; g.fillRect(0, 0, s, s); speckle(g, s, 1500, 30, 15, 60, 78, 1); }, 1, 1);
const floorTex = canvasTex(256, (g, s) => {
  const n = 8, w = s / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(28,${rnd(35, 45)}%,${rnd(22, 32)}%)`; g.fillRect(i * w, 0, w, s);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * w, 0, 2, s);
    for (let k = 0; k < 18; k++) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(i * w + Math.random() * w, Math.random() * s, 1, rnd(10, 60)); }
    g.fillRect(i * w, ((i * 97) % s), w, 2);
  }
}, 8, 6);
const woodTex = canvasTex(128, (g, s) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(28,${rnd(30, 42)}%,${rnd(26, 38)}%)`; g.fillRect(0, i * s / 8, s, s / 8); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, i * s / 8, s, 2); }
  speckle(g, s, 300, 28, 30, 18, 30, 1);
});
export const bookTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#3b2a20'; g.fillRect(0, 0, s, s);
  for (let r = 0; r < 5; r++) {
    let x = 6;
    while (x < s - 12) {
      const w = rnd(6, 14), h = rnd(30, 44);
      g.fillStyle = `hsl(${rnd(0, 360)},${rnd(35, 65)}%,${rnd(28, 52)}%)`;
      g.fillRect(x, r * 51 + 46 - h, w, h);
      x += w + 1;
    }
    g.fillStyle = '#6a4a32'; g.fillRect(0, r * 51 + 46, s, 5);
  }
});

export const M = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
export const mat = {
  wall: M(0xffffff, 0.95, { map: plasterTex }),
  floor: M(0xffffff, 0.55, { map: floorTex }),
  grass: M(0xffffff, 1, { map: grassTex }),
  roof: M(0x2b2833, 0.9),
  wood: M(0xffffff, 0.85, { map: woodTex }),
  hedge: M(0xffffff, 1, { map: hedgeTex }),
  fabricRed: M(0x8a3b3f, 1), fabricBlue: M(0x3d5878, 1), fabricGreen: M(0x4e6b4a, 1), white: M(0xe8e4dc, 0.9),
  dark: M(0x2a2630, 0.6), metal: M(0x9aa0aa, 0.35, { metalness: 0.6 }), stone: M(0x8a8790, 0.95, { flatShading: true }),
  leaf: M(0x2f5c36, 0.9, { flatShading: true }), bark: M(0x4a3426, 1), rug: M(0x7a3b4a, 1), counter: M(0xbfb8ad, 0.4),
  glow: new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffc477, emissiveIntensity: 2.4 }),
  tv: new THREE.MeshStandardMaterial({ color: 0x050508, emissive: 0x3b6cff, emissiveIntensity: 0.9 }),
  car: M(0x1d5c63, 0.35, { metalness: 0.4 }), glass: M(0x10161c, 0.1, { metalness: 0.6 }),
  slate: M(0x777b86, 0.9),
};

// ----- potato/low: cheap Lambert twins of the Standard materials (no PBR, no env). Cached both ways so swapping is allocation-free.
const toLam = new WeakMap(), toStd = new WeakMap();
const COPY = ['color', 'map', 'emissive', 'emissiveIntensity', 'emissiveMap', 'aoMap', 'aoMapIntensity', 'lightMap', 'alphaMap', 'alphaTest', 'transparent', 'opacity', 'side', 'vertexColors', 'flatShading', 'fog', 'depthWrite', 'name'];
function syncLambert(l, m) { // textures.js mutates the Standard originals after setWorld (async texture loads), so twins re-copy on every scan
  for (const k of COPY) if (m[k] !== undefined) { if (l[k]?.copy && m[k]?.isColor) l[k].copy(m[k]); else if (l[k] !== m[k]) { l[k] = m[k]; if (k.endsWith('ap')) l.needsUpdate = true; } }
}
function lambertOf(m) {
  let l = toLam.get(m);
  if (!l) { l = new THREE.MeshLambertMaterial(); toLam.set(m, l); toStd.set(l, m); }
  syncLambert(l, m);
  return l;
}
const swap = (m, lambert) => (lambert ? (m.isMeshStandardMaterial ? lambertOf(m) : toStd.has(m) ? (syncLambert(m, toStd.get(m)), m) : m) : (toStd.get(m) ?? m));
// Swap every mesh under `root` to Lambert (true) or back to the original (false). Returns the number of meshes changed.
export function useLambert(root, lambert) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const cur = o.material, next = Array.isArray(cur) ? cur.map((m) => swap(m, lambert)) : swap(cur, lambert);
    if (Array.isArray(cur) ? next.some((m, i) => m !== cur[i]) : next !== cur) { o.material = next; n++; }
  });
  return n;
}
