// GPU tiering. Pure functions (no DOM) so they are unit-tested in node.
import { TIERS } from './budget.js';

// Tier from the WEBGL_debug_renderer_info string (+ optional navigator.deviceMemory in GB).
export function pickTier(renderer, { memGB } = {}) {
  const r = String(renderer || '');
  let t = 'med'; // unknown hardware: assume mid-range
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(r)) t = 'potato';
  else if (/RTX\s*(30[89]0|40[789]0|50[6-9]0)|RX\s*(6[89]00|7[89]00|9\d{3})/i.test(r)) t = 'ultra';
  else if (/Arc\(?(TM)?\)?\s*(Pro\s*)?Graphics|Intel/i.test(r) && !/Arc\(?(TM)?\)?\s*(Pro\s*)?[AB]\d{3}/i.test(r)) t = 'low'; // Intel(R) Graphics / UHD / Iris / iGPU Arc
  else if (/Mali|Adreno|PowerVR|VideoCore|Radeon\(?(TM)?\)?\s*Graphics|Vega\s*\d+\s*(Graphics)?$/i.test(r)) t = 'low';
  else if (/NVIDIA|GeForce|GTX|RTX|Quadro|Radeon\s*(RX|Pro)|Apple\s*(M\d|GPU)/i.test(r)) t = 'high';
  if (Number.isFinite(memGB) && memGB < 4 && TIERS.indexOf(t) > 1) t = 'low'; // under 4 GB of (shared) memory
  return t;
}

export const shift = (tier, d) => TIERS[Math.max(0, Math.min(TIERS.length - 1, TIERS.indexOf(tier) + d))];

// 2 s GPU-synchronous micro-benchmark of the real start view: median ms of render+finish.
// Under 10 ms means real headroom over 60 fps -> one tier up; over 28 ms means it can't hold ~35 fps -> one tier down.
export const BENCH = { upMs: 10, downMs: 28, ms: 2000 };
export function benchTier(tier, medianMs) {
  if (medianMs <= BENCH.upMs) return shift(tier, 1);
  if (medianMs >= BENCH.downMs) return shift(tier, -1);
  return tier;
}
