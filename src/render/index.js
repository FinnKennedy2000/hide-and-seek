// Render facade: quality presets, per-map environment / grade, cascaded sun shadows, blob shadows, flicker, context-loss recovery.
// It never changes quality by itself: perf's governor calls applyQuality(level) and setScale(s).
import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import { renderer, scene, camera, canvas, view, setComposer, resize } from './renderer.js';
import { buildPipeline, lutFor } from './post.js';
import { useLambert } from '../world/materials.js';
import { settings } from '../core/settings.js';
import { bus, EV } from '../core/bus.js';
import { loadGroup } from '../core/assets.js';

// pr = pixel-ratio cap; shadow = 'off' | 'sun' (one map, size) | 'csm' (cascades, size); lambert = cheap materials + blob shadows
const PRESETS = {
  potato: { pr: 1, lambert: true, env: false, shadow: 'off', aa: 'fxaa' },
  low: { pr: 1.25, lambert: true, env: false, shadow: 'off', aa: 'fxaa' },
  med: { pr: 1.25, lambert: false, env: true, shadow: 'sun', size: 1024, casters: 100, aa: 'smaa', bloom: true, lut: true, vignette: true, ca: true },
  high: { pr: 1.5, lambert: false, env: true, shadow: 'csm', cascades: 2, size: 1024, casters: 55, aa: 'smaa', bloom: true, lut: true, vignette: true, grain: true, ca: true },
  ultra: { pr: 1.5, lambert: false, env: true, shadow: 'csm', cascades: 2, size: 2048, casters: 65, aa: 'smaa', bloom: true, lut: true, vignette: true, grain: true, ca: true, ao: true },
};
const isCharacter = (o) => { for (let p = o.parent; p; p = p.parent) if (p.userData.keepShadow) return true; return false; };
const LOW_FILL = 1.7;
const ENV_URL = { dusk: '/env/dusk.hdr', night: '/env/night.hdr' };

let level = null, cfg = PRESETS.high, pipe = null, N8AO = null, csm = null, csmMats = new WeakSet();
let sky = 'dusk', lost = false, hitT = 0, fpsEma = 60, lastNow = 0, lastScan = 0, last = { calls: 0, tris: 0 };
let pmrem = null, envRT = null; const hdrs = {}; // equirect textures by sky key (kept in RAM: survives context loss, PMREM is rebuilt from them)
const blobs = new Set(), flickers = [];

// ----- environment lighting (med and up): PMREM from a CC0 Poly Haven HDRI per map
async function loadEnv(key) {
  if (!ENV_URL[key] || hdrs[key]) return;
  const got = await loadGroup(`env-${key}`, [{ key, url: ENV_URL[key], type: 'hdr' }]); // never rejects; failure -> toast via assetFail, flat hemisphere stays
  if (got.get(key)) hdrs[key] = got.get(key);
}
function applyEnvLight() {
  if (!cfg.env || !hdrs[sky]) { scene.environment = null; return; }
  pmrem ??= new THREE.PMREMGenerator(renderer);
  envRT?.dispose();
  envRT = pmrem.fromEquirectangular(hdrs[sky]);
  scene.environment = envRT.texture;
  scene.environmentIntensity = sky === 'night' ? 0.55 : 0.4;
}

// ----- shadows
function dropCsm() { if (csm) { csm.remove(); csm.dispose(); csm = null; csmMats = new WeakSet(); } }
const findSun = () => { let s = null; scene.traverse((o) => { if (!s && o.isDirectionalLight && !csm?.lights.includes(o)) s = o; }); return s; };
// Lambert presets get no env light: lift the hemisphere fill instead. env.js rewrites hemi.intensity per map, so setMap resets the bookkeeping.
const hemis = () => { const h = []; scene.traverse((o) => { if (o.isHemisphereLight) h.push(o); }); return h; };
function applyFill() { for (const h of hemis()) { const b = h.userData.boost ?? 1, want = cfg.lambert ? LOW_FILL : 1; h.intensity *= want / b; h.userData.boost = want; } }
function applyShadows() {
  applyFill();
  const sun = findSun();
  renderer.shadowMap.enabled = cfg.shadow !== 'off';
  // Re-creating a CSM with the same defines reuses compiled programs whose CSM uniforms the old dispose() deleted (render-time TypeError), so keep a live CSM when only its map size changes.
  if (!(cfg.shadow === 'csm' && csm?.cascades === cfg.cascades)) dropCsm();
  if (sun) {
    sun.castShadow = cfg.shadow === 'sun';
    if (cfg.shadow === 'sun') { sun.shadow.mapSize.set(cfg.size, cfg.size); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    if (cfg.shadow === 'csm') {
      if (!csm) {
        csm = new CSM({ camera, parent: scene, cascades: cfg.cascades, maxFar: 40, mode: 'practical', shadowMapSize: cfg.size, shadowBias: -0.0002,
          lightDirection: sun.position.clone().sub(sun.target.position).normalize().negate(), lightIntensity: sun.intensity });
        for (const l of csm.lights) { l.color.copy(sun.color); l.shadow.normalBias = 0.04; }
      } else for (const l of csm.lights) { l.shadow.mapSize.set(cfg.size, cfg.size); l.shadow.map?.dispose(); l.shadow.map = null; }
      csm.lightDirection.copy(sun.position).sub(sun.target.position).normalize().negate(); // per-map sun (env.js meta.sun.dir), also when the CSM is kept
      for (const l of csm.lights) { l.color.copy(sun.color); l.intensity = sun.intensity; }
      sun.castShadow = false;
    }
  }
  refresh(true);
}

// Re-applied on map build and once a second: swaps materials for the preset and wires new ones into CSM (characters / maps are built elsewhere).
function refresh(force) {
  if (cfg.lambert !== undefined) useLambert(scene, cfg.lambert);
  const sun = findSun();
  if (csm && sun) for (const l of csm.lights) l.visible = sun.visible; // night maps have no sun
  if (csm) scene.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of [].concat(o.material)) if (!csmMats.has(m) && m.isMeshStandardMaterial) { csm.setupMaterial(m); m.needsUpdate = true; csmMats.add(m); }
  });
  // Shadow passes re-draw every caster per cascade, so cap the casters per preset (biggest first). Characters (under a blobShadow root, or skinned) always cast.
  const cand = [];
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || isCharacter(o)) return;
    o.userData.cast0 ??= o.castShadow;
    if (!o.userData.cast0) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    cand.push([o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z), o]);
  });
  cand.sort((x, y) => y[0] - x[0]);
  cand.forEach(([, o], i) => { o.castShadow = i < (cfg.casters ?? Infinity); });
  if (force) scene.traverse((o) => { if (o.isMesh && o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
}

// ----- pipeline
function rebuild() {
  try { pipe?.composer.dispose(); } catch (e) { console.warn('composer dispose failed', e); }
  pipe = buildPipeline(cfg, sky, cfg.ao ? N8AO : null);
  setComposer(pipe.composer);
}

export const render = {
  init() {}, // the renderer owns the canvas (render/renderer.js); everything is wired at import below
  applyQuality(l) { // 'potato' | 'low' | 'med' | 'high' | 'ultra'
    if (!PRESETS[l] || l === level) return;
    level = l; cfg = PRESETS[l];
    view.pr = Math.min(window.devicePixelRatio || 1, cfg.pr);
    for (const b of [...blobs]) { if (!b.parent) blobs.delete(b); else b.visible = cfg.lambert; }
    if (cfg.env) loadEnv(sky).then(applyEnvLight); else applyEnvLight();
    if (cfg.ao && !N8AO) import('n8ao').then((m) => { N8AO = m.N8AOPostPass; if (level === l) rebuild(); }).catch((e) => console.warn('n8ao failed to load, AO off', e));
    rebuild(); applyShadows(); resize();
  },
  setScale(s) { // dynamic resolution, 0.6..1 of the preset's pixel ratio
    s = Math.min(1, Math.max(0.6, s)); if (Math.abs(s - view.scale) < 0.01) return;
    view.scale = s; resize();
  },
  setMap(meta) { // grade + environment light + shadow wiring for a freshly built map; called before the map's meshes exist, so refresh runs after the build
    for (const h of hemis()) h.userData.boost = 1; // env.js just wrote a raw intensity
    sky = meta.sky === 'night' ? 'night' : 'dusk';
    if (pipe?.lutFx) pipe.lutFx.lut = lutFor(sky);
    if (cfg.env) loadEnv(sky).then(applyEnvLight);
    queueMicrotask(applyShadows);
  },
  addFlicker(light, amount = 1) { const f = { l: light, base: light.intensity, dip: 0, amount }; flickers.push(f); return () => { const i = flickers.indexOf(f); if (i >= 0) flickers.splice(i, 1); }; },
  // Cheap ground shadow for potato/low (no realtime shadows there). `obj`'s origin must be at its feet. Hidden automatically on higher presets.
  blobShadow(obj, radius = 0.5) {
    blobTex ??= makeBlobTex();
    const m = new THREE.Mesh(blobGeo, blobMat);
    m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.scale.setScalar(radius * 2); m.renderOrder = 1; m.visible = cfg.lambert; m.name = 'blob';
    obj.userData.keepShadow = true; obj.add(m); blobs.add(m); return m;
  },
  // Compile `obj`'s programs for the current preset before it is added to the scene (KHR_parallel_shader_compile where available), with
  // the same material swap and CSM wiring the 1 Hz refresh would do, so its first visible frame does not stall on shader compiles.
  // `patch()` runs after the swap (onBeforeCompile hooks the caller puts on the swapped-in materials, e.g. the grass shader).
  async warm(obj, patch) {
    if (cfg.lambert !== undefined) useLambert(obj, cfg.lambert);
    patch?.();
    if (csm) obj.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) if (!csmMats.has(m) && m.isMeshStandardMaterial) { csm.setupMaterial(m); m.needsUpdate = true; csmMats.add(m); } });
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(pipe?.composer.inputBuffer ?? null); // programs are keyed on the target's colour space: compile for the RenderPass's target
    try { const p = renderer.compileAsync(obj, camera, scene); renderer.setRenderTarget(prev); await p; } catch (e) { renderer.setRenderTarget(prev); console.warn('shader warm-up failed (compiles on first sight instead)', e); }
  },
  hit() { hitT = 0.25; }, // brief chromatic aberration on a hit
  stats() { return { calls: last.calls, tris: last.tris, fps: Math.round(fpsEma) }; }, // last frame, all passes
  frame(dt) {
    if (lost || renderer.getContext().isContextLost()) return;
    const now = performance.now(); if (lastNow) fpsEma += (1000 / Math.max(1, now - lastNow) - fpsEma) * 0.1; lastNow = now;
    for (let i = flickers.length - 1; i >= 0; i--) {
      const f = flickers[i]; if (!f.l.parent) { flickers.splice(i, 1); continue; }
      f.dip -= dt; if (f.dip <= 0 && Math.random() < dt * 0.05) f.dip = 0.05 + Math.random() * 0.1;
      f.l.intensity = f.base * (f.dip > 0 ? 1 - f.amount * (0.55 - Math.random() * 0.25) : 1 - f.amount * Math.random() * 0.04);
    }
    if (pipe?.caFx) { hitT = Math.max(0, hitT - dt); const a = hitT * 0.012; pipe.caFx.offset.set(a, a); }
    if (csm) { csm.update(); if (csm.camera.fov !== csmFov || csm.camera.aspect !== csmAsp) { csmFov = camera.fov; csmAsp = camera.aspect; csm.updateFrustums(); } }
    if (now - lastScan > 1000) { lastScan = now; refresh(false); }
    renderer.info.reset();
    pipe.composer.render(dt);
    last = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  },
};
let csmFov = 0, csmAsp = 0, blobTex = null;
const blobGeo = new THREE.PlaneGeometry(1, 1);
const blobMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: 0.5, color: 0x000000 });
function makeBlobTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  blobMat.alphaMap = new THREE.CanvasTexture(c); blobMat.needsUpdate = true;
  return blobMat.alphaMap;
}

// ----- context loss: pause rendering, then rebuild everything GL-side (PMREM env, composer targets, shadow maps) on restore
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
canvas.addEventListener('webglcontextrestored', () => {
  lost = false; pmrem = null; envRT = null; // old GL objects died with the context
  rebuild(); applyEnvLight(); applyShadows(); resize();
});
bus.on(EV.SETTINGS, ({ key, value }) => { if (key === 'quality') render.applyQuality(value); });
bus.on(EV.HITMARKER, () => render.hit());
render.applyQuality(settings.quality);
