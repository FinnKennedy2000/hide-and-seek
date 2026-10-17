// Dev tool: node scripts/snap-spots.mjs <mapId> [--write]
// For every AI spot / spawn of a new map that is unreachable or overlaps a collider (same rules as tests/world/new-maps.test.mjs), finds the closest
// valid point (0.25 m search, <= 3 m) and prints it; with --write the numbers are patched in src/shared/maps/<mapId>.js.
import fs from 'node:fs';
import { buildWorld, MAPS } from '../src/shared/worlddata.js';
const id = process.argv[2], write = process.argv.includes('--write');
const NG = 104, CELL = 0.5, NMIN = -26, NR = 0.3;
const map = MAPS[id], w = buildWorld(undefined, id), m = map.meta;
const blocked = new Uint8Array(NG * NG);
for (const c of w.colliders) { if (c.y0 > 0.69 || c.y1 < 0.15) continue; for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) { const x = NMIN + (i + .5) * CELL, z = NMIN + (j + .5) * CELL; if (x > c.x0 - NR && x < c.x1 + NR && z > c.z0 - NR && z < c.z1 + NR) blocked[j * NG + i] = 1; } }
const cell = (v) => Math.min(NG - 1, Math.max(0, Math.floor((v - NMIN) / CELL)));
const seen = new Uint8Array(NG * NG), q = [cell(m.seekerStart.z) * NG + cell(m.seekerStart.x)]; seen[q[0]] = 1;
for (let h = 0; h < q.length; h++) { const ci = q[h] % NG, cj = (q[h] / NG) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const i = ci + di, j = cj + dj, n = j * NG + i; if (i < 0 || j < 0 || i >= NG || j >= NG || seen[n] || blocked[n]) continue; seen[n] = 1; q.push(n); } }
// real-player reach: 0.1 m grid, radius 0.3, crouch height 1.0, flat ground (same rule as tests/world/reachability.test.mjs)
const RG = 520, RC = 0.1, RM = -26, rci = (v) => Math.floor((v - RM) / RC), real = new Uint8Array(RG * RG), rb = new Uint8Array(RG * RG);
for (const c of w.colliders) { if (c.y1 <= 0.05 || c.y0 >= 1.0) continue; for (let j = Math.max(0, rci(c.z0 - 0.3)); j <= Math.min(RG - 1, rci(c.z1 + 0.3)); j++) for (let i = Math.max(0, rci(c.x0 - 0.3)); i <= Math.min(RG - 1, rci(c.x1 + 0.3)); i++) { const x = RM + (i + .5) * RC, z = RM + (j + .5) * RC; if (x > c.x0 - 0.3 && x < c.x1 + 0.3 && z > c.z0 - 0.3 && z < c.z1 + 0.3) rb[j * RG + i] = 1; } }
{ const st = [rci(m.seekerStart.z) * RG + rci(m.seekerStart.x)]; real[st[0]] = 1; while (st.length) { const k = st.pop(), i = k % RG, j = (k / RG) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj, n = b * RG + a; if (a < 0 || b < 0 || a >= RG || b >= RG || real[n] || rb[n]) continue; const x = RM + (a + .5) * RC, z = RM + (b + .5) * RC; if (x < m.bounds.x0 || x > m.bounds.x1 || z < m.bounds.z0 || z > m.bounds.z1) continue; real[n] = 1; st.push(n); } } }
const realOk = (x, z) => !!real[rci(z) * RG + rci(x)];
const snapOk = (x, z) => {
  if (!realOk(x, z)) return false; const ci = cell(x), cj = cell(z); if (!blocked[cj * NG + ci]) return !!seen[cj * NG + ci]; let best = null, bd = 1e9; for (let r = 1; r < 10 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= NG || j >= NG || blocked[j * NG + i]) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = j * NG + i; } } return best !== null && !!seen[best]; };
const hit = (x, z, r, h) => w.colliders.some((c) => c.y1 > 0.05 && c.y0 < h && x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);
const solid = w.colliders.filter((c) => c.y0 < 0.4 && c.y1 > 0.4);
const inB = (x, z, p) => x > m.bounds.x0 + p && x < m.bounds.x1 - p && z > m.bounds.z0 + p && z < m.bounds.z1 - p;
const goodSpot = (x, z, crouch) => inB(x, z, 0.3) && snapOk(x, z) && !solid.some((c) => x > c.x0 - 0.2 && x < c.x1 + 0.2 && z > c.z0 - 0.2 && z < c.z1 + 0.2) && !hit(x, z, 0.25, crouch ? 1.0 : 1.7);
const goodSpawn = (x, z) => inB(x, z, 0.3) && snapOk(x, z) && !hit(x, z, 0.35, 1.7);
const find = (x, z, ok) => { let best = null, bd = 1e9; for (let dx = -3; dx <= 3; dx += 0.25) for (let dz = -3; dz <= 3; dz += 0.25) { const d = dx * dx + dz * dz; if (d < bd && ok(x + dx, z + dz)) { bd = d; best = [x + dx, z + dz]; } } return best; };
let src = fs.readFileSync(new URL(`../src/shared/maps/${id}.js`, import.meta.url), 'utf8'), n = 0;
const f = (v) => String(+v.toFixed(2));
const sub = (re, x, z, fmt, p) => { let hit = false; src = src.replace(re, (all, a, b) => (!hit && +a === x && +b === z ? ((hit = true), fmt(f(p[0]), f(p[1]))) : all)); return hit; };
for (const s of map.spots) if (!goodSpot(s.x, s.z, s.crouch)) {
  const p = find(s.x, s.z, (x, z) => goodSpot(x, z, s.crouch)); n++;
  console.log(`spot ${s.kind} (${s.x}, ${s.z}) -> ${p ? p.map(f).join(', ') : 'NONE'}`);
  if (p && write && !sub(/\{ x: (-?[\d.]+), z: (-?[\d.]+), kind/g, s.x, s.z, (a, b) => `{ x: ${a}, z: ${b}, kind`, p)) console.log('  (not a literal, edit by hand)');
}
for (const [x, z] of map.spawns) if (!goodSpawn(x, z)) {
  const p = find(x, z, goodSpawn); n++;
  console.log(`spawn (${x}, ${z}) -> ${p ? p.map(f).join(', ') : 'NONE'}`);
  if (p && write && !sub(/\[(-?[\d.]+), (-?[\d.]+)\]/g, x, z, (a, b) => `[${a}, ${b}]`, p)) console.log('  (not a literal, edit by hand)');
}
if (write) fs.writeFileSync(new URL(`../src/shared/maps/${id}.js`, import.meta.url), src);
console.log(n ? `${n} to fix${write ? ' (written)' : ''}` : 'all good');
