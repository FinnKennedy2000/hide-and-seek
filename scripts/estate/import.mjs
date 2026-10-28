// Coldwood estate importer: pack data/*.json -> src/shared/maps/coldwood_data.js (colliders + trial markers, flattened like the GLB).
// usage: node scripts/estate/import.mjs <COLDWOOD_Farm_Map_Pack dir>
// Colliders: the pack's boxes (full size, yaw) and cylinders become the engine's axis-aligned boxes {x0,x1,y0,y1,z0,z1}. Boxes at a
// multiple of 90 degrees map exactly; the 22 genuinely rotated ones (vehicles, boulders) become a row of AABB slices along their long axis,
// each the bounding box of its slice, so the stepped outline over-covers the true box by at most ~0.3 m. Cylinders become squares.
// Rules: nothing narrower than 0.4 m on its long side (posts / lantern poles are inflated), see-through shapes get ns:1 (skipped by LOS),
// vault sills are raised to 1.2 m (jump 0.9 + step 0.3) so a sill can only be crossed by the vault action, the pond's no-walk box is a 1.2 m wall.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadField } from './field.mjs';

const pack = process.argv[2];
if (!pack) { console.error('usage: node scripts/estate/import.mjs <pack dir>'); process.exit(1); }
const J = (p) => JSON.parse(readFileSync(`${pack}/${p}`, 'utf8'));
const G = J('data/gameplay.json'), C = J('data/colliders.json').colliders, F = loadField(pack);
const r3 = (v) => Math.round(v * 1000) / 1000, r2 = (v) => Math.round(v * 100) / 100;
const MIN_LONG = 0.42, MIN_THIN = 0.12, SLICE = 0.8; // (a hair over the 0.4 / 0.1 rules, so rounding never lands under them)

const out = [];
const push = (id, x0, x1, z0, z1, y0, y1, ns) => {
  let w = x1 - x0, d = z1 - z0;
  if (Math.max(w, d) < MIN_LONG) { const k = MIN_LONG / Math.max(w, d); const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; w *= k; d *= k; x0 = cx - w / 2; x1 = cx + w / 2; z0 = cz - d / 2; z1 = cz + d / 2; }
  if (w < MIN_THIN) { const cx = (x0 + x1) / 2; x0 = cx - MIN_THIN / 2; x1 = cx + MIN_THIN / 2; }
  if (d < MIN_THIN) { const cz = (z0 + z1) / 2; z0 = cz - MIN_THIN / 2; z1 = cz + MIN_THIN / 2; }
  const c = { id, x0: r3(x0), x1: r3(x1), y0: r3(y0), y1: r3(y1), z0: r3(z0), z1: r3(z1) };
  if (ns) c.ns = 1;
  out.push(c);
};
let sliced = 0;
function addShape(c) {
  const [cx, cy, cz] = c.center, d = F.d(cx, cz), ns = !c.blocksSight;
  let y0, y1;
  if (c.type === 'cylinder') {
    y0 = cy - c.height / 2 - d; y1 = cy + c.height / 2 - d;
    const r = Math.max(MIN_LONG / 2, c.radius);
    return push(c.id, cx - r, cx + r, cz - r, cz + r, y0, y1, ns);
  }
  let [sx, sy, sz] = c.size, th = c.yaw || 0;
  y0 = cy - sy / 2 - d; y1 = cy + sy / 2 - d;
  if (c.tag === 'water_boundary') { y0 = 0; y1 = 1.2; }
  if (/_sill_/.test(c.id)) { y0 = Math.min(y0, 0); y1 = 1.2; }
  const s2 = Math.abs(Math.sin(2 * th));
  if (s2 < 0.035) { // 0 / 90 / 180 / 270 degrees (within 1 degree)
    if (Math.abs(Math.sin(th)) > 0.7) [sx, sz] = [sz, sx];
    return push(c.id, cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, y0, y1, ns);
  }
  // rotated: slices along the local long axis. Local (u along x, v along z) -> world: x = cx + u cos + v sin, z = cz - u sin + v cos (three.js rotation.y)
  const cs = Math.cos(th), sn = Math.sin(th), longX = sx >= sz, L = longX ? sx : sz, S = longX ? sz : sx;
  const n = Math.max(2, Math.ceil(L / SLICE));
  sliced++;
  for (let k = 0; k < n; k++) {
    const a0 = -L / 2 + (L * k) / n, a1 = -L / 2 + (L * (k + 1)) / n;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const a of [a0, a1]) for (const b of [-S / 2, S / 2]) {
      const u = longX ? a : b, v = longX ? b : a, x = cx + u * cs + v * sn, z = cz - u * sn + v * cs;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    push(`${c.id}#${k}`, x0, x1, z0, z1, y0, y1, ns);
  }
}
for (const c of C) if (c.blocksMovement) addShape(c);
for (const g of G.exit_gates) addShape(g.closed_collision); // the gates stay shut: escaping is the existing 3 s gate channel, not walking out

// ----- markers (flattened ground is y = 0 everywhere a player can stand, so only x/z are kept)
const P2 = (p) => [r2(p[0]), r2(p[2])];
const relics = G.relic_sites.map((r) => ({ id: r.id, name: r.name, district: r.district, x: r.position[0], z: r.position[2] }));
const gates = G.exit_gates.map((g) => ({ id: g.id, name: g.name, x: g.position[0], z: r2(g.position[2] - g.outward_xz[1] * 1.4), gx: g.position[0], gz: g.position[2], leaves: g.leaf_nodes })); // interaction point 1.4 m inside the closed gate
const cages = G.cages.map((c) => ({ id: c.id, name: c.name, x: c.position[0], z: c.position[2], yaw: r3((c.facing_yaw_deg * Math.PI) / 180) }));
const spawns = G.hider_spawn_candidates.map((h) => ({ id: h.id, x: h.position[0], z: h.position[2] }));
const s = G.seeker_spawn, seeker = { id: s.id, x: s.position[0], z: s.position[2], yaw: Math.PI }; // north tree line, facing south into the map
const vaults = G.vaults.map((v) => ({ id: v.id, district: v.district, x: v.position[0], z: v.position[2], ax: v.wall_axis, w: v.width_m, h: 1.2, sill: v.sill_height_m, a: P2(v.landing_a), b: P2(v.landing_b) }));
const rect = (c, sz) => ({ x0: r2(c[0] - sz[0] / 2), x1: r2(c[0] + sz[0] / 2), z0: r2(c[2] - sz[2] / 2), z1: r2(c[2] + sz[2] / 2) });
const grass = G.grass_patches.map((g) => ({ id: g.id, ...rect(g.core_center, g.concealment_core_size), outer: rect(g.center, g.size), h: g.height_range_m }));
const districts = G.districts.map((d) => ({ id: d.id, name: d.name, x: d.center_xz[0], z: d.center_xz[1], w: d.footprint_xz[0], d: d.footprint_xz[1] }));
const routes = G.routes.map((r) => ({ id: r.id, w: r.width_m, pts: r.points_xz }));

// ----- report: how far the visual ground strays from y = 0 where people walk (only the pond ramp keeps any relief)
let worst = { v: 0 };
for (let x = -65.5; x <= 65.5; x += 0.5) for (let z = -65.5; z <= 65.5; z += 0.5) {
  if (out.some((c) => x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3 && c.y1 > 0.3)) continue;
  const g = F.ground(x, z); if (Math.abs(g) > Math.abs(worst.v)) worst = { v: g, x, z };
}
const raw = []; for (let x = -66; x <= 66; x++) for (let z = -66; z <= 66; z++) raw.push(F.h(x, z));
const stats = { colliders: out.length, packShapes: C.length, rotatedSliced: sliced, reliefMin: r3(Math.min(...raw)), reliefMax: r3(Math.max(...raw)), walkableGroundMaxDev: r3(worst.v), at: [worst.x, worst.z] };

const L = (a) => `[\n${a.map((o) => `  ${JSON.stringify(o)},`).join('\n')}\n]`;
writeFileSync(new URL('../../src/shared/maps/coldwood_data.js', import.meta.url), `// GENERATED by scripts/estate/import.mjs from the COLDWOOD Farm Map Pack (data/gameplay.json, data/colliders.json,
// data/terrain_heightfield.json). Do not edit by hand: re-run the importer. Coordinates in metres, +x east, +z south, ground flattened to y = 0.
// ${JSON.stringify(stats)}
export const STATS = ${JSON.stringify(stats)};
export const COLLIDERS = ${L(out)};
export const RELICS = ${L(relics)};
export const GATES = ${L(gates)};
export const CAGES = ${L(cages)};
export const SPAWNS = ${L(spawns)};
export const SEEKER = ${JSON.stringify(seeker)};
export const VAULTS = ${L(vaults)};
export const GRASS = ${L(grass)};
export const DISTRICTS = ${L(districts)};
export const ROUTES = ${L(routes)};
`);
console.log(stats);
