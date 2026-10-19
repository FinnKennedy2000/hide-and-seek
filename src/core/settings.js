// Player settings, persisted in localStorage ('hs-opts', same key and `vol`/`cues` fields as before so saved options survive).
// settings.set(k, v) validates, saves and emits 'settings' {key, value}. The UI (src/ui/settings-screen.js) writes these; producers read them.
import { bus, EV } from './bus.js';

const KEY = 'hs-opts';
const SHAKE = ['off', 'low', 'med', 'high'];
export const QUALITY = ['potato', 'low', 'med', 'high', 'ultra'];
const num = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const prefersReduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

// binds: action -> KeyboardEvent.code overrides (see src/ui/menus.js BINDINGS); onboarded: role -> true once the first-play overlay was seen
export const DEFAULTS = Object.freeze({
  quality: 'high', autoQuality: true, fov: 72, sens: 0.0022, invertY: false,
  volume: 0.8, music: 0.6, sfx: 1, ui: 1, // master + buses
  cues: true, reducedMotion: prefersReduced(), colorBlind: false,
  headBob: 1, shake: 'med', // camera feel (read by the player controller / camera shake)
  fpsCap: 60,      // 60 | 30 (eco)
  perfHud: false,  // F3 overlay
  binds: {}, onboarded: {},
});
export const settings = { ...DEFAULTS, reducedMotion: prefersReduced(), binds: {}, onboarded: {} };

// per-key validators: return the cleaned value or throw
const bool = (v) => { if (typeof v !== 'boolean') throw new Error('expected boolean'); return v; };
const VALID = {
  quality: (v) => { if (!QUALITY.includes(v)) throw new Error(`bad quality ${v}`); return v; },
  fov: (v) => num(v, 50, 110, 72), sens: (v) => num(v, 0.0005, 0.01, 0.0022),
  volume: (v) => num(v, 0, 1, 0.8), music: (v) => num(v, 0, 1, 0.6), sfx: (v) => num(v, 0, 1, 1), ui: (v) => num(v, 0, 1, 1),
  autoQuality: bool, invertY: bool, cues: bool, reducedMotion: bool, colorBlind: bool, perfHud: bool,
  headBob: (v) => num(v, 0, 1, 1),
  shake: (v) => { if (!SHAKE.includes(v)) throw new Error(`bad shake ${v}`); return v; },
  fpsCap: (v) => { if (v !== 60 && v !== 30) throw new Error(`bad fpsCap ${v}`); return v; },
  binds: (v) => { if (!v || typeof v !== 'object') throw new Error('expected object'); return Object.fromEntries(Object.entries(v).filter(([, c]) => typeof c === 'string')); },
  onboarded: (v) => { if (!v || typeof v !== 'object') throw new Error('expected object'); return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, !!x])); },
};

try {
  const o = JSON.parse(localStorage.getItem(KEY) || '{}');
  const saved = { ...o, volume: o.vol ?? o.volume }; // legacy field name
  for (const k of Object.keys(VALID)) {
    if (saved[k] === undefined) continue;
    try { settings[k] = VALID[k](saved[k]); } catch { /* bad stored value: keep default */ }
  }
} catch { /* storage blocked: defaults */ }

const save = () => {
  const { volume, ...rest } = settings;
  try { localStorage.setItem(KEY, JSON.stringify({ ...rest, shake: settings.raw('shake'), headBob: settings.raw('headBob'), vol: volume })); } catch { /* storage blocked: fine */ }
};

// Reduce motion is an override applied at read time: the user's own shake / head-bob values are kept and come back when it is turned off.
// settings.raw(k) returns the stored value (the settings screen shows that one).
const stored = { shake: settings.shake, headBob: settings.headBob };
for (const [k, off] of [['shake', 'off'], ['headBob', 0]]) Object.defineProperty(settings, k, { enumerable: true, get: () => (settings.reducedMotion ? off : stored[k]), set: (v) => { stored[k] = v; } });
Object.defineProperty(settings, 'raw', { enumerable: false, value: (k) => (k in stored ? stored[k] : settings[k]) });

Object.defineProperty(settings, 'set', {
  enumerable: false,
  value(k, v) {
    if (!Object.hasOwn(VALID, k)) throw new Error(`unknown setting ${k}`);
    settings[k] = VALID[k](v); save();
    bus.emit(EV.SETTINGS, { key: k, value: settings[k] });
  },
});
