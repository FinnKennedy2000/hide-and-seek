// Thin adapter between the game and character.js (the character models, owned separately).
// character.js characters face -Z; the game's avatar convention is "faces +Z", so each one sits in a wrapper turned by PI.
// Also owns the paint-splat texture/material (world decals and splats stuck on characters).
import * as THREE from 'three';
import { createCharacter, HATS, OUTFITS } from './character.js';
export { HATS, OUTFITS };

const rnd = (a, b) => a + Math.random() * (b - a);
const S = THREE.SRGBColorSpace;
const splatGeo = new THREE.PlaneGeometry(1, 1);

// paint splat (also used for world decals): one white blob texture, one material per colour
let splatTexture = null;
const splatMats = new Map();
export function splatMat(color) {
  if (!splatTexture) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#fff';
    g.beginPath(); g.arc(64, 64, 26, 0, 7); g.fill();
    for (let i = 0; i < 9; i++) { const a = rnd(0, 6.3), d = rnd(22, 38); g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rnd(5, 13), 0, 7); g.fill(); }
    for (let i = 0; i < 7; i++) { const a = rnd(0, 6.3), d = rnd(42, 58); g.beginPath(); g.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rnd(2, 4), 0, 7); g.fill(); }
    splatTexture = new THREE.CanvasTexture(c); splatTexture.colorSpace = S;
  }
  let m = splatMats.get(color);
  if (!m) { m = new THREE.MeshBasicMaterial({ map: splatTexture, color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); splatMats.set(color, m); }
  return m;
}


// color: outfit hex. opts: { hat, pattern (an OUTFITS entry), seeker }
export function makeChar(color, { hat = 'none', pattern = 'plain', seeker = false } = {}) {
  const ch = createCharacter({ color, hat, outfit: pattern, seeker });
  ch.root.rotation.y = Math.PI;
  const root = new THREE.Group(); root.add(ch.root); root.ch = ch; root.splats = [];
  return root;
}
export const setSeeker = (root, on) => root.ch.setSeeker(on);
// camouflage: tint toward a sampled colour; null restores
export const tintChar = (root, hex) => root.ch.setTint(hex ?? 0xffffff, hex == null ? 0 : 0.9);
export const flinch = (root) => root.ch.play('hit');
export const taunt = (root) => root.ch.play('taunt');
// a: { speed (m/s), crouch 0..1, air, lat (-1..1 sideways motion) }
export const animate = (root, dt, a = {}) => root.ch.update(dt, { speed: a.speed || 0, crouch: (a.crouch || 0) > 0.4, airborne: !!a.air, lookYaw: (a.lat || 0) * 0.5 });
export const disposeChar = (root) => root.ch.dispose();

// paint splat stuck on the body (front and back) so a tagged hider stays revealed
export function paintChar(root, color) {
  const m = splatMat(color);
  for (const [z, ry] of [[0.3, 0], [-0.3, Math.PI]]) {
    const p = new THREE.Mesh(splatGeo, m); p.position.set(rnd(-0.08, 0.08), 1.0 + rnd(-0.1, 0.1), z); p.rotation.set(0, ry, rnd(0, 6)); p.scale.setScalar(rnd(0.3, 0.42));
    root.add(p); root.splats.push(p);
  }
  while (root.splats.length > 6) root.remove(root.splats.shift());
}
export function clearPaint(root) { for (const p of root.splats) root.remove(p); root.splats.length = 0; }
