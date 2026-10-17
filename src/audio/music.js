// Procedural music (original, no samples): a calm pad bed that loops forever because every bar is scheduled on the audio clock,
// plus a tension layer (low pulse + dissonant drone) whose level follows setTension(0..1), and synthesised stingers.
import { eng } from './engine.js';
import { settings } from '../core/settings.js';

const BAR = 4, BEAT = 0.5;
const CHORDS = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]]; // Am F C G
let on = false, nextBar = 0, nextBeat = 0, bar = 0, timer = 0, tens = null, bed = null, target = 0, level = 0;

function note(f, t, dur, { type = 'triangle', vol = 0.1, atk = 0.02, lp = 2400, dest = bed } = {}) {
  const ctx = eng.ctx, o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter();
  o.type = type; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = lp;
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + atk); g.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.2);
  o.connect(fl); fl.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.2);
}
function schedule() {
  const ctx = eng.ctx, ahead = ctx.currentTime + 1.5, voices = settings.quality === 'low' || settings.quality === 'potato' ? 2 : 3;
  while (nextBar < ahead) { // pad chord + soft bass
    const ch = CHORDS[bar % 4];
    for (const f of ch.slice(0, voices)) note(f, nextBar, BAR + 1.5, { vol: 0.05, atk: 1.2, lp: 900 });
    note(ch[0] / 2, nextBar, BAR + 1, { type: 'sine', vol: 0.09, atk: 0.6, lp: 400 });
    bar++; nextBar += BAR;
  }
  while (nextBeat < ahead) { // tension pulse: a low thump every beat, audible only as the tension layer opens
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(90, nextBeat); o.frequency.exponentialRampToValueAtTime(42, nextBeat + 0.18);
    g.gain.setValueAtTime(0.5, nextBeat); g.gain.exponentialRampToValueAtTime(0.001, nextBeat + 0.22); o.connect(g); g.connect(tens); o.start(nextBeat); o.stop(nextBeat + 0.3);
    nextBeat += BEAT;
  }
}
export const music = {
  start() {
    if (on || !eng.ctx) return; on = true;
    const ctx = eng.ctx; bed = ctx.createGain(); bed.gain.value = 0; bed.connect(eng.buses.music);
    tens = ctx.createGain(); tens.gain.value = 0; tens.connect(eng.buses.music);
    for (const f of [110, 116.5]) { const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = f; fl.type = 'lowpass'; fl.frequency.value = 420; g.gain.value = 0.07; o.connect(fl); fl.connect(g); g.connect(tens); o.start(); }
    nextBar = nextBeat = ctx.currentTime + 0.1; schedule(); timer = setInterval(schedule, 400);
  },
  // tension 0..1, calm 0..1 (bed level: lower in menus)
  update(tension, calm = 1) {
    if (!on) return; target = tension;
    const t = eng.ctx.currentTime; level = calm;
    tens.gain.setTargetAtTime(target * 0.9, t, 0.5); bed.gain.setTargetAtTime(level * (1 - target * 0.4), t, 0.8);
  },
  stinger(kind) { // short synthesised phrases on the music bus
    if (!on) return;
    const t = eng.ctx.currentTime + 0.02, d = eng.buses.music;
    const seq = { spotted: [[466, 0], [659, 0.04]], tag: [[523, 0], [784, 0.12]], win: [[523, 0], [659, 0.14], [784, 0.28], [1046, 0.42]], lose: [[392, 0], [311, 0.2], [233, 0.4]] }[kind];
    if (!seq) return;
    const mean = kind === 'spotted';
    for (const [f, dt] of seq) note(f, t + dt, mean ? 0.7 : 1.2, { type: mean ? 'sawtooth' : 'triangle', vol: mean ? 0.16 : 0.18, lp: mean ? 1800 : 3000, dest: d });
  },
  stop() { clearInterval(timer); on = false; },
};
