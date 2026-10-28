// Pure (no THREE, no DOM) description of the hiding grass: what every quality preset must keep, and where the clumps go.
// Gameplay grass = the tall grass inside map.trial.grass rects. The server hides a crouched hider from a seeker beyond ~2.5 m
// (standing R = 9 m), so the grass must be geometrically present and unfaded out to at least CONCEAL_RANGE. Presets may drop
// decoration, shadows, post and resolution, never this.
export const CONCEAL_RANGE = 9;       // m: server concealment radius for a standing seeker
export const NEAR_FADE = 0.6;         // m: max camera-only fade distance (hider view, never the seeker, never around other players)
export const EDGE_BAND = 1.6;         // m: coverage thins out over this distance inside a rect edge
export const HEIGHT = { min: 1.35, max: 1.75 }; // m: interior blade height range

export function grassSpec(_tier) { // every tier returns the same gameplay grass: the argument only exists so the guarantee is testable
  return { clumpsPerM2: 6, heightMin: HEIGHT.min, heightMax: HEIGHT.max, drawRange: Infinity, wind: true, nearFade: NEAR_FADE };
}

const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const edgeDist = (rc, x, z) => Math.min(x - rc.x0, rc.x1 - x, z - rc.z0, rc.z1 - z);
export const coverage = (e) => 0.3 + 0.7 * Math.min(1, Math.max(0, e / EDGE_BAND)); // keep-probability and height factor ramp

// -> [{x, z, rot, sx, sy, sz, tint}] seeded, identical on every client; density thins at rect edges
export function planClumps(rects, spec, seed = 31) {
  const rand = mulberry(seed), out = [];
  for (const rc of rects ?? []) {
    const n = Math.round(spec.clumpsPerM2 * (rc.x1 - rc.x0) * (rc.z1 - rc.z0));
    for (let k = 0; k < n; k++) {
      const x = rc.x0 + rand() * (rc.x1 - rc.x0), z = rc.z0 + rand() * (rc.z1 - rc.z0), cv = coverage(edgeDist(rc, x, z));
      if (rand() > cv) continue;
      const h = spec.heightMin + rand() * (spec.heightMax - spec.heightMin);
      out.push({ x, z, rot: rand() * 6.283, sx: 0.9 + rand() * 0.4, sy: (h / spec.heightMax) * (0.55 + 0.45 * cv), sz: 0.9 + rand() * 0.4, tint: rand() });
    }
  }
  return out;
}
