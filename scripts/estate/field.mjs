// Coldwood estate terrain flattening field (shared by import.mjs and glb.mjs so the GLB, the colliders and the markers move together).
// The game's controller and server assume ground at y = 0. The authored heightfield varies only -0.34 .. +0.76 m inside the 132 m fence,
// so instead of terrain physics everything inside the fence is lowered by d(x, z): terrain -> 0, every model/instance re-seated by the same
// amount, colliders and markers too. d fades to 0 between 67 and 76 m (the scenic hills outside keep their relief), and to 0 over the
// Reedwater pond so the water plane stays flat inside its own (unchanged) depression.
import { readFileSync } from 'node:fs';

export const PLAY = 67, FADE = 76; // |x|,|z| fully flattened inside PLAY, untouched beyond FADE
export const POND = { x0: 30.5, x1: 45.4, z0: 31.5, z1: 41, ramp: 1.5 }; // water plane bbox (Water_Reedwater_Pond)
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function loadField(packDir) {
  const t = JSON.parse(readFileSync(`${packDir}/data/terrain_heightfield.json`, 'utf8'));
  const [ox, oz] = t.origin_xz, H = t.heights, n = t.columns, m = t.rows, s = t.spacing_m;
  const h = (x, z) => { // bilinear, rows +z, columns +x
    const fx = Math.min(n - 1.001, Math.max(0, (x - ox) / s)), fz = Math.min(m - 1.001, Math.max(0, (z - oz) / s));
    const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
    return (H[j][i] * (1 - a) + H[j][i + 1] * a) * (1 - b) + (H[j + 1][i] * (1 - a) + H[j + 1][i + 1] * a) * b;
  };
  const pond = (x, z) => { const e = Math.max(POND.x0 - x, x - POND.x1, POND.z0 - z, z - POND.z1, 0); return 1 - smooth(0, POND.ramp, e); };
  const w = (x, z) => 1 - smooth(PLAY, FADE, Math.max(Math.abs(x), Math.abs(z)));
  // how far to lower anything at (x, z). Over the pond only the raised bank is flattened: the depression (and the water plane in it) stays.
  const d = (x, z) => { const v = h(x, z), m = pond(x, z); return w(x, z) * (v * (1 - m) + Math.max(v, 0) * m); };
  return { h, d, ground: (x, z) => h(x, z) - d(x, z) }; // ground: visual terrain height after flattening
}
