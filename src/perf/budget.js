// Per-preset caps. Everything that scales with quality reads them from here (render, characters, world, audio, fx).
// calls/tris are the CI budget for the worst view on any map (shadow + post passes included); `scale` is the starting render scale.
export const TIERS = ['potato', 'low', 'med', 'high', 'ultra'];

const T = (o) => Object.freeze(o);
const tiers = {
  potato: T({ calls: 120, tris: 250000, scale: 0.67, pr: 1, shadows: false, lambert: true, bloom: false, fxaa: true, lights: 2, fogCull: 35, tex: 512, particles: 64, decals: 20, voices: 16, charLod: 2 }),
  low:    T({ calls: 120, tris: 250000, scale: 0.8,  pr: 1, shadows: false, lambert: true, bloom: false, fxaa: true, lights: 2, fogCull: 35, tex: 512, particles: 64, decals: 20, voices: 16, charLod: 2 }),
  med:    T({ calls: 300, tris: 500000, scale: 1,    pr: 1, shadows: true, lambert: false, bloom: true, fxaa: false, lights: 6, fogCull: 70, tex: 1024, particles: 160, decals: 40, voices: 24, charLod: 6 }),
  high:   T({ calls: 300, tris: 900000, scale: 1,    pr: 1.5, shadows: true, lambert: false, bloom: true, fxaa: false, lights: 12, fogCull: 140, tex: 2048, particles: 320, decals: 80, voices: 32, charLod: 14 }),
  ultra:  T({ calls: 300, tris: 1500000, scale: 1,   pr: 2, shadows: true, lambert: false, bloom: true, fxaa: false, lights: 16, fogCull: Infinity, tex: 4096, particles: 640, decals: 150, voices: 48, charLod: 25 }),
};

export const budget = {
  ...tiers,
  maxCalls: 300,
  cur: tiers.med,               // the active tier's caps (set by perf runtime via setCurrent)
  of: (tier) => tiers[tier] ?? tiers.med,
  setCurrent(tier) { budget.cur = budget.of(tier); },
};
