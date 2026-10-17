// Player settings, persisted in localStorage ('hs-opts', same key and `vol`/`cues` fields as before so saved options survive).
// settings.set(k, v) validates, saves and emits 'settings' {key, value}.
import { bus, EV } from './bus.js';

const KEY = 'hs-opts';
const QUALITY = ['low', 'med', 'high', 'ultra'];
const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

export const settings = { quality: 'high', fov: 72, sens: 0.0022, volume: 0.8, music: 0.6, sfx: 1, ui: 1, cues: true, invertY: false }; // volume = master bus; music / sfx / ui = the other audio buses (0..1)

try {
  const o = JSON.parse(localStorage.getItem(KEY) || '{}');
  if (typeof o.cues === 'boolean') settings.cues = o.cues;
  if (Number.isFinite(o.vol)) settings.volume = num(o.vol, 0, 1, 0.8);
  for (const k of ['music', 'sfx', 'ui']) if (Number.isFinite(o[k])) settings[k] = num(o[k], 0, 1, settings[k]);
  if (QUALITY.includes(o.quality)) settings.quality = o.quality;
  settings.fov = num(o.fov, 50, 110, 72); settings.sens = num(o.sens, 0.0005, 0.01, 0.0022);
  if (typeof o.invertY === 'boolean') settings.invertY = o.invertY;
} catch { /* storage blocked: defaults */ }

const save = () => {
  const { quality, fov, sens, volume, music, sfx, ui, cues, invertY } = settings;
  try { localStorage.setItem(KEY, JSON.stringify({ quality, fov, sens, vol: volume, music, sfx, ui, cues, invertY })); } catch { /* storage blocked: fine */ }
};

Object.defineProperty(settings, 'set', {
  enumerable: false,
  value(k, v) {
    if (!Object.hasOwn(settings, k)) throw new Error(`unknown setting ${k}`);
    if (k === 'quality' && !QUALITY.includes(v)) throw new Error(`bad quality ${v}`);
    settings[k] = v; save();
    bus.emit(EV.SETTINGS, { key: k, value: v });
  },
});
