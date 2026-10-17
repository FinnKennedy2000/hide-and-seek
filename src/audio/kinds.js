// Every sound audio.play() accepts. Pure data (no DOM / THREE) so tests can import it.
//   cue: key into ui/hud.js CUE (glyph + caption + colour), so every kind has a visual cue when it is positional
//   vol: default loudness for the cue / falloff   bus: 'sfx' | 'ui'   s: sample prefix (files /audio/<s>_<i>.ogg, i < n), '*' = per-surface footstep
//   g: gain trim applied to the sample   rate: playback rate   stinger: music stinger fired with the sound
// A kind with no `s` (or whose samples fail to load) falls back to the synthesised version in sfx.js.
export const KINDS = {
  step: { cue: 'step', vol: 0.18, bus: 'sfx', s: 'step_*', n: 3, g: 3 },
  sprint: { cue: 'sprint', vol: 0.3, bus: 'sfx', s: 'step_*', n: 3, g: 3, rate: 1.12 },
  land: { cue: 'land', vol: 0.25, bus: 'sfx', s: 'land', n: 2, g: 3 },
  scrape: { cue: 'scrape', vol: 0.09, bus: 'sfx', s: 'scrape', n: 1, g: 5 },
  taunt: { cue: 'taunt', vol: 0.3, bus: 'sfx' },
  shot: { cue: 'shot', vol: 0.18, bus: 'sfx', s: 'shot', n: 2, g: 2.5 },
  rustle: { cue: 'rustle', vol: 0.18, bus: 'sfx' },
  puff: { cue: 'puff', vol: 0.3, bus: 'sfx' },
  splat: { cue: 'splat', vol: 0.3, bus: 'sfx', s: 'splat', n: 2, g: 3 },
  hit: { cue: 'splat', vol: 0.3, bus: 'sfx', s: 'hit', n: 2, g: 3 },
  hurt: { cue: 'splat', vol: 0.25, bus: 'sfx', s: 'hit', n: 2, g: 3 },
  prop: { cue: 'scrape', vol: 0.2, bus: 'sfx', s: 'prop_wood', n: 2, g: 3 },
  prop_metal: { cue: 'scrape', vol: 0.2, bus: 'sfx', s: 'prop_metal', n: 2, g: 3 },
  prop_door: { cue: 'scrape', vol: 0.2, bus: 'sfx', s: 'prop_door', n: 1, g: 2 },
  jump: { cue: 'land', vol: 0.1, bus: 'sfx' },
  reload: { cue: 'scrape', vol: 0.1, bus: 'sfx' },
  hb: { cue: 'step', vol: 0.3, bus: 'sfx' },
  empty: { cue: 'shot', vol: 0.1, bus: 'ui', s: 'empty', n: 1, g: 2 },
  tick: { cue: 'step', vol: 0.1, bus: 'ui', s: 'tick', n: 1, g: 2 },
  found: { cue: 'taunt', vol: 0.2, bus: 'ui', s: 'found', n: 1, g: 2, stinger: 'tag' },
  pickup: { cue: 'taunt', vol: 0.2, bus: 'ui', s: 'pickup', n: 1, g: 2 },
  go: { cue: 'taunt', vol: 0.1, bus: 'ui', s: 'go', n: 1, g: 2 },
  ui: { cue: 'step', vol: 0.2, bus: 'ui', s: 'ui', n: 1, g: 2 },
  ui_error: { cue: 'step', vol: 0.2, bus: 'ui', s: 'ui_error', n: 1, g: 2 },
  alert: { cue: 'shot', vol: 0.12, bus: 'sfx', stinger: 'spotted' },
  win: { cue: 'taunt', vol: 0.2, bus: 'ui', stinger: 'win' },
  lose: { cue: 'taunt', vol: 0.14, bus: 'ui', stinger: 'lose' },
};
export const CULL = 0.012; // audibility floor shared by the visual cues, samples and the synth fallback (same value as CUE_MIN in ui/hud.js)
// p = voice priority (default 1): when the voice cap is hit the lowest priority voice is evicted first, so footsteps (0) go before stings (3)
for (const k of ['step', 'sprint']) KINDS[k].p = 0;
for (const k of ['found', 'win', 'lose', 'alert']) KINDS[k].p = 3;
// Validate a network 'sound' event: known kind, finite x/y/z, vol clamped to 0..1 (missing = the kind's default). null = drop it.
export function parseSound(m) {
  const def = KINDS[m?.kind];
  if (!def || ![m.x, m.y, m.z].every(Number.isFinite)) return null;
  if (m.vol !== undefined && !Number.isFinite(m.vol)) return null;
  return { kind: m.kind, pos: { x: m.x, y: m.y, z: m.z }, vol: m.vol === undefined ? def.vol : Math.min(1, Math.max(0, m.vol)) };
}
export const SURFACES = ['wood', 'tile', 'grass', 'concrete'];
export const files = (s, n) => Array.from({ length: n }, (_, i) => ({ key: `${s}_${i}`, url: `/audio/${s}_${i}.ogg`, type: 'audio' }));
// lazy sample sets: 'common' on first use, one footstep set per surface the current map uses (see zones.js)
export const setFiles = (name) => {
  if (name.startsWith('step_')) return files(name, 3);
  const out = [];
  for (const k of Object.values(KINDS)) if (k.s && !k.s.includes('*')) out.push(...files(k.s, k.n));
  return out;
};
