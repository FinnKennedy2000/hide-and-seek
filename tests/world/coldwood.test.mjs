// Coldwood Farm estate (132 m, src/shared/maps/coldwood.js): layout metrics at walk 3.9 / sprint 6.8 m/s (printed), seeded relic and spawn
// picks (src/shared/trialpick.js), the import rules (no snag colliders, vault sills, flattened ground) and the GLB grass audit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWorld, MAPS } from '../../src/shared/worlddata.js';
import { createNav } from '../../src/shared/nav.js';
import { pickRelics, pickSpawns, clusterScore } from '../../src/shared/trialpick.js';
import { STATS, RELICS, GRASS, VAULTS, GATES } from '../../src/shared/maps/coldwood_data.js';

const WALK = 3.9, SPRINT = 6.8, map = MAPS.coldwood, t = map.trial, { colliders } = buildWorld(undefined, 'coldwood');
const nav = createNav(colliders, map.meta.bounds); nav.buildNav();
const len = (a, b, nv = nav) => { const p = [{ x: a[0], z: a[1] }, ...nv.findPath(a[0], a[1], b[0], b[1])]; let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return d; };
const straight = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const S = [t.seekerStart.x, t.seekerStart.z], stats = (xs) => ({ min: Math.min(...xs), avg: xs.reduce((s, v) => s + v, 0) / xs.length, max: Math.max(...xs) });
const f = (v) => v.toFixed(1), sec = (m) => `${f(m / WALK)} s walk / ${f(m / SPRINT)} s sprint`;
const D = t.relics.map((a) => t.relics.map((b) => (a === b ? 0 : len(a, b))));
const df = nav.distField(S[0], S[1]);
const info = { path: t.hiderSpawns.map(([x, z]) => df(x, z)), seen: t.hiderSpawns.map(([x, z]) => straight(S, [x, z]) < 60 && nav.losClear(S[0], 1.6, S[1], x, 1.0, z)) };

test('coldwood: travel times and objective spacing at the new scale (printed)', () => {
  const pair = []; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) pair.push(D[i][j]);
  const nn = D.map((row, i) => Math.min(...row.filter((_, j) => j !== i)));
  const gates = len(t.gates[0], t.gates[1]), far = Math.max(...pair);
  const corner = len([-60, -60], [60, 60]), ring = [[-27, -28], [27, -28], [29, 0], [27, 28], [-27, 28], [-29, 0], [-27, -28]].reduce((s, p, i, a) => (i ? s + len(a[i - 1], p) : 0), 0);
  const sp2rel = t.hiderSpawns.map((s) => Math.min(...t.relics.map((r) => straight(s, r))));
  const seek2rel = t.relics.map((r) => len(S, r)), sp2gate = t.hiderSpawns.map((s) => Math.min(...t.gates.map((g) => len(s, g))));
  const out = {
    'gate N -> gate S path': `${f(gates)} m = ${sec(gates)}`, 'corner -> corner (NW -> SE) path': `${f(corner)} m = ${sec(corner)}`,
    'service ring (RING route) lap': `${f(ring)} m = ${sec(ring)}`, 'farthest relic pair': `${f(far)} m = ${sec(far)}`,
    'relic pair path min/avg/max (m)': Object.values(stats(pair)).map(f).join(' / '), 'relic nearest-neighbour path min/avg/max (m)': Object.values(stats(nn)).map(f).join(' / '),
    'seeker start -> relic path min/avg/max (m)': Object.values(stats(seek2rel)).map(f).join(' / '), 'seeker start -> relic avg': sec(stats(seek2rel).avg),
    'hider start -> nearest relic straight min/avg (m)': `${f(stats(sp2rel).min)} / ${f(stats(sp2rel).avg)}`,
    'hider start -> nearest gate path min/avg (m)': `${f(stats(sp2gate).min)} / ${f(stats(sp2gate).avg)}`,
    'seeker start -> hider start path min/avg/max (m)': Object.values(stats(info.path)).map(f).join(' / '),
    'hider starts valid (path >= 40 m, unseen from seeker start)': `${info.path.filter((p, i) => p >= 40 && !info.seen[i]).length} / ${t.hiderSpawns.length}`,
  };
  console.log(`coldwood estate metrics\n${Object.entries(out).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`);
  assert.ok(gates >= 110 && gates / SPRINT >= 15, `gates ${gates}`);
  assert.ok(stats(nn).min >= 20, 'no two relic candidates within 20 m walk of each other');
  assert.ok(stats(sp2rel).min >= 8, 'no hider start next to a relic');
  assert.ok(info.path.filter((p, i) => p >= 40 && !info.seen[i]).length >= 12, 'enough safe hider starts for 7 hiders and variety');
});

test('coldwood: seeded relic picks are spread out, varied and deterministic (4 seeds printed)', () => {
  const ids = (sel) => sel.map((k) => RELICS[k].id).sort().join(' ');
  const all = []; for (let k = 0; k < 8; k++) for (let a = k + 1; a < 8; a++) for (let b = a + 1; b < 8; b++) all.push(clusterScore(D, [k, a, b]));
  const worstTriple = Math.min(...all);
  const seen = new Map(), lines = [];
  for (let seed = 1; seed <= 400; seed++) {
    const sel = pickRelics(t.relics, (a, b) => D[a][b], seed, 6);
    assert.equal(new Set(sel).size, 6, 'six distinct relics');
    assert.deepEqual(sel, pickRelics(t.relics, (a, b) => D[a][b], seed, 6), 'same seed, same pick');
    const sc = clusterScore(D, sel); assert.ok(sc > worstTriple, 'never the tightest triple on the map');
    seen.set(ids(sel), (seen.get(ids(sel)) || 0) + 1);
    if (seed <= 4) lines.push(`  seed ${seed}: ${ids(sel)}  (closest three need a ${f(sc)} m walk)`);
  }
  const off = new Map(RELICS.map((r) => [r.id, 0])); for (const [k, n] of seen) for (const r of RELICS) if (!k.includes(r.id)) off.set(r.id, off.get(r.id) + n);
  console.log(`relic picks\n${lines.join('\n')}\n  ${seen.size} distinct sets over 400 seeds; times each candidate sat out: ${[...off].map(([k, n]) => `${k} ${n}`).join(', ')}\n  tightest triple anywhere: ${f(worstTriple)} m`);
  assert.ok(seen.size >= 3, 'the live set varies with the seed');
});

test('coldwood: hider starts avoid the seeker by walking distance and sight', () => {
  for (const k of [1, 3, 5, 7]) for (let seed = 1; seed <= 50; seed++) {
    const sel = pickSpawns(t.hiderSpawns, k, info, seed);
    assert.equal(new Set(sel).size, k);
    for (const i of sel) assert.ok(info.path[i] >= 40 && !info.seen[i], `seed ${seed} start ${i} unsafe`);
    if (k > 1) assert.ok(Math.min(...sel.flatMap((i) => sel.filter((j) => j !== i).map((j) => straight(t.hiderSpawns[i], t.hiderSpawns[j])))) >= 12, 'starts spread apart');
  }
});

test('coldwood: both gates have two approaches (blocking the shortest route midpoint leaves a detour)', () => {
  for (const g of t.gates) for (const from of [S, [0, 0], [-42, 8], [44, 3], [-7, 43]]) {
    const p = [{ x: from[0], z: from[1] }, ...nav.findPath(from[0], from[1], g[0], g[1])], base = len(from, g);
    if (base < 20) continue;
    let d = 0, mid = p[0]; for (let i = 1; i < p.length; i++) { const l = Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); if (d + l >= base * 0.6) { const k = (base * 0.6 - d) / l; mid = { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k, z: p[i - 1].z + (p[i].z - p[i - 1].z) * k }; break; } d += l; }
    if (Math.hypot(mid.x - g[0], mid.z - g[1]) < 8) continue;
    const cs = [...colliders, { x0: mid.x - 2.5, x1: mid.x + 2.5, z0: mid.z - 2.5, z1: mid.z + 2.5, y0: 0, y1: 2 }], nv = createNav(cs, map.meta.bounds); nv.buildNav();
    const alt = nv.reachableFrom(from[0], from[1])(g[0], g[1]), altLen = alt ? len(from, g, nv) : Infinity;
    assert.ok(alt && altLen < base * 2.2, `gate ${g} from ${from}: detour ${f(altLen)} vs ${f(base)}`);
  }
});

test('coldwood: import rules (snag colliders, sills, flat ground, vaults optional, grass cores)', () => {
  const tiny = colliders.filter((c) => Math.max(c.x1 - c.x0, c.z1 - c.z0) < 0.4 || Math.min(c.x1 - c.x0, c.z1 - c.z0) < 0.1);
  assert.deepEqual(tiny, []);
  assert.equal(t.vaults.length, 16);
  assert.ok(Math.abs(STATS.walkableGroundMaxDev) <= 0.05, `visual ground within 5 cm of y = 0 wherever a player stands (${STATS.walkableGroundMaxDev})`);
  let lights = 0; buildWorld({ light: () => lights++ }, 'coldwood');
  assert.ok(lights <= 14, `lights ${lights}`);
  // vaults are shortcuts: with every sill sealed shut the objectives are all still reachable on foot
  const sealed = [...colliders, ...VAULTS.map((v) => (v.ax === 'z' ? { x0: v.x - 0.3, x1: v.x + 0.3, z0: v.z - 1.5, z1: v.z + 1.5, y0: 0, y1: 3 } : { x0: v.x - 1.5, x1: v.x + 1.5, z0: v.z - 0.3, z1: v.z + 0.3, y0: 0, y1: 3 }))];
  const nv = createNav(sealed, map.meta.bounds); nv.buildNav(); const r = nv.reachableFrom(S[0], S[1]);
  const lost = [...t.cages, ...t.gates, ...t.hiderSpawns].filter(([x, z]) => !r(x, z));
  const lostRelic = RELICS.filter((q) => ![0, 1, 2, 3, 4, 5, 6, 7].some((a) => r(q.x + 1.5 * Math.cos(a * Math.PI / 4), q.z + 1.5 * Math.sin(a * Math.PI / 4))));
  assert.deepEqual([...lost, ...lostRelic.map((q) => q.id)], [], 'reachable without any vault');
  for (const g of GRASS) assert.ok(g.x0 > g.outer.x0 + 0.5 && g.x1 < g.outer.x1 - 0.5 && g.z0 > g.outer.z0 + 0.5 && g.z1 < g.outer.z1 - 0.5, `${g.id} core is inset`);
  const audit = JSON.parse(readFileSync(new URL('../../scripts/estate/grass-audit.json', import.meta.url), 'utf8'));
  assert.equal(audit.length, 28);
  for (const a of audit) assert.ok(a.perM2 >= 6 && a.minTop >= 1.45, `${a.id}: ${a.perM2} clumps/m2 in the core, blades from ${a.minTop} m`);
  assert.ok(GATES.every((g) => Math.abs(g.gz) === 65), 'gates on the north / south fence');
  console.log(`  colliders ${colliders.length} (${STATS.rotatedSliced} rotated pack boxes sliced), lights ${lights}, relief ${STATS.reliefMin}..${STATS.reliefMax} m flattened (worst walkable ground ${STATS.walkableGroundMaxDev} m), grass cores ${Math.min(...audit.map((a) => a.perM2))}+ clumps/m2`);
});
