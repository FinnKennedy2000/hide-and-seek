// Adapter between the game and the two character implementations: GLB models (glb.js, FIELD pack, primary) and the procedural workwear
// humans (character.js, fallback when a model is missing or still downloading). Both face +Z (the game's avatar convention) and share one
// API, so a character created before the models arrive is upgraded in place once they load (same root, state carried over).
// Also owns the paint-splat texture/material (world decals and splats stuck on characters).
import * as THREE from 'three';
import { createCharacter as createProcedural, HATS, OUTFITS, SEEKER_CLASSES, STAND_TOP, CROUCH_TOP } from './character.js';
import { createGlbCharacter, glbReady, glbStatus, onGlbReady, preloadGlb, MODEL_OF } from './glb.js';
import { bus, EV } from '../core/bus.js';
import { DEBUG } from '../core/state.js';
export { HATS, OUTFITS, SEEKER_CLASSES, STAND_TOP, CROUCH_TOP };
// 'loading' (not started or in flight) | 'ready' (all GLBs in use) | 'failed' (>= 1 model failed: those roles use the procedural humans; logged + assetFail toast)
export const rigStatus = () => { const s = glbStatus(); return s === 'idle' ? 'loading' : s; };
export { preloadGlb };

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


const live = new Set(); // hybrids waiting for / using a model
onGlbReady(() => { for (const h of live) { try { h.refresh(); } catch (e) { console.error('[characters] upgrading a character to its GLB model failed:', e); } } });
if (DEBUG) window.__rig = () => ({ status: rigStatus(), kinds: [...live].map((h) => h.kind) }); // debug signal: which characters are on the procedural fallback
let warnedFallback = false;

function hybrid({ color, hat, outfit, seeker, cls }, holder) {
  const outer = new THREE.Group(), st = { seeker: !!seeker, cls: SEEKER_CLASSES.includes(cls) ? cls : 'tracker', tint: null, amt: 0, crouchH: null, concealed: false, mode: null, held: true };
  let impl = null;
  const swatch = (c) => { const h = (Math.imul((c | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 8; return [0x5a5f3a, 0x7a4a2e, 0x3f5568, 0x6b5a45, 0x4a4f52, 0x44503a, 0x7d6f3c, 0x5e3a36][h]; };
  const modelId = () => MODEL_OF[st.seeker ? st.cls : 'hider'];
  function make() {
    const kind = glbReady(modelId()) ? 'glb' : 'procedural';
    if (impl && impl.kind === kind) return;
    let n;
    if (kind === 'glb') {
      try { n = createGlbCharacter({ cls: st.cls, seeker: st.seeker, tint: swatch(color), hat }); }
      catch (e) { console.error(`[characters] GLB character ${modelId()} could not be built, using the procedural human:`, e); bus.emit(EV.ASSET_FAIL, { group: 'characters', key: modelId(), url: '', error: String(e?.message || e) }); }
    } else if (glbStatus() === 'failed' && !warnedFallback) { warnedFallback = true; console.warn(`[characters] ${modelId()} is on the procedural fallback (its GLB failed to load)`); }
    n ??= createProcedural({ color, hat, outfit, seeker: st.seeker, cls: st.cls });
    if (impl) { outer.remove(impl.root); impl.dispose(); }
    impl = n; outer.add(n.root); holder.userData.ownLod = n.kind === 'glb'; // perf/runtime.js swaps many-mesh characters for a capsule at range: the merged GLB models (2-5 meshes) are cheap, the procedural fallback is not
    if (st.tint != null) n.setTint(st.tint, st.amt);
    if (st.crouchH != null) n.setCrouchHeight(st.crouchH);
    n.setConcealed(st.concealed); n.setHeld?.(st.held); if (st.mode) n.play(st.mode);
    n.update(0, {});
  }
  const ch = {
    get kind() { return impl.kind; }, root: outer,
    refresh: make,
    update: (dt, a) => { if (outer.visible) impl.update(dt, a); },
    play(name) { if (['tagged', 'victory', 'interact', 'vault', 'injured', 'caged'].includes(name)) st.mode = name; else if (name === 'reset' || name === 'idle') st.mode = null; impl.play(name); },
    setSeeker(on, c) { st.seeker = !!on; if (SEEKER_CLASSES.includes(c)) st.cls = c; make(); impl.setSeeker(on, c); },
    setTint(c, amt = 0) { st.tint = amt ? c : null; st.amt = amt; impl.setTint(c, amt); },
    setCrouchHeight(h) { st.crouchH = h; impl.setCrouchHeight(h); },
    setConcealed(on) { st.concealed = !!on; impl.setConcealed(on); },
    setHeld(on) { st.held = !!on; impl.setHeld?.(on); }, // the seeker's own carried prop (trap while placing / none left); a no-op for the procedural fallback
    headTop: () => impl.headTop(),
    dispose() { live.delete(ch); impl.dispose(); },
  };
  make(); live.add(ch);
  return ch;
}

// the unrooted form (ui/podium.js): { root, update, play, setSeeker, ... } with the same GLB-first behaviour
export const createCharacter = ({ color = 0x4cc9f0, hat = 'none', outfit = 'plain', seeker = false, cls = null } = {}) => hybrid({ color, hat, outfit, seeker, cls }, new THREE.Object3D());

// color: lobby colour (picks a muted swatch). opts: { hat, pattern (an OUTFITS entry), seeker, cls (a SEEKER_CLASSES entry) }
export function makeChar(color, { hat = 'none', pattern = 'plain', seeker = false, cls = null } = {}) {
  const root = new THREE.Group(); root.splats = [];
  const ch = hybrid({ color, hat, outfit: pattern, seeker, cls }, root);
  root.add(ch.root); root.ch = ch;
  return root;
}
export const setSeeker = (root, on, cls) => root.ch.setSeeker(on, cls);
export const setConcealed = (root, on) => root.ch.setConcealed(on);
export const setCrouchHeight = (root, h) => root.ch.setCrouchHeight(h); // head-top (m) when fully crouched, default CROUCH_TOP
export const headTop = (root) => root.ch.headTop();
// camouflage: tint toward a sampled colour; null restores
export const tintChar = (root, hex) => root.ch.setTint(hex ?? 0xffffff, hex == null ? 0 : 0.9);
export const flinch = (root) => root.ch.play('hit');
export const taunt = (root) => root.ch.play('taunt');
export const setHeld = (root, on) => root.ch.setHeld(on); // carried prop visible (Trapper: false while placing a trap or with none left)
export const playChar = (root, name) => root.ch.play(name); // 'taunt' | 'hit' | 'tagged' | 'victory' | 'interact' | 'vault' | 'injured' | 'caged' | 'reset'
// a: { speed (m/s), crouch 0..1 (continuous), air, lat (-1..1 sideways motion), pitch (radians, + = looking up) }
export const animate = (root, dt, a = {}) => root.ch.update(dt, { speed: a.speed || 0, crouch: a.crouch || 0, airborne: !!a.air, lookYaw: (a.lat || 0) * 0.5, aimPitch: a.pitch || 0 });
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
