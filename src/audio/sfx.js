import { rnd, clamp } from '../core/util.js';
import { P } from '../core/state.js';
import { cueAt } from '../ui/hud.js';
import { eng, initEngine, applyVolumes, setDuck, loadSet, playSample, updateZone } from './engine.js';
import { KINDS } from './kinds.js';
import { zoneAt, surfacesOf } from './zones.js';
import { music } from './music.js';

// Sound entry point. play(kind, pos?, vol?) ALWAYS fires the visual cue first (captions must work with sound off, on a failed
// context or with samples missing), then plays the sample, falling back to the synthesised version below.
// Volumes live in settings (master / music / sfx / ui buses, engine.js); ducking under the boss screen is setMuted().
export const setMuted = (m) => setDuck(m);
export const applyVol = applyVolumes;
export function loadForMap() { loadSet('common'); for (const s of surfacesOf()) loadSet(`step_${s}`); }
export function initAudio() {
  if (eng.ctx) { eng.ctx.resume(); return; }
  if (!initEngine()) return;
  const AC = eng.ctx; // quiet ambient wind + crickets
  const wind = AC.createBufferSource(); wind.buffer = eng.noise; wind.loop = true;
  const wf = AC.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 350; wf.Q.value = 0.6;
  const wg = AC.createGain(); wg.gain.value = 0.03;
  const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.02; lfo.connect(lg); lg.connect(wg.gain); lfo.start();
  wind.connect(wf); wf.connect(wg); wg.connect(eng.buses.sfx); wind.start();
  setInterval(() => { if (AC.state === 'running' && Math.random() < 0.7) for (let i = 0; i < 3; i++) tone(4300 + rnd(-80, 80), 0.04, { vol: 0.012, delay: i * 0.07 }); }, 380);
  music.start(); loadForMap(); updateZone();
}

// ----- synthesised fallback voices (used when a kind has no sample or its file failed to load)
function spat(pos) {
  if (!pos) return { vol: 1, pan: 0 };
  const dx = pos.x - P.x, dz = pos.z - P.z, d = Math.hypot(dx, dz);
  const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  return { vol: 1 / (1 + d * 0.45), pan: clamp((dx * rx + dz * rz) / Math.max(d, 1), -1, 1) * Math.min(1, d / 2) };
}
function route(node, pan) {
  const AC = eng.ctx, out = eng.buses.sfx;
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(out); } else node.connect(out);
}
function tone(f, dur = 0.15, o = {}) {
  const AC = eng.ctx; if (!AC) return;
  const { type = 'sine', vol = 0.15, slide = 0, delay = 0, pos } = o, sp = spat(pos);
  if (sp.vol < 0.02) return;
  const t = AC.currentTime + delay, osc = AC.createOscillator(), g = AC.createGain();
  osc.type = type; osc.frequency.setValueAtTime(f, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * sp.vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); route(g, sp.pan); osc.start(t); osc.stop(t + dur + 0.05);
}
function hit(dur, o = {}) {
  const AC = eng.ctx; if (!AC) return;
  const { freq = 400, q = 1, type = 'lowpass', vol = 0.2, pos, rate = 1 } = o, sp = spat(pos);
  if (sp.vol < 0.02) return;
  const t = AC.currentTime, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = eng.noise; src.playbackRate.value = rate; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol * sp.vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); route(g, sp.pan); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
const SYN = { // kind -> (pos, vol) => sound only (the cue is fired by play)
  step: (pos, vol) => hit(0.09, { freq: 380 + rnd(-60, 60), vol, pos }),
  sprint: (pos, vol) => hit(0.09, { freq: 450 + rnd(-60, 60), vol, pos }),
  rustle: (pos) => { hit(0.35, { freq: 3200, q: 0.8, type: 'bandpass', vol: 0.18, pos }); hit(0.2, { freq: 2200, q: 1, type: 'bandpass', vol: 0.12, pos, rate: 1.3 }); },
  tick: () => tone(520, 0.12, { type: 'square', vol: 0.07 }),
  found: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.07 })),
  go: () => [440, 660, 880].forEach((f, i) => tone(f, 0.3, { type: 'sawtooth', vol: 0.1, delay: i * 0.1 })),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.2, delay: i * 0.13 })),
  lose: () => [440, 370, 311, 220].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.14, delay: i * 0.18 })),
  alert: () => tone(900, 0.25, { type: 'square', vol: 0.12, slide: 500 }),
  hb: () => { tone(60, 0.12, { vol: 0.35 }); tone(55, 0.12, { vol: 0.28, delay: 0.14 }); },
  land: (pos, vol) => hit(0.15, { freq: 200, vol: Math.max(vol ?? 0, 0.25), pos }),
  puff: (pos) => { hit(0.35, { freq: 1400, q: 0.6, type: 'bandpass', vol: 0.3, pos, rate: 0.7 }); tone(300, 0.25, { vol: 0.12, slide: 500, pos }); },
  scrape: (pos) => hit(0.22, { freq: 900, q: 1.5, type: 'bandpass', vol: 0.09, pos, rate: 0.5 }),
  taunt: (pos) => [523, 659, 523, 784].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.3, delay: i * 0.12, pos })),
  shot: (pos) => { tone(720, 0.14, { type: 'square', vol: 0.14, slide: -520, pos }); hit(0.1, { freq: 1800, vol: 0.18, pos }); },
  splat: (pos) => hit(0.14, { freq: 900, q: 0.8, type: 'bandpass', vol: 0.3, pos }),
  hit: (pos) => hit(0.12, { freq: 500, vol: 0.25, pos }),
  empty: () => tone(220, 0.05, { type: 'square', vol: 0.1 }),
  reload: () => { tone(300, 0.06, { type: 'square', vol: 0.1 }); tone(450, 0.06, { type: 'square', vol: 0.1, delay: 0.5 }); tone(700, 0.1, { type: 'square', vol: 0.12, delay: 1.1 }); },
  pickup: () => [600, 800, 1000].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.2, delay: i * 0.06 })),
  hurt: () => tone(180, 0.25, { type: 'sawtooth', vol: 0.2, slide: -80 }),
  jump: () => hit(0.08, { freq: 600, vol: 0.1 }),
};
for (const k of ['prop', 'prop_metal', 'prop_door']) SYN[k] = SYN.scrape;
SYN.ui = SYN.tick; SYN.ui_error = SYN.empty;

// ----- the one entry point
export function play(kind, pos, vol) {
  const def = KINDS[kind];
  if (!def) { console.warn(`audio.play: unknown kind '${kind}'`); return; }
  const v = vol ?? def.vol;
  if (pos) cueAt(def.cue, pos, v); // always, even if the context or the samples failed
  if (def.stinger) music.stinger(def.stinger);
  if (!eng.ctx) return;
  let prefix = def.s;
  if (prefix?.endsWith('*')) prefix = `step_${zoneAt((pos || P).x, (pos || P).z).surface}`;
  if (prefix && playSample(def, prefix, pos, v, def.rate)) return;
  SYN[kind]?.(pos, v);
}

// Legacy call surface used all over the game (positional ones take a {x,z} pos; null/undefined = your own sound).
export const sfx = {
  step: (vol = 0.25, pos, _f, kind = 'step') => play(kind, pos, vol),
  rustle: (pos) => play('rustle', pos), puff: (pos) => play('puff', pos), scrape: (pos) => play('scrape', pos), taunt: (pos) => play('taunt', pos),
  shoot: (pos) => play('shot', pos), splat: (pos) => play('splat', pos), thud: (pos) => play('land', pos),
  tick: (hi) => play('tick', null, hi ? 0.15 : 0.1), hb: () => play('hb'), jump: () => play('jump'), land: () => play('land', null),
  found: () => play('found'), go: () => play('go'), win: () => play('win'), lose: () => play('lose'), alert: () => play('alert'),
  empty: () => play('empty'), reload: () => play('reload'), pickup: () => play('pickup'), hurt: () => play('hurt'),
};
