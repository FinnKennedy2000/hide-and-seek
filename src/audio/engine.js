// Web Audio graph. THREE.AudioListener on the camera keeps ctx.listener in sync with the view; sounds are PannerNodes (HRTF).
//   voice: source -> [lowpass if occluded] -> gain -> panner -> bus.sfx|ui  (+ send -> reverb -> bus.sfx)
//   buses: sfx, music, ui -> master -> destination.   master = settings.volume, buses = settings.sfx / music / ui
import * as THREE from 'three';
import { camera } from '../render/renderer.js';
import { P } from '../core/state.js';
import { settings } from '../core/settings.js';
import { bus, EV } from '../core/bus.js';
import { loadGroup } from '../core/assets.js';
import { losClear } from '../ai/nav.js';
import { zoneAt } from './zones.js';
import { setFiles, CULL } from './kinds.js';

export const eng = { ctx: null, master: null, buses: {}, noise: null, muted: false, target: {} }; // target = the volumes last asked for (the nodes ramp towards them)
const buffers = new Map(), loading = new Set();
const lowQ = () => settings.quality === 'low' || settings.quality === 'potato';
export const voiceCap = () => (lowQ() ? 16 : 32);
const live = new Set(); // voices in flight: {prio, stop}
let send, wetOut, conv, delayNodes, irs, zoneName = null;

export function applyVolumes() {
  if (!eng.ctx) return;
  const t = eng.ctx.currentTime, want = { master: eng.muted ? 0 : settings.volume, music: settings.music, sfx: settings.sfx, ui: settings.ui };
  Object.assign(eng.target, want);
  eng.master.gain.setTargetAtTime(want.master, t, 0.02);
  for (const k of ['music', 'sfx', 'ui']) eng.buses[k].gain.setTargetAtTime(want[k], t, 0.02);
}
// boss key: everything (music and ambience included) goes silent and comes back on exit
export function setMuted(on) { eng.muted = on; applyVolumes(); if (!on) resume(); }
export function resume() { if (eng.ctx && eng.ctx.state !== 'running') eng.ctx.resume().catch(() => {}); }

// Voice budget shared by samples and the synth fallback. Returns a release fn, or null when the voice must not start:
// context not running (never queue sources on a suspended context, they would all burst on resume) or cap reached with nothing cheaper to evict.
export function voice(prio, stop) {
  if (!eng.ctx || eng.ctx.state !== 'running') return null;
  if (live.size >= voiceCap()) {
    let low = null; for (const v of live) if (!low || v.prio < low.prio) low = v;
    if (low.prio >= prio) return null;
    live.delete(low); try { low.stop(); } catch { /* already stopped */ }
  }
  const v = { prio, stop }; live.add(v);
  return () => live.delete(v);
}

// ----- synthesised impulse responses: decaying noise, darker as it decays
function makeIR(ctx, secs, decay, dark) {
  const n = Math.floor(ctx.sampleRate * secs), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < n; i++) { const t = i / n; lp += (Math.random() * 2 - 1 - lp) * (1 - dark * t); d[i] = lp * Math.exp(-t * decay) * (1 - Math.exp(-i / 64)); }
  }
  return buf;
}
const WET = { room: 0.25, hall: 0.4, outdoor: 0.07 };
function buildReverb() { // convolution reverb, or on low/potato a cheap feedback delay
  const ctx = eng.ctx;
  for (const n of [send, conv, ...(delayNodes || [])]) n?.disconnect();
  send = ctx.createGain(); send.gain.value = 0; conv = null; delayNodes = null;
  if (lowQ()) {
    const d = ctx.createDelay(0.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    d.delayTime.value = 0.085; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 2200;
    send.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wetOut); delayNodes = [d, fb, lp];
  } else {
    irs ||= { room: makeIR(ctx, 0.5, 6, 0.6), hall: makeIR(ctx, 2.0, 3.2, 0.8), outdoor: makeIR(ctx, 0.35, 8, 0.9) };
    conv = ctx.createConvolver(); send.connect(conv); conv.connect(wetOut);
  }
  zoneName = null;
}
function setZone(name) {
  if (name === zoneName) return;
  zoneName = name; const t = eng.ctx.currentTime;
  send.gain.setTargetAtTime(0, t, 0.03);
  setTimeout(() => { if (zoneName !== name) return; if (conv) conv.buffer = irs[name]; send.gain.setTargetAtTime(WET[name] ?? 0.1, eng.ctx.currentTime, 0.12); }, 90);
}
export function updateZone() { if (eng.ctx) setZone(zoneAt(P.x, P.z).reverb); }

export function initEngine() {
  if (eng.ctx) { resume(); return true; }
  try {
    const listener = new THREE.AudioListener(); camera.add(listener);
    const ctx = listener.context;
    eng.ctx = ctx; eng.master = ctx.createGain(); eng.master.connect(ctx.destination);
    for (const k of ['sfx', 'music', 'ui']) { eng.buses[k] = ctx.createGain(); eng.buses[k].connect(eng.master); }
    wetOut = ctx.createGain(); wetOut.connect(eng.buses.sfx);
    eng.noise = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = eng.noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    buildReverb(); applyVolumes(); eng.master.gain.value = eng.target.master; for (const k of ['music', 'sfx', 'ui']) eng.buses[k].gain.value = eng.target[k]; resume();
    ctx.onstatechange = () => { if (ctx.state !== 'running') live.clear(); }; // recount: stuck voices must not hold the cap
    bus.on(EV.SETTINGS, ({ key }) => { if (key === 'quality') buildReverb(); applyVolumes(); });
    return true;
  } catch (e) { console.warn('audio unavailable', e); eng.ctx = null; return false; }
}

// ----- lazy sample sets (never rejects; a failed file just stays missing and the synth fallback plays)
export async function loadSet(name) {
  if (loading.has(name) || !eng.ctx) return;
  loading.add(name);
  for (const [k, buf] of await loadGroup(name, setFiles(name))) if (buf) buffers.set(k, buf);
}

// ----- one-shot voice. Returns false when no sample is ready (caller plays the synth), true when handled (even if culled).
export function playSample(def, prefix, pos, vol, rate = 1) { // false = no sample yet (play the synth); true = handled
  const ctx = eng.ctx; if (!ctx) return false;
  const i = Math.floor(Math.random() * def.n), buf = buffers.get(`${prefix}_${i}`) || buffers.get(`${prefix}_0`);
  if (!buf) { loadSet(prefix.startsWith('step_') ? prefix : 'common'); return false; }
  if (eng.ctx.state !== 'running') return true; // dropped; the cue already fired
  let level = vol * def.g, lp = null, panner = null;
  if (pos) {
    const y = pos.y ?? 1, d = Math.hypot(pos.x - P.x, pos.z - P.z);
    if (vol / (1 + d * 0.45) < CULL) return true;
    // occlusion: the same raycast as losClear; on low/potato skip it beyond 25 m
    if (d < (lowQ() ? 25 : 60) && !losClear(P.x, 1.6, P.z, pos.x, y, pos.z)) { lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 550; level *= 0.6; }
    panner = ctx.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 1; panner.rolloffFactor = 0.45; panner.maxDistance = 200;
    panner.positionX.value = pos.x; panner.positionY.value = y; panner.positionZ.value = pos.z;
  }
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf; src.playbackRate.value = rate * (0.94 + Math.random() * 0.12); g.gain.value = level;
  src.connect(lp || g); lp?.connect(g);
  const out = eng.buses[def.bus] || eng.buses.sfx;
  if (panner) { g.connect(panner); panner.connect(out); panner.connect(send); } else g.connect(out);
  const release = voice(def.p ?? 1, () => src.stop());
  if (!release) return true;
  src.onended = () => { release(); src.disconnect(); g.disconnect(); panner?.disconnect(); lp?.disconnect(); };
  src.start();
  return true;
}
export const _debug = { voices: () => live.size, buffers: () => buffers.size };
