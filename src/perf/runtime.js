// Perf runtime: GPU tiering at boot, the frame-time governor, the 10 Hz culling pass, the frame cap, the F3 HUD and the asset cache.
// The governor is the only code that changes settings.quality or the render scale automatically (render only applies what it is told).
import * as THREE from 'three';
import { renderer, composer, camera, scene } from '../render/renderer.js';
import { render } from '../render/index.js';
import { settings } from '../core/settings.js';
import { bus, EV } from '../core/bus.js';
import { addSystem } from '../core/loop.js';
import { updateCulling, capLights, setLite, bounds, makePropClone, props } from '../world/build.js';
import { perf } from './index.js';
import { budget, TIERS } from './budget.js';
import { pickTier, benchTier, BENCH } from './tier.js';
import { Governor } from './governor.js';

export function initPerf() {
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
  const detected = pickTier(rendererName, { memGB: navigator.deviceMemory });
  const start = settings.autoQuality || !TIERS.includes(settings.quality) ? detected : settings.quality;

  // ---- frame stats: calls / tris summed over every render pass of a frame (shadow, scene, post)
  const st = { calls: 0, tris: 0, fps: 0, ms: 0, gpuMs: 0, tier: start, scale: 1, auto: settings.autoQuality, eco: settings.fpsCap === 30 };
  let fCalls = 0, fTris = 0, pC = 0, pT = 0;
  const origRender = renderer.render.bind(renderer);
  renderer.render = (s, c) => {
    origRender(s, c);
    const r = renderer.info.render;
    let dc = renderer.info.autoReset ? r.calls : r.calls - pC, dt = renderer.info.autoReset ? r.triangles : r.triangles - pT;
    if (dc < 0 || dt < 0) { dc = r.calls; dt = r.triangles; } // someone reset info mid-frame
    pC = r.calls; pT = r.triangles; fCalls += dc; fTris += dt;
  };

  // ---- GPU timer (when the browser exposes it) + the boot micro-benchmark, both around the composer's render
  const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let pending = null, gpuMs = 0, benchFrames = 0, benchT0 = 0, benchDone = !settings.autoQuality;
  const samples = [];
  let renderMs = 0; // time spent inside composer.render (GL submit; on SwiftShader it also absorbs rasterisation)
  const origComposer = composer.render.bind(composer);
  composer.render = (dt) => {
    if (benchDone) { // normal frames: GPU time via a timer query when the browser has one
      const r0 = performance.now();
      if (tq && !pending) { pending = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, pending); origComposer(dt); gl.endQuery(tq.TIME_ELAPSED_EXT); } else origComposer(dt);
      renderMs = performance.now() - r0;
      return;
    }
    const t = performance.now(); origComposer(dt); gl.finish(); const ms = performance.now() - t; // boot benchmark: GPU-synchronous
    if (++benchFrames <= 30) return; // shader compiles and first uploads
    if (!benchT0) benchT0 = t;
    samples.push(ms);
    if (t - benchT0 >= BENCH.ms) {
      benchDone = true; samples.sort((a, b) => a - b);
      st.benchMs = samples[samples.length >> 1];
      const next = benchTier(gov.tier, st.benchMs);
      if (next !== gov.tier) { if (TIERS.indexOf(next) > TIERS.indexOf(gov.maxTier)) gov.maxTier = next; gov.setTier(next); }
    }
  };
  const readGpu = () => {
    if (!pending || !gl.getQueryParameter(pending, gl.QUERY_RESULT_AVAILABLE)) return;
    if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) gpuMs = gl.getQueryParameter(pending, gl.QUERY_RESULT) / 1e6;
    gl.deleteQuery(pending); pending = null;
  };

  // ---- applying a tier
  let selfSet = false, booted = false;
  function applyTier(t) {
    budget.setCurrent(t); perf.tier = t; st.tier = t;
    selfSet = true; if (settings.quality !== t) settings.set('quality', t); selfSet = false;
    render.applyQuality(t);
    setLite(budget.cur.lambert);
    render.setScale(gov.scale);
    skip = 40;
    if (booted) bus.emit(EV.QUALITY, { level: t, auto: settings.autoQuality }); // (the UI toasts governor changes)
  }
  const gov = new Governor({
    tier: start, maxTier: TIERS.indexOf(start) > 3 ? start : 'high',
    onScale: (s) => { st.scale = s; render.setScale(s); },
    onTier: applyTier,
  });
  if (!settings.autoQuality) gov.minTier = gov.maxTier = start; // a manual tier is never moved by the governor
  perf.governor = gov; perf.detected = detected; perf.rendererName = rendererName;
  // settings.quality is always a concrete tier (other modules read it); settings.autoQuality says who owns it.
  perf.setAuto = (on) => { if (settings.autoQuality !== !!on) settings.set('autoQuality', !!on); };
  perf.setEco = (on) => settings.set('fpsCap', on ? 30 : 60);
  perf.stats = () => st;
  bus.on(EV.SETTINGS, ({ key, value }) => {
    if (key === 'quality' && !selfSet && TIERS.includes(value)) { // a manual pick pins the tier; the scale stays automatic
      if (settings.autoQuality) { settings.set('autoQuality', false); return; }
      gov.minTier = gov.maxTier = value; gov.setTier(value);
    } else if (key === 'autoQuality') {
      st.auto = !!value;
      if (value) { gov.minTier = 'potato'; gov.maxTier = TIERS.indexOf(detected) > 3 ? detected : 'high'; benchDone = false; benchFrames = 0; benchT0 = 0; samples.length = 0; gov.setTier(detected); }
      else gov.minTier = gov.maxTier = gov.tier; // keep the current tier, pinned
    } else if (key === 'fpsCap') { st.eco = value === 30; } // (the loop reads settings.fpsCap itself)
    else if (key === 'perfHud') st.hud = !!value;
  });
  addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); settings.set('perfHud', !settings.perfHud); } });
  // the UI's perf HUD reads render.stats(): hand it whole-frame totals (the stub / R's version only see the last pass)
  render.stats = () => ({ calls: st.calls, tris: st.tris, fps: st.fps, scale: st.scale });

  let skip = 0;
  applyTier(start); st.scale = gov.scale;
  booted = true;

  // ---- character impostors: potato / low draw a distant character as one capsule (a character is ~19 meshes). Characters that
  // manage their own LOD (or are one mesh anyway: the glTF rig) are skipped, see lodChar.
  const capsule = new THREE.CapsuleGeometry(0.28, 0.9, 2, 8); capsule.translate(0, 0.73, 0);
  const _w = new THREE.Vector3();
  const lodChar = (root, far) => {
    if (root.userData.ownLod) return;
    let px = root.userData.proxy;
    if (!px) {
      let src = null, n = 0; root.ch.root.traverse((o) => { if (o.isMesh) { n++; if (!src && o.material.color) src = o.material; } });
      if (n <= 4) { root.userData.ownLod = true; return; } // the glTF rig is one skinned mesh with its own LOD (characters/rig.js): only the ~19-mesh procedural fallback needs an impostor
      px = root.userData.proxy = new THREE.Mesh(capsule, new THREE.MeshLambertMaterial({ color: src ? src.color : 0xffffff })); px.userData.src = src; root.add(px);
    }
    px.visible = far; root.ch.root.visible = !far;
    if (far && px.userData.src) px.material.color.copy(px.userData.src.color);
  };
  const cullTick = (() => {
    let acc = 0;
    return (dt) => {
      acc += dt; if (acc < 0.1) return; acc = 0;
      const b = budget.cur, cp = camera.position;
      updateCulling(cp, b.fogCull); capLights(b.lights, cp);
      for (const o of scene.children) {
        if (o.userData.noScan) continue;
        const list = o.ch ? [o] : o.children;
        for (const c of list) {
          if (!c.ch) continue;
          if (!b.lambert) { if (c.userData.proxy) lodChar(c, false); continue; }
          c.getWorldPosition(_w); lodChar(c, _w.distanceToSquared(cp) > b.charLod * b.charLod);
        }
      }
    };
  })();

  // ---- per-frame systems
  let t0 = 0, fpsAcc = 0, fpsN = 0, lastNow = performance.now(), ema = 16.7;
  addSystem({ name: 'perf-begin', order: -1, update() { t0 = performance.now(); } });
  addSystem({ name: 'perf-cull', order: 55, update: cullTick });
  addSystem({
    name: 'perf-end', order: 101,
    update(dt) {
      const now = performance.now(), cpu = now - t0, interval = now - lastNow; lastNow = now;
      if (tq) readGpu();
      st.calls = fCalls; st.tris = fTris; fCalls = fTris = 0;
      const capMs = st.eco ? 33.3 : 16.7;
      const work = interval > capMs * 1.1 ? interval : Math.max(cpu, gpuMs); // missed the cap: the whole interval is the cost; otherwise the measured work
      st.ms = work; st.cpu = cpu; st.js = cpu - renderMs; st.gpuMs = gpuMs; // js = everything except the render call
      fpsAcc += interval; fpsN++; if (fpsAcc >= 500) { st.fps = (fpsN * 1000) / fpsAcc; fpsAcc = fpsN = 0; }
      if (skip > 0) { skip--; } else if (benchDone) gov.frame(work);
    },
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { skip = 20; lastNow = performance.now(); } });

  // ---- repeat visits: hashed assets are cached by the service worker (production builds only)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));

  window.__perf = { st, gov, perf, bounds: () => bounds, makePropClone, props }; // tests/perf/budget.spec.js
}
