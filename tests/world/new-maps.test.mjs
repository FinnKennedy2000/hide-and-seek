// Reachability + hygiene checks for the four new maps (school, museum, funfair, office). Run: node tests/world/new-maps.test.mjs [mapId...]
// The flood fill uses the SAME grid and blocking rule as src/ai/nav.js (0.5 m cells, 0.3 m radius, colliders with y0 <= 0.69 && y1 >= 0.15 block),
// so "reachable here" means "an AI hider can path there in the game".
import { createHash } from 'node:crypto';
import { buildWorld, MAPS } from '../../src/shared/worlddata.js';

const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ['school', 'museum', 'funfair', 'office'].filter((i) => MAPS[i]);
const NG = 104, CELL = 0.5, NMIN = -26, NR = 0.3;
let fail = 0;
const ok = (c, n) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };

function grid(colliders) {
  const blocked = new Uint8Array(NG * NG);
  for (const c of colliders) {
    if (c.y0 > 0.69 || c.y1 < 0.15) continue;
    for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) {
      const x = NMIN + (i + 0.5) * CELL, z = NMIN + (j + 0.5) * CELL;
      if (x > c.x0 - NR && x < c.x1 + NR && z > c.z0 - NR && z < c.z1 + NR) blocked[j * NG + i] = 1;
    }
  }
  return blocked;
}
const cell = (v) => Math.min(NG - 1, Math.max(0, Math.floor((v - NMIN) / CELL)));
function flood(blocked, x, z) {
  const seen = new Uint8Array(NG * NG), s = cell(z) * NG + cell(x), q = [s];
  if (blocked[s]) return null;
  seen[s] = 1;
  for (let h = 0; h < q.length; h++) {
    const ci = q[h] % NG, cj = (q[h] / NG) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = ci + di, j = cj + dj, n = j * NG + i;
      if (i < 0 || j < 0 || i >= NG || j >= NG || seen[n] || blocked[n]) continue;
      seen[n] = 1; q.push(n);
    }
  }
  return seen;
}
// same snap as nav.js nearestFree: a spot's own cell if free, else the closest free cell within 9 cells; the spot counts as reachable if THAT cell is
const near = (seen, x, z, blocked) => {
  const ci = cell(x), cj = cell(z);
  if (!blocked[cj * NG + ci]) return !!seen[cj * NG + ci];
  let best = null, bd = 1e9;
  for (let r = 1; r < 10 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= NG || j >= NG || blocked[j * NG + i]) continue;
    const d = di * di + dj * dj; if (d < bd) { bd = d; best = j * NG + i; }
  }
  return best !== null && !!seen[best];
};
// nearest reachable free point, for fixing a bad spot by hand
function suggest(blocked, seen, x, z) {
  let best = null, bd = 1e9;
  for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) if (seen[j * NG + i]) {
    const px = NMIN + (i + 0.5) * CELL, pz = NMIN + (j + 0.5) * CELL, d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) { bd = d; best = [px, pz]; }
  }
  return best;
}
// does a body of radius r and height h standing at (x,z) overlap a collider? (player: r 0.3, 1.7 tall, or 1.0 crouched)
const hits = (cols, x, z, r, h) => cols.filter((c) => c.y1 > 0.05 && c.y0 < h && x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r);

for (const id of IDS) {
  console.log(`--- ${id}`);
  const map = MAPS[id], w = buildWorld(undefined, id);
  const w2 = buildWorld(undefined, id);
  ok(createHash('sha256').update(JSON.stringify(w)).digest('hex') === createHash('sha256').update(JSON.stringify(w2)).digest('hex'), `${id}: build is deterministic`);
  const kinds = new Set(w.props.map((p) => p.name));
  ok(w.props.length >= 60, `${id}: ${w.props.length} props (>= 60)`);
  ok(kinds.size >= 20, `${id}: ${kinds.size} prop kinds (>= 20)`);
  ok(w.props.every((p) => Number.isFinite(p.x + p.z + p.w + p.d + p.h) && p.w > 0 && p.h > 0), `${id}: every prop has finite bounds`);
  ok(map.spots.length >= 40, `${id}: ${map.spots.length} AI spots (>= 40)`);
  ok(map.spawns.length >= 18, `${id}: ${map.spawns.length} spawns (>= 18)`);
  const m = map.meta;
  ok(m.zones?.length >= 4 && m.zones.every((z) => z.name && z.x1 > z.x0 && z.z1 > z.z0 && z.box && z.box.x0 === z.x0 && ['room', 'hall', 'outdoor'].includes(z.reverb) && ['wood', 'tile', 'grass', 'concrete'].includes(z.surface)), `${id}: meta.zones well formed`);
  ok(m.thumbnail && m.fog && m.sky && m.ambient && m.bounds && m.seekerStart, `${id}: meta has thumbnail, fog, sky, ambient, bounds, seekerStart`);
  ok(m.bounds.x0 >= NMIN && m.bounds.x1 <= -NMIN && m.bounds.z0 >= NMIN && m.bounds.z1 <= -NMIN, `${id}: bounds fit the AI nav grid (+-26 m)`);
  const mixKinds = new Set(map.spots.map((s) => s.kind));
  ok(map.mix.reduce((a, [, n]) => a + n, 0) === 5 && map.mix.every(([k, n]) => map.spots.filter((s) => s.kind === k).length >= n), `${id}: mix sums to 5 hiders and every kind has spots`);
  const blocked = grid(w.colliders), seen = flood(blocked, m.seekerStart.x, m.seekerStart.z);
  ok(!!seen, `${id}: seekerStart is on free ground`);
  if (!seen) continue;
  if (process.env.ASCII) { // ASCII=1: '#' blocked, '.' reachable, ' ' free but unreachable, 'S' spot, 'o' spawn; rows are z (north on top), columns x
    const mk = new Map(); map.spots.forEach((sp) => mk.set(cell(sp.z) * NG + cell(sp.x), 'S')); map.spawns.forEach(([x, z]) => mk.set(cell(z) * NG + cell(x), 'o'));
    for (let j = 0; j < NG; j++) { let r = ''; for (let i = 0; i < NG; i++) { const n = j * NG + i, x = NMIN + (i + .5) * CELL, z = NMIN + (j + .5) * CELL; if (x < m.bounds.x0 - 1 || x > m.bounds.x1 + 1 || z < m.bounds.z0 - 1 || z > m.bounds.z1 + 1) continue; r += mk.get(n) || (blocked[n] ? '#' : seen[n] ? '.' : ' '); } if (r.trim()) console.log(r); }
  }
  const solid = w.colliders.filter((c) => c.y0 < 0.4 && c.y1 > 0.4);
  const bad = [];
  map.spots.forEach((s, i) => {
    const why = [];
    if (!near(seen, s.x, s.z, blocked)) why.push('unreachable');
    if (solid.some((c) => s.x > c.x0 - 0.2 && s.x < c.x1 + 0.2 && s.z > c.z0 - 0.2 && s.z < c.z1 + 0.2)) why.push('inside collider');
    else if (hits(w.colliders, s.x, s.z, 0.25, s.crouch ? 1.0 : 1.7).length) why.push('body overlaps collider');
    if (Math.abs(s.x) > -NMIN || Math.abs(s.z) > -NMIN || s.x < m.bounds.x0 || s.x > m.bounds.x1 || s.z < m.bounds.z0 || s.z > m.bounds.z1) why.push('out of bounds');
    if (why.length) bad.push(`#${i} (${s.x}, ${s.z}) ${s.kind}: ${why.join(', ')} -> try ${suggest(blocked, seen, s.x, s.z)?.join(', ')}`);
  });
  ok(!bad.length, `${id}: all spots reachable, outside colliders${bad.length ? '\n  ' + bad.join('\n  ') : ''}`);
  const badSp = [];
  map.spawns.forEach(([x, z], i) => {
    const why = [];
    if (!near(seen, x, z, blocked)) why.push('unreachable');
    if (hits(w.colliders, x, z, 0.35, 1.7).length) why.push('overlaps collider');
    if (x < m.bounds.x0 + 0.3 || x > m.bounds.x1 - 0.3 || z < m.bounds.z0 + 0.3 || z > m.bounds.z1 - 0.3) why.push('out of bounds');
    if (why.length) badSp.push(`#${i} (${x}, ${z}): ${why.join(', ')} -> try ${suggest(blocked, seen, x, z)?.join(', ')}`);
  });
  ok(!badSp.length, `${id}: all spawns reachable, clear of colliders${badSp.length ? '\n  ' + badSp.join('\n  ') : ''}`);
  const inside = w.colliders.filter((c) => c.x0 < m.bounds.x0 - 0.3 || c.x1 > m.bounds.x1 + 0.3 || c.z0 < m.bounds.z0 - 0.3 || c.z1 > m.bounds.z1 + 0.3);
  ok(!inside.length, `${id}: colliders stay inside bounds`);
  // reachable share of the walkable floor (catches maps cut in two by a misplaced wall)
  const free = blocked.reduce((a, v) => a + (v ? 0 : 1), 0), got = seen.reduce((a, v) => a + v, 0);
  const inB = (() => { let n = 0; for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) { const x = NMIN + (i + .5) * CELL, z = NMIN + (j + .5) * CELL; if (x > m.bounds.x0 && x < m.bounds.x1 && z > m.bounds.z0 && z < m.bounds.z1 && !blocked[j * NG + i]) n++; } return n; })();
  const reach = (() => { let n = 0; for (let j = 0; j < NG; j++) for (let i = 0; i < NG; i++) { const x = NMIN + (i + .5) * CELL, z = NMIN + (j + .5) * CELL; if (x > m.bounds.x0 && x < m.bounds.x1 && z > m.bounds.z0 && z < m.bounds.z1 && seen[j * NG + i]) n++; } return n; })();
  ok(reach / inB > 0.97, `${id}: ${(100 * reach / inB).toFixed(1)}% of free floor inside bounds is reachable (> 97%)`);
  // draw-call estimate: same grouping as src/world/build.js flushRecs (prop | material | cast | recv | solid)
  const groups = new Set(), inst = new Set(), names = w.props.map((p) => p.name);
  buildWorld({
    box: (cx, cz, wd, d, h, mat, o, p) => { groups.add(`${p}|${mat}|${o.cast ?? true}|${o.recv ?? true}|true`); inst.add(p < 0 ? `s|${mat}|${o.cast ?? true}|${o.recv ?? true}` : `${names[p]}|${mat}`); },
    mesh: (g, mat, x, y, z, o, p) => { groups.add(`${p}|${mat}|${o.cast ?? true}|true|${o.cast !== false}`); inst.add(p < 0 ? `s|${mat}|${o.cast ?? true}|true` : `${names[p]}|${g[0]}|${mat}`); },
    books: () => groups.add('books'),
  }, id);
  console.log(`INFO ${id}: ~${groups.size} draw calls after merge (build.js grouping), ~${inst.size} if repeated prop kinds are instanced (one draw per kind+material), ${w.colliders.length} colliders, size ${(m.bounds.x1 - m.bounds.x0).toFixed(0)}x${(m.bounds.z1 - m.bounds.z0).toFixed(0)}`);
  const used = new Set(), unused = Object.keys(map.materials);
  buildWorld({ box: (a, b2, c, d, e, mat) => used.add(mat), mesh: (g, mat) => used.add(mat) }, id);
  ok([...used].every((n) => n in map.materials), `${id}: every material used is declared in the map's own materials${[...used].filter((n) => !(n in map.materials)).join(',')}`);
  ok(Object.keys(map.materials).every((n) => n.startsWith({ school: 'sc_', museum: 'mu_', funfair: 'ff_', office: 'of_' }[id])), `${id}: material names are prefixed (the client table is global)`);
  ok(groups.size <= 200, `${id}: draw calls ${groups.size} <= 200 before perf.instanceStatic`);
}
process.exit(fail ? 1 : 0);
