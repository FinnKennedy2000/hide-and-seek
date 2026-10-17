import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { bus, EV } from '../core/bus.js';
import { TILE } from './bake.js';

// PBR texture sets (CC0, ambientCG; see ASSETS.md) and canvas-drawn signs, pictures and floor decals.
// materials.js is owned by the render workstream, so everything here MUTATES the shared `mat` table after setWorld has filled it:
// applyPBR(mat, mapId, mapMaterialNames) swaps in the sets, tints per map and draws the canvas materials that a map declares.
// Sets live in public/textures/<set>/{c,n,r}_{1024,512}.webp (colour, GL normal, roughness). 1K on med/high/ultra; 512 on low and
// potato; potato also drops the normal and roughness maps, low drops roughness. Missing files fail soft (assetFail + flat colour).

export const tier = () => settings.quality; // 'potato' | 'low' | 'med' | 'high' | 'ultra'
const small = () => tier() === 'low' || tier() === 'potato';

// material name -> texture set; rough: roughness multiplier when a roughness map is present
const SETS = {
  wall: { dir: 'wall', rough: 1 }, floor: { dir: 'floor', rough: 0.9 }, wood: { dir: 'wood', rough: 1 }, metal: { dir: 'metal', rough: 1 },
  tile: { dir: 'tile', rough: 0.9 }, asphalt: { dir: 'asphalt', rough: 1 }, grass: { dir: 'grass', rough: 1, ground: 400 },
};
// per-map colour multipliers on top of the (neutral) textures
const TINT = {
  house: { wall: 0xe3d3bc, floor: 0xffffff, wood: 0xe8d4bb, metal: 0xc4cad4, grass: 0xc9d9b8 },
  lateshop: { wall: 0xe4e8ee, wood: 0xdcc8ac, metal: 0xd4dae4, tile: 0xffffff, asphalt: 0xb8bcc4 },
};

const loader = new THREE.TextureLoader(), cache = new Map(), reported = new Set();
function load(set, kind, size, rep = 0) { // rep > 0: its own instance with that repeat (the ground plane tiles by UV, not by world UV)
  const url = `/textures/${set}/${kind}_${size}.webp`, ck = `${url}#${rep}`;
  let t = cache.get(ck);
  if (t) return t;
  t = loader.load(url, undefined, undefined, () => {
    if (reported.has(url)) return; reported.add(url);
    bus.emit(EV.ASSET_FAIL, { group: 'world', key: `${set}/${kind}`, url, error: 'texture failed to load' });
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = kind === 'c' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = small() ? 1 : 4;
  if (rep) t.repeat.set(rep, rep);
  cache.set(ck, t);
  return t;
}

let last = null;
export function applyPBR(mat, mapId, mapMaterials = []) {
  last = { mat, mapId, mapMaterials };
  const size = small() ? 512 : 1024, normals = tier() !== 'potato', rough = !small();
  for (const [name, cfg] of Object.entries(SETS)) {
    const m = mat[name];
    if (!m) continue;
    const tint = TINT[mapId]?.[name];
    if (tint != null) m.color.setHex(tint); else if (!m.userData.pbr) m.color.setHex(0xffffff);
    const rep = cfg.ground ? cfg.ground / (TILE[name] ?? 1) : 0;
    m.map = load(cfg.dir, 'c', size, rep);
    m.normalMap = normals ? load(cfg.dir, 'n', size, rep) : null;
    m.roughnessMap = rough ? load(cfg.dir, 'r', size, rep) : null;
    if (!m.userData.pbr) { m.userData.pbr = true; m.userData.baseRough = m.roughness; }
    m.roughness = rough ? cfg.rough : Math.min(1, m.userData.baseRough * 1.1);
    m.needsUpdate = true;
  }
  for (const n of mapMaterials) drawn(mat[n], n);
}
bus.on(EV.SETTINGS, ({ key }) => { if (key === 'quality' && last) applyPBR(last.mat, last.mapId, last.mapMaterials); });

// ----- canvas materials: sign_* (lettered boards), art_* (framed pictures), decal_* (alpha floor marks)
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const SIGNS = {
  sign_fresh: ['FRESH PRODUCE', '#1f6d36'], sign_checkout: ['CHECKOUT', '#23458a'], sign_exit: ['EXIT', '#1c7a42'], sign_staff: ['STAFF ONLY', '#8a2626'],
  sign_chilled: ['CHILLED', '#1d6e94'], sign_bay: ['LOADING BAY', '#a3730f'], sign_wc: ['WC', '#4a4a8a'], sign_office: ['OFFICE', '#4a4f57'],
  sign_open: ['OPEN LATE', '#a32a2a'], sign_a1: ['AISLE 1', '#3b4f6b'], sign_a2: ['AISLE 2', '#3b4f6b'], sign_a3: ['AISLE 3', '#3b4f6b'],
  sign_a4: ['AISLE 4', '#3b4f6b'], sign_a5: ['AISLE 5', '#3b4f6b'], sign_a6: ['AISLE 6', '#3b4f6b'], sign_cars: ['CAR PARK', '#2d5a3a'],
  sign_stock: ['STOCK ROOM', '#55606e'], sign_wet: ['WET FLOOR', '#c9a100'],
};
const ART = {
  art_hills: (g, w, h) => { g.fillStyle = '#e6c9a0'; g.fillRect(0, 0, w, h); g.fillStyle = '#d6894a'; g.beginPath(); g.arc(w * 0.7, h * 0.35, h * 0.14, 0, 7); g.fill(); g.fillStyle = '#5b7a5a'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.6); g.quadraticCurveTo(w * 0.3, h * 0.35, w * 0.6, h * 0.7); g.lineTo(w, h * 0.55); g.lineTo(w, h); g.fill(); },
  art_sea: (g, w, h) => { g.fillStyle = '#9db8c9'; g.fillRect(0, 0, w, h * 0.55); g.fillStyle = '#2f5878'; g.fillRect(0, h * 0.55, w, h); g.fillStyle = '#f2e8d0'; g.fillRect(w * 0.55, h * 0.3, 6, h * 0.3); g.beginPath(); g.moveTo(w * 0.55 + 6, h * 0.3); g.lineTo(w * 0.8, h * 0.55); g.lineTo(w * 0.55 + 6, h * 0.55); g.fill(); },
  art_abstract: (g, w, h) => { g.fillStyle = '#efe6d8'; g.fillRect(0, 0, w, h); for (const [c, x, y, r] of [['#b5483c', 0.3, 0.4, 0.22], ['#2f6a8a', 0.6, 0.55, 0.28], ['#d9a93a', 0.45, 0.7, 0.14]]) { g.fillStyle = c; g.beginPath(); g.arc(w * x, h * y, h * r, 0, 7); g.fill(); } },
};
const DECALS = {
  decal_stain: (g, w, h) => { for (let i = 0; i < 9; i++) { const r = w * (0.1 + Math.random() * 0.22), x = w * (0.3 + Math.random() * 0.4), y = h * (0.3 + Math.random() * 0.4), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,30,20,.34)'); gr.addColorStop(1, 'rgba(40,30,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } },
  decal_scuff: (g, w, h) => { g.strokeStyle = 'rgba(20,20,22,.35)'; for (let i = 0; i < 26; i++) { g.lineWidth = 1 + Math.random() * 3; g.beginPath(); const x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y); g.lineTo(x + 30 + Math.random() * 90, y + (Math.random() - 0.5) * 30); g.stroke(); } },
  decal_hazard: (g, w, h) => { g.fillStyle = '#e8b800'; g.fillRect(0, 0, w, h); g.fillStyle = '#16161a'; for (let x = -h; x < w + h; x += 64) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 32, h); g.lineTo(x + 32 + h, 0); g.lineTo(x + h, 0); g.fill(); } g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 220; i++) g.fillRect(Math.random() * w, Math.random() * h, 3, 2); },
  decal_arrow: (g, w, h) => { g.fillStyle = 'rgba(235,235,225,.82)'; g.beginPath(); g.moveTo(w * 0.1, h * 0.38); g.lineTo(w * 0.55, h * 0.38); g.lineTo(w * 0.55, h * 0.15); g.lineTo(w * 0.92, h * 0.5); g.lineTo(w * 0.55, h * 0.85); g.lineTo(w * 0.55, h * 0.62); g.lineTo(w * 0.1, h * 0.62); g.fill(); },
  decal_leaves: (g, w, h) => { for (let i = 0; i < 70; i++) { g.fillStyle = `hsla(${25 + Math.random() * 25},55%,${25 + Math.random() * 20}%,.9)`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 6, 2 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill(); } },
  decal_puddle: (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(120,150,190,.5)'); gr.addColorStop(0.75, 'rgba(90,110,140,.35)'); gr.addColorStop(1, 'rgba(90,110,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); },
  decal_lane: (g, w, h) => { g.fillStyle = 'rgba(236,236,226,.8)'; g.fillRect(w * 0.45, 0, w * 0.1, h); },
};
function sign([text, bg], g, w, h) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#f4f1e8'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let px = 84; g.font = `bold ${px}px system-ui, sans-serif`;
  while (g.measureText(text).width > w - 60 && px > 20) { px -= 4; g.font = `bold ${px}px system-ui, sans-serif`; }
  g.fillText(text, w / 2, h / 2 + 4);
}
const drawnCache = new Map();
function drawn(m, name) {
  if (!m || m.userData.drawn) return;
  let t = drawnCache.get(name);
  if (!t) {
    if (SIGNS[name]) t = canvasTex(512, 128, (g, w, h) => sign(SIGNS[name], g, w, h));
    else if (ART[name]) t = canvasTex(256, 256, ART[name]);
    else if (DECALS[name]) t = canvasTex(256, 256, DECALS[name]);
    if (t) drawnCache.set(name, t);
  }
  if (!t) return;
  m.userData.drawn = true; m.map = t; m.color.setHex(0xffffff);
  if (SIGNS[name]) { m.emissiveMap = t; m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.28; }
  if (DECALS[name]) { Object.assign(m, { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }); }
  m.needsUpdate = true;
}
