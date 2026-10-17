import { rnd, clamp } from '../core/util.js';
import { P } from '../core/state.js';
import { settings } from '../core/settings.js';
import { cueAt } from '../ui/hud.js';

// audio (all synthesized). Volume and the cues toggle live in core/settings.js.
let AC = null, master = null, noiseBuf = null, muted = false;
export const setMuted = (m) => { muted = m; if (master) master.gain.value = m ? 0 : settings.volume; };
export const applyVol = () => { if (master && !muted) master.gain.value = settings.volume; };
export function initAudio() {
  if (AC) { AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = muted ? 0 : settings.volume; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 1.5, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // ambient wind + drone + crickets
    const wind = AC.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const wf = AC.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 350; wf.Q.value = 0.6;
    const wg = AC.createGain(); wg.gain.value = 0.05;
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(wg.gain); lfo.start();
    wind.connect(wf); wf.connect(wg); wg.connect(master); wind.start();
    for (const f of [55, 55.4, 82.5]) {
      const o = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 180; g.gain.value = 0.012;
      o.connect(lp); lp.connect(g); g.connect(master); o.start();
    }
    setInterval(() => { if (AC.state === 'running' && Math.random() < 0.7) for (let i = 0; i < 3; i++) tone(4300 + rnd(-80, 80), 0.04, { vol: 0.012, delay: i * 0.07 }); }, 380);
  } catch (e) { console.warn('audio unavailable', e); AC = null; }
}
function spat(pos) {
  if (!pos) return { vol: 1, pan: 0 };
  const dx = pos.x - P.x, dz = pos.z - P.z, d = Math.hypot(dx, dz);
  const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  return { vol: 1 / (1 + d * 0.45), pan: clamp((dx * rx + dz * rz) / Math.max(d, 1), -1, 1) * Math.min(1, d / 2) };
}
function route(node, pan) {
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(master); } else node.connect(master);
}
function tone(f, dur = 0.15, o = {}) {
  if (!AC) return;
  const { type = 'sine', vol = 0.15, slide = 0, delay = 0, pos } = o, sp = spat(pos);
  if (sp.vol < 0.02) return;
  const t = AC.currentTime + delay, osc = AC.createOscillator(), g = AC.createGain();
  osc.type = type; osc.frequency.setValueAtTime(f, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * sp.vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); route(g, sp.pan); osc.start(t); osc.stop(t + dur + 0.05);
}
function hit(dur, o = {}) {
  if (!AC) return;
  const { freq = 400, q = 1, type = 'lowpass', vol = 0.2, pos, rate = 1 } = o, sp = spat(pos);
  if (sp.vol < 0.02) return;
  const t = AC.currentTime, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = noiseBuf; src.playbackRate.value = rate; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol * sp.vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); route(g, sp.pan); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
export const sfx = {
  step: (vol = 0.25, pos, f = 380, kind = 'step') => { hit(0.09, { freq: f + rnd(-60, 60), vol, pos }); cueAt(kind, pos, vol); },
  rustle: (pos) => { hit(0.35, { freq: 3200, q: 0.8, type: 'bandpass', vol: 0.18, pos }); hit(0.2, { freq: 2200, q: 1, type: 'bandpass', vol: 0.12, pos, rate: 1.3 }); cueAt('rustle', pos, 0.18); },
  tick: (hi) => tone(hi ? 880 : 520, 0.12, { type: 'square', vol: 0.07 }),
  found: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.07 })),
  go: () => [440, 660, 880].forEach((f, i) => tone(f, 0.3, { type: 'sawtooth', vol: 0.1, delay: i * 0.1 })),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.2, delay: i * 0.13 })),
  lose: () => [440, 370, 311, 220].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.14, delay: i * 0.18 })),
  alert: () => { tone(900, 0.25, { type: 'square', vol: 0.12, slide: 500 }); },
  hb: (v) => { tone(60, 0.12, { vol: 0.35 }); tone(55, 0.12, { vol: 0.28, delay: 0.14 }); },
  land: () => hit(0.15, { freq: 200, vol: 0.35 }),
  puff: (pos) => { hit(0.35, { freq: 1400, q: 0.6, type: 'bandpass', vol: 0.3, pos, rate: 0.7 }); tone(300, 0.25, { vol: 0.12, slide: 500, pos }); cueAt('puff', pos, 0.3); },
  scrape: (pos) => { hit(0.22, { freq: 900, q: 1.5, type: 'bandpass', vol: 0.09, pos, rate: 0.5 }); cueAt('scrape', pos, 0.09); },
  taunt: (pos) => { [523, 659, 523, 784].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.3, delay: i * 0.12, pos })); cueAt('taunt', pos, 0.3); },
  shoot: (pos) => { tone(720, 0.14, { type: 'square', vol: 0.14, slide: -520, pos }); hit(0.1, { freq: 1800, vol: 0.18, pos }); cueAt('shot', pos, 0.18); },
  splat: (pos) => { hit(0.14, { freq: 900, q: 0.8, type: 'bandpass', vol: 0.3, pos }); cueAt('splat', pos, 0.3); },
  thud: (pos) => { hit(0.12, { freq: 500, vol: 0.25, pos }); cueAt('land', pos, 0.25); },
  empty: () => tone(220, 0.05, { type: 'square', vol: 0.1 }),
  reload: () => { tone(300, 0.06, { type: 'square', vol: 0.1 }); tone(450, 0.06, { type: 'square', vol: 0.1, delay: 0.5 }); tone(700, 0.1, { type: 'square', vol: 0.12, delay: 1.1 }); },
  pickup: () => [600, 800, 1000].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.2, delay: i * 0.06 })),
  hurt: () => tone(180, 0.25, { type: 'sawtooth', vol: 0.2, slide: -80 }),
  jump: () => hit(0.08, { freq: 600, vol: 0.1 }),
};
