// Trial mode sound, fully synthesised (WebAudio on the shared engine buses). Positional where x,z are given (HRTF panner, same falloff
// constants as engine.playSample). Every export is safe before the audio context exists (it just does nothing) and never throws.
import { eng, voice } from './engine.js';
import { P } from '../core/state.js';
import { cueAt } from '../ui/hud.js';
import { CULL } from './kinds.js';
import { guarded } from '../shared/trial.js';

const guard = guarded('trial audio');
const ready = () => eng.ctx && eng.ctx.state === 'running' && eng.buses.sfx;
const rnd = (a, b) => a + Math.random() * (b - a);

// Output node for one sound. pos -> panner (+ distance cull); returns {in, end} or null when inaudible / no voice.
function out(pos, vol, prio = 2, bus = 'sfx') {
  if (!ready()) return null;
  const ctx = eng.ctx, g = ctx.createGain(); let panner = null;
  if (pos && Number.isFinite(pos.x)) {
    const d = Math.hypot(pos.x - P.x, pos.z - P.z);
    if (vol / (1 + d * 0.2) < CULL) return null;
    panner = ctx.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = 2; panner.rolloffFactor = 0.5; panner.maxDistance = 200;
    panner.positionX.value = pos.x; panner.positionY.value = pos.y ?? 1.4; panner.positionZ.value = pos.z;
    g.connect(panner); panner.connect(eng.buses[bus]);
  } else g.connect(eng.buses[bus]);
  g.gain.value = vol;
  const stops = [], release = voice(prio, () => stops.forEach((s) => { try { s.stop(); } catch { /* ended */ } }));
  if (!release) { g.disconnect(); panner?.disconnect(); return null; }
  return { in: g, add: (s) => stops.push(s), end: (secs) => setTimeout(() => { release(); g.disconnect(); panner?.disconnect(); }, secs * 1000 + 100) };
}
// oscillator with a frequency sweep + amp envelope into o.in
function osc(o, { f, to, type = 'sine', t = 0, dur = 0.3, vol = 0.3, att = 0.005, vib = 0, vibHz = 7, filt }) {
  const ctx = eng.ctx, s = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + t;
  s.type = type; s.frequency.setValueAtTime(f, t0); if (to) s.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  if (vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibHz; lg.gain.value = vib; l.connect(lg); lg.connect(s.frequency); l.start(t0); l.stop(t0 + dur + 0.1); o.add(l); }
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + att); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let n = s; if (filt) { const b = ctx.createBiquadFilter(); b.type = filt[0]; b.frequency.value = filt[1]; b.Q.value = filt[2] ?? 1; s.connect(b); n = b; }
  n.connect(g); g.connect(o.in); s.start(t0); s.stop(t0 + dur + 0.05); o.add(s);
}
function noise(o, { freq = 1000, q = 1, type = 'bandpass', t = 0, dur = 0.2, vol = 0.3, to }) {
  const ctx = eng.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), t0 = ctx.currentTime + t;
  s.buffer = eng.noise; s.loop = true; f.type = type; f.frequency.setValueAtTime(freq, t0); if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur); f.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f); f.connect(g); g.connect(o.in); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05); o.add(s);
}
const pos = (x, z) => (Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null);

// ----- one-shots
const SND = {
  bell: (o) => { for (const [f, v, d] of [[880, 0.3, 1.4], [1320, 0.16, 1.1], [2217, 0.08, 0.7]]) osc(o, { f, dur: d, vol: v }); osc(o, { f: 1760, t: 0.18, dur: 1.2, vol: 0.14 }); },
  scream: (o, long) => { const d = long ? 1.1 : 0.7; osc(o, { f: 620, to: 1500, type: 'sawtooth', dur: d, vol: 0.28, vib: 60, vibHz: 11, filt: ['bandpass', 1700, 1.4], att: 0.04 }); osc(o, { f: 930, to: 2250, type: 'square', dur: d, vol: 0.1, vib: 90, vibHz: 13, filt: ['bandpass', 2600, 2], att: 0.05 }); noise(o, { freq: 3200, q: 0.8, dur: d, vol: 0.12 }); },
  siren: (o) => { for (let i = 0; i < 4; i++) osc(o, { f: i % 2 ? 330 : 520, to: i % 2 ? 520 : 330, type: 'sawtooth', t: i * 0.4, dur: 0.4, vol: 0.2, filt: ['lowpass', 1400], att: 0.05 }); },
  clank: (o) => { for (const [f, v] of [[1180, 0.22], [1870, 0.16], [2650, 0.1], [420, 0.2]]) osc(o, { f, to: f * 0.96, type: 'square', dur: 0.35, vol: v * 0.6, filt: ['bandpass', f, 6] }); noise(o, { freq: 3000, q: 2, dur: 0.1, vol: 0.3 }); },
  toll: (o) => { osc(o, { f: 196, dur: 2, vol: 0.4 }); osc(o, { f: 392, dur: 1.6, vol: 0.2 }); osc(o, { f: 590, dur: 1.2, vol: 0.1 }); },
  thud: (o) => { osc(o, { f: 140, to: 50, dur: 0.3, vol: 0.55 }); noise(o, { freq: 500, type: 'lowpass', dur: 0.18, vol: 0.4 }); },
  swing: (o) => { noise(o, { freq: 500, to: 2600, q: 1.1, dur: 0.28, vol: 0.4 }); },
  snap: (o) => { noise(o, { freq: 2400, q: 1.5, dur: 0.07, vol: 0.5 }); osc(o, { f: 1500, to: 400, type: 'square', dur: 0.12, vol: 0.25, filt: ['bandpass', 1500, 4] }); SND.clank(o); },
  stinger: (o) => { osc(o, { f: 110, to: 55, type: 'sawtooth', dur: 0.9, vol: 0.4, filt: ['lowpass', 500], att: 0.02 }); osc(o, { f: 233, to: 220, type: 'square', dur: 0.7, vol: 0.12, filt: ['lowpass', 900] }); noise(o, { freq: 300, type: 'lowpass', dur: 0.3, vol: 0.25 }); },
  creak: (o) => { osc(o, { f: rnd(90, 140), to: rnd(180, 260), type: 'sawtooth', dur: rnd(0.8, 1.4), vol: 0.5, vib: 12, vibHz: 17, filt: ['bandpass', 380, 5], att: 0.2 }); },
  gate: (o) => { osc(o, { f: 60, to: 45, type: 'sawtooth', dur: 2.2, vol: 0.4, filt: ['lowpass', 220], att: 0.3 }); noise(o, { freq: 400, q: 2, dur: 2, vol: 0.2, to: 1100 }); for (let i = 0; i < 6; i++) osc(o, { f: 900 + i * 40, to: 700, type: 'square', t: 0.2 + i * 0.3, dur: 0.1, vol: 0.14, filt: ['bandpass', 900, 5] }); },
};
function shot(name, p, vol, secs, prio = 2, bus = 'sfx', arg) {
  const o = out(p, vol, prio, bus); if (!o) return;
  SND[name](o, arg); o.end(secs);
}
const CUEK = { relic: 'fuse', scream: 'scream', gate: 'gatecue', trap: 'scrape', cage: 'cagecue', hit: 'hitcue' };

export const alertSound = guard((kind, x, z) => {
  const p = pos(x, z);
  if (p) cueAt(CUEK[kind] || 'scream', p, 0.4);
  if (kind === 'relic') { shot('bell', p, 0.5, 1.6, 3, 'ui'); shot('stinger', null, 0.55, 1.2, 3, 'ui'); } // spatial bell at the fuse + a non-positional sting so it is heard from anywhere
  else if (kind === 'scream') shot('scream', p, 0.6, 1.2, 3, 'ui', false);
  else if (kind === 'gate') shot('siren', p, 0.45, 1.7, 3, 'ui');
  else if (kind === 'trap') shot('clank', p, 0.7, 0.5, 3, 'ui');
  else if (kind === 'cage') shot('toll', p, 0.5, 2.1, 3, 'ui');
  else shot('thud', p, 0.5, 0.4, 3, 'ui');
});
export const scream = guard((x, z) => { const p = pos(x, z); if (p) cueAt('scream', p, 0.6); shot('scream', p, 0.8, 1.3, 3, 'sfx', true); });
export const swingSound = guard(() => shot('swing', null, 0.5, 0.4));
export const hitSound = guard((x, z) => shot('thud', pos(x, z), 0.8, 0.4, 3));
export const trapSound = guard((x, z) => { const p = pos(x, z); if (p) cueAt('scrape', p, 0.5); shot('snap', p, 0.9, 0.7, 3); });
export const gateSound = guard((x, z) => shot('gate', pos(x, z), 0.8, 2.6, 3));

// ----- heartbeat: lub-dub, rate and level follow k (0 stops)
let hbK = 0, hbT = 0;
function beat() {
  hbT = 0; if (hbK <= 0) return;
  if (ready()) {
    const o = out(null, 0.25 + 0.5 * hbK, 3);
    if (o) { osc(o, { f: 62, to: 40, dur: 0.16, vol: 0.6 }); osc(o, { f: 58, to: 38, t: 0.17 + 0.05 * (1 - hbK), dur: 0.15, vol: 0.42 }); noise(o, { freq: 140, type: 'lowpass', dur: 0.1, vol: 0.2 }); o.end(0.5); }
  }
  hbT = setTimeout(beat, (1.15 - 0.62 * hbK) * 1000);
}
export const heartbeat = guard((k) => {
  k = Math.min(1, Math.max(0, +k || 0)); hbK = k;
  if (k > 0 && !hbT) beat(); else if (k <= 0) { clearTimeout(hbT); hbT = 0; }
});

// ----- channel hum: sawtooth drone with a 9 Hz tremolo, faded in/out
let chan = null;
export const chanLoop = guard((on) => {
  if (!on) { if (chan) { const c = chan; chan = null; c.g.gain.setTargetAtTime(0, eng.ctx.currentTime, 0.08); setTimeout(() => { c.nodes.forEach((n) => { try { n.stop(); } catch { /* ended */ } }); c.g.disconnect(); }, 500); } return; }
  if (chan || !ready()) return;
  const ctx = eng.ctx, g = ctx.createGain(), f = ctx.createBiquadFilter(), a = ctx.createOscillator(), b = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), tr = ctx.createGain();
  a.type = 'sawtooth'; a.frequency.value = 58; b.type = 'square'; b.frequency.value = 87.3; f.type = 'lowpass'; f.frequency.value = 260;
  tr.gain.value = 0.6; l.frequency.value = 9; lg.gain.value = 0.4; l.connect(lg); lg.connect(tr.gain);
  g.gain.value = 0; g.gain.setTargetAtTime(0.11, ctx.currentTime, 0.1);
  a.connect(f); b.connect(f); f.connect(tr); tr.connect(g); g.connect(eng.buses.sfx);
  for (const n of [a, b, l]) n.start();
  chan = { g, nodes: [a, b, l] };
});

// ----- ambient bed: wind, low drone, now and then a crow or a cricket burst
let amb = null, ambTries = 0;
let ambWant = false;
export const startAmbient = guard(() => { ambWant = true; ambStart(); });
function ambStart() {
  if (amb || !ambWant) return;
  if (!eng.ctx) { if (ambTries++ < 30) setTimeout(ambStart, 1000); return; }
  ambTries = 0;
  const ctx = eng.ctx, master = ctx.createGain(), nodes = []; master.gain.value = 0; master.gain.setTargetAtTime(1, ctx.currentTime, 1.5); master.connect(eng.buses.sfx);
  const w = ctx.createBufferSource(), wf = ctx.createBiquadFilter(), wg = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(), l2 = ctx.createOscillator(), lg2 = ctx.createGain();
  w.buffer = eng.noise; w.loop = true; wf.type = 'bandpass'; wf.frequency.value = 420; wf.Q.value = 0.7; wg.gain.value = 0.05;
  l.frequency.value = 0.09; lg.gain.value = 0.035; l.connect(lg); lg.connect(wg.gain); l2.frequency.value = 0.07; lg2.gain.value = 180; l2.connect(lg2); lg2.connect(wf.frequency);
  w.connect(wf); wf.connect(wg); wg.connect(master); nodes.push(w, l, l2);
  const dg = ctx.createGain(), dl = ctx.createOscillator(), dlg = ctx.createGain(); dg.gain.value = 0.05; dl.frequency.value = 0.05; dlg.gain.value = 0.03; dl.connect(dlg); dlg.connect(dg.gain); nodes.push(dl);
  for (const f of [55, 55.7, 82.4, 98.2]) { const s = ctx.createOscillator(), sg = ctx.createGain(); s.type = 'sine'; s.frequency.value = f; sg.gain.value = f > 80 ? 0.35 : 1; s.connect(sg); sg.connect(dg); nodes.push(s); }
  dg.connect(master); for (const n of nodes) n.start();
  const timer = setInterval(() => {
    if (!ready()) return;
    const ang = Math.random() * 6.28, p = { x: P.x + Math.cos(ang) * 30, z: P.z + Math.sin(ang) * 30, y: 9 };
    if (Math.random() < 0.16) { const o = out(p, 0.35, 0, 'sfx'); if (o) { const n = 2 + ((Math.random() * 3) | 0); for (let i = 0; i < n; i++) osc(o, { f: rnd(520, 640), to: rnd(330, 400), type: 'sawtooth', t: i * 0.34, dur: 0.26, vol: 0.5, vib: 40, vibHz: 24, filt: ['bandpass', 900, 1.5], att: 0.03 }); o.end(n * 0.34 + 0.4); } }
    else if (Math.random() < 0.3) { const o = out({ ...p, y: 2 }, 0.3, 0, 'sfx'); if (o) { SND.creak(o); o.end(1.6); } } // distant creak
    else if (Math.random() < 0.6) { const o = out({ ...p, y: 0.5 }, 0.12, 0, 'sfx'); if (o) { for (let i = 0; i < 6; i++) osc(o, { f: 4300 + rnd(-80, 80), type: 'sine', t: i * 0.07, dur: 0.04, vol: 0.5 }); o.end(0.6); } }
  }, 3500);
  amb = { master, nodes, timer };
}
export const stopAmbient = guard(() => {
  ambWant = false; ambTries = 0; if (!amb) return;
  const a = amb; amb = null; clearInterval(a.timer); a.master.gain.setTargetAtTime(0, eng.ctx.currentTime, 0.4);
  setTimeout(() => { a.nodes.forEach((n) => { try { n.stop(); } catch { /* ended */ } }); a.master.disconnect(); }, 2000);
});
export const stopAllTrialSound = () => { heartbeat(0); chanLoop(false); stopAmbient(); };
