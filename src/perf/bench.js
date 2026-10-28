// One-click GPU benchmark on Coldwood Farm: open /?debug=1&perf=1 in the browser you want numbers for (local `npm start`, or the deployed
// site). Per run it hosts an online TRIAL room with bots (falls back to the bare map, no chase view, when there is no server), then records:
//   tour       a 15 m/s fly-through of every district right after the map appears: first-visibility hitches (shader compiles, uploads)
//   views      fixed camera poses (spawn, grass edge, inside grass, wide vista, barn interior, bot chase): 1.5 s settle + `secs` s each
//   tourWarm   the same fly-through again: what the tour costs once everything has been seen
// Runs: `auto` (auto quality + governor: what a player gets by default), then each fixed preset (governor off, the preset's start scale).
// The world build reads the preset, so every run boots the page fresh: the bench reloads itself, keeps the plan and results in
// sessionStorage and restores the player's own settings at the end.
// Output: an on-screen table with a copy button, console '[bench] {...}', window.__bench.result (tests/perf/gpu-bench.mjs reads it).
// Options: &tiers=auto,low,med,high  &secs=5  &scale=1 (fixed runs at this render scale instead of the preset's)  &uncap=1 (ignore the in-game 60 fps cap; pair it with Chrome --disable-gpu-vsync
// --disable-frame-rate-limit to see the headroom above the display rate).
import { camera, renderer } from '../render/renderer.js';
import { addSystem } from '../core/loop.js';
import { settings } from '../core/settings.js';
import { G, hooks } from '../core/state.js';
import { setWorld } from '../world/build.js';
import { summarize } from './helpers.js';

const KEY = 'hs-bench', OPTS = 'hs-opts';
const qs = new URLSearchParams(location.search);
const SECS = Math.max(1, +qs.get('secs') || 5), UNCAP = qs.get('uncap') === '1', SCALE = +qs.get('scale') || 0;
const RUNS = (qs.get('tiers') || 'auto,low,med,high').split(',').filter((t) => ['auto', 'potato', 'low', 'med', 'high', 'ultra'].includes(t));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const t = performance.now(); while (!fn()) { if (performance.now() - t > ms) return false; await sleep(100); } return true; };
const $ = (s) => document.querySelector(s);
const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const read = (k, store) => { try { return JSON.parse(store.getItem(k)); } catch { return null; } };

const EYE = 1.6, yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const VIEWS = { // [x, y, z, yaw, pitch]
  spawn: [-6, EYE, -56, Math.PI, -0.05],          // seeker start, looking south over the estate
  grassEdge: [-52, EYE, 9, Math.PI / 2, -0.12],   // 3 m east of GRASS_25, looking into it
  grassIn: [-57, 0.9, 9, -Math.PI / 2, 0],        // crouched inside GRASS_25, looking east through the blades
  vista: [-62, EYE, -62, yawTo(1, 1), -0.03],     // NW corner looking SE: the broadest view
  barn: [0, EYE, 6, 0, 0],                        // inside the long barn, looking north
};
const TOUR = [[-6, -56], [0, -43], [40, -37], [43, 4], [40, 40], [-4, 43], [-42, 8], [-40, -39], [0, 0]];

// ---- camera override (after the game camera at 50, before the 10 Hz culling pass at 55, so culling sees the bench pose) + recorder
let pose = null, rec = null, lastT = 0;
addSystem({ name: 'bench-cam', order: 54, update(dt) {
  const p = typeof pose === 'function' ? pose(dt) : pose; if (!p) return;
  camera.position.set(p[0], p[1], p[2]); camera.rotation.set(p[4], p[3], 0, 'YXZ'); camera.updateMatrixWorld();
} });
addSystem({ name: 'bench-rec', order: 102, update() {
  const t = performance.now(), st = window.__perf?.st;
  if (rec && lastT && st) {
    const ms = t - lastT; rec.ms.push(ms); rec.cpu.push(st.cpu); if (st.gpuMs) rec.gpu.push(st.gpuMs);
    rec.calls = Math.max(rec.calls, st.calls); rec.tris = Math.max(rec.tris, st.tris); rec.scales.add(st.scale); rec.tiers.add(st.tier);
    if (G.phase !== 'play') rec.offPhase++;
    if (ms > 50) rec.worst.push({ ms: Math.round(ms), x: Math.round(camera.position.x), z: Math.round(camera.position.z) });
  }
  lastT = t;
} });
const startRec = () => { rec = { ms: [], cpu: [], gpu: [], calls: 0, tris: 0, scales: new Set(), tiers: new Set(), worst: [], offPhase: 0, heap0: performance.memory?.usedJSHeapSize }; };
function stopRec() {
  const r = rec; rec = null;
  const cpu = summarize(r.cpu), heap = performance.memory ? performance.memory.usedJSHeapSize - r.heap0 : null;
  return { ...summarize(r.ms), cpuP95: cpu.p95, gpuMean: r.gpu.length ? summarize(r.gpu).mean : null, calls: r.calls, tris: r.tris,
    scale: [...r.scales].join('/'), tier: [...r.tiers].join('/'), offPhase: r.offPhase || undefined, heapMB: heap == null ? null : Math.round(heap / 1e5) / 10,
    worst: r.worst.sort((a, b) => b.ms - a.ms).slice(0, 6) };
}
// a hidden tab (minimised window) gets no frames: wait until visible, and redo a sample the tab was hidden during
let hidden = 0; document.addEventListener('visibilitychange', () => { if (document.hidden) hidden++; });
async function sample(p, secs = SECS) {
  for (let i = 0; ; i++) {
    await until(() => !document.hidden, 3600000);
    pose = p; await sleep(1500); const h = hidden; startRec(); await sleep(secs * 1000); const r = stopRec();
    if (h === hidden || i >= 3) return r;
  }
}
function tourPose(speed = 15) { // pose fn along TOUR; sets .done at the end
  let d = 0; const segs = TOUR.slice(1).map((b, i) => { const a = TOUR[i]; return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) }; });
  const fn = (dt) => {
    d += speed * dt; let s = d;
    for (const g of segs) { if (s <= g.len) { const k = s / g.len; return [g.a[0] + (g.b[0] - g.a[0]) * k, EYE, g.a[1] + (g.b[1] - g.a[1]) * k, yawTo(g.b[0] - g.a[0], g.b[1] - g.a[1]), -0.04]; } s -= g.len; }
    fn.done = true; const g = segs[segs.length - 1]; return [g.b[0], EYE, g.b[1], 0, 0];
  };
  return fn;
}
async function tour() { const fn = tourPose(); pose = fn; lastT = 0; startRec(); await until(() => fn.done, 120000); return stopRec(); }
function chasePose() { // follow the fastest-moving remote avatar (a bot), 4.5 m behind it along its motion
  const last = new WeakMap(); let target = null, hx = 0, hz = 1, t = 0;
  return (dt) => {
    t += dt;
    const list = [...(window.__remotes?.values?.() ?? [])].map((a) => a.root).filter((o) => o?.visible && o.parent);
    if (!target || !target.parent || (t > 1 && !list.includes(target))) {
      let best = -1;
      for (const o of list) { const p = last.get(o), v = p ? Math.hypot(o.position.x - p[0], o.position.z - p[1]) : 0; if (v > best) { best = v; target = o; } }
    }
    for (const o of list) { const p = last.get(o); if (o === target && p) { const dx = o.position.x - p[0], dz = o.position.z - p[1], l = Math.hypot(dx, dz); if (l > 0.01) { hx += (dx / l - hx) * 0.1; hz += (dz / l - hz) * 0.1; } } last.set(o, [o.position.x, o.position.z]); }
    if (!target) return null;
    const l = Math.hypot(hx, hz) || 1, x = target.position.x - (hx / l) * 4.5, z = target.position.z - (hz / l) * 4.5;
    return [x, 2.2, z, yawTo(target.position.x - x, target.position.z - z), -0.12];
  };
}

// ---- entering a round: host an online TRIAL room with bots through the real lobby UI
async function enterTrial() {
  if (!(await until(() => $('#btnOnline') && $('#loading')?.classList.contains('hidden'), 60000))) return false;
  $('#btnOnline').click(); $('#olName').value = 'Bench'; $('#olCreate').click();
  if (!(await until(() => $('#olLobby') && !$('#olLobby').classList.contains('hidden') && $('#lobFill'), 15000))) return false;
  const chip = () => [...document.querySelectorAll('#lobMode button')].find((b) => /trial/i.test(b.textContent));
  if (!chip()) return false;
  chip().click(); await until(() => chip()?.classList.contains('on'), 5000);
  if (!/on$/.test($('#lobFill').textContent)) { $('#lobFill').click(); await until(() => /on$/.test($('#lobFill').textContent), 5000); }
  await until(() => !$('#lobStart').disabled, 5000); $('#lobStart').click();
  return until(() => window.__trial?.on && G.phase === 'play', 30000);
}
const quiet = () => { for (const id of ['blackout', 'intro', 'onboard']) $('#' + id)?.style.setProperty('display', 'none', 'important'); };

async function runOne(run) {
  ui(`bench ${run}: entering a trial round with bots`);
  const online = await enterTrial();
  if (!online) { setWorld('coldwood'); G.paused = true; G.phase = 'play'; for (const e of document.querySelectorAll('.panelwrap,[data-screen]')) e.style.display = 'none'; } // no server: bare map, game frozen
  await until(() => window.__glb?.loaded, 90000);
  quiet();
  const P = window.__perf;
  if (run !== 'auto') { P.gov.enabled = false; P.gov.setScale(SCALE || P.perf.budget[P.st.tier].scale); }
  if (UNCAP) settings.fpsCap = 1000; // (the loop reads it every frame; not persisted)
  ui(`bench ${run}: first-entry tour`);
  const out = { run, online, tour: await tour(), views: {} };
  if (run === 'auto') { ui('bench auto: governor settling on the vista (20 s)'); pose = VIEWS.vista; await sleep(20000); }
  for (const [k, v] of Object.entries(VIEWS)) { ui(`bench ${run}: ${k}`); out.views[k] = await sample(v); }
  if (online) { ui(`bench ${run}: chase`); out.views.chase = await sample(chasePose()); }
  ui(`bench ${run}: warm tour`); out.tourWarm = await tour();
  pose = null;
  Object.assign(out, { tier: P.st.tier, scale: P.st.scale, canvas: [renderer.domElement.width, renderer.domElement.height], gpuTimer: out.views.vista.gpuMean != null });
  return out;
}

// ---- plan: one fresh boot per run
function want(run) { const o = read(OPTS, localStorage) || {}; return run === 'auto' ? { ...o, autoQuality: true } : { ...o, quality: run, autoQuality: false }; }
const booted = (run) => (run === 'auto' ? settings.autoQuality : !settings.autoQuality && settings.quality === run);
async function main() {
  let s = read(KEY, sessionStorage);
  if (!s || s.href !== location.href) s = { href: location.href, runs: RUNS, i: 0, results: [], opts0: localStorage.getItem(OPTS) };
  if (s.i < s.runs.length) {
    const run = s.runs[s.i];
    if (!booted(run) || s.bootedFor !== s.i) { s.bootedFor = s.i; sessionStorage.setItem(KEY, JSON.stringify(s)); localStorage.setItem(OPTS, JSON.stringify(want(run))); location.replace(s.href); return; }
    let r;
    try { r = await runOne(run); } catch (e) { r = { run, error: String(e?.stack || e) }; }
    s.results.push(r); s.i++; sessionStorage.setItem(KEY, JSON.stringify(s));
    if (G.mode === 'online') { hooks.leave?.(); await sleep(500); } // the server keeps at most 3 rooms per address: free this one before the next boot
    if (s.i < s.runs.length) { localStorage.setItem(OPTS, JSON.stringify(want(s.runs[s.i]))); s.bootedFor = s.i; sessionStorage.setItem(KEY, JSON.stringify(s)); location.replace(s.href); return; }
  }
  if (s.opts0 == null) localStorage.removeItem(OPTS); else localStorage.setItem(OPTS, s.opts0);
  sessionStorage.removeItem(KEY);
  const P = window.__perf, d = renderer.getContext(), result = {
    env: { ua: navigator.userAgent, gpu: P.perf.rendererName, detected: P.perf.detected, dpr: devicePixelRatio, screen: [screen.width, screen.height], viewport: [innerWidth, innerHeight], uncap: UNCAP, secs: SECS, maxTex: d.getParameter(d.MAX_TEXTURE_SIZE) },
    runs: s.results,
  };
  console.log('[bench] ' + JSON.stringify(result));
  window.__bench = { done: true, result };
  ui(table(result), true);
}

// ---- overlay
let box = null;
function ui(html, final = false) {
  if (!box) { box = document.createElement('div'); box.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;background:rgba(0,0,0,.82);color:#e8e8e8;font:12px/1.35 ui-monospace,monospace;padding:8px 10px;border-radius:6px;max-height:96vh;overflow:auto;pointer-events:auto'; document.body.appendChild(box); }
  box.innerHTML = html;
  if (final) {
    const b = document.createElement('button'); b.textContent = 'Copy results (JSON)'; b.style.cssText = 'margin-top:6px;font:inherit';
    b.onclick = () => navigator.clipboard?.writeText(JSON.stringify(window.__bench.result, null, 1)).then(() => { b.textContent = 'Copied'; });
    box.appendChild(b);
  }
}
function table(res) {
  const row = (n, s) => (s?.n ? `<tr><td>${n}</td><td>${s.fps}</td><td>${s.mean}</td><td>${s.p95}</td><td>${s.p99}</td><td>${s.max}</td><td>${s.over33}</td><td>${s.calls}</td><td>${(s.tris / 1e6).toFixed(2)}M</td><td>${s.cpuP95}</td><td>${s.gpuMean ?? '-'}</td><td>${s.scale}</td></tr>` : '');
  let h = `<b>Coldwood GPU bench</b> ${esc(res.env.gpu)}<br>${res.env.viewport.join('x')} css @ dpr ${res.env.dpr}${res.env.uncap ? ', uncapped' : ''}<table style="border-collapse:collapse" cellpadding="2"><tr><th>view</th><th>fps</th><th>mean</th><th>p95</th><th>p99</th><th>max</th><th>&gt;33ms</th><th>calls</th><th>tris</th><th>cpu95</th><th>gpu</th><th>scale</th></tr>`;
  for (const r of res.runs) {
    h += `<tr><th colspan="12" style="text-align:left;padding-top:6px">${r.run}${r.tier && r.run === 'auto' ? ` (ended on ${r.tier} @ ${r.scale})` : ''}${r.canvas ? ` canvas ${r.canvas.join('x')}` : ''}${r.online === false ? ' offline' : ''}${r.error ? ' ERROR ' + esc(r.error.split('\n')[0]) : ''}</th></tr>`;
    if (r.tour) h += row('tour (first)', r.tour) + Object.entries(r.views).map(([k, v]) => row(k, v)).join('') + row('tour (warm)', r.tourWarm);
  }
  return h + '</table>';
}

main().catch((e) => { console.error('[bench] failed', e); ui('bench failed: ' + esc(e)); });
