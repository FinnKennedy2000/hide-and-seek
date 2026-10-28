// Coldwood layout metrics (docs/PLAN-polish.md "Map"): cross-map travel time at walk 3.9 / sprint 6.8 m/s, relic spacing, spawn-to-relic distance,
// plus the design rules (two gate approaches, no snag colliders, hiders start away from the seeker and the objectives). Prints the numbers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld, MAPS } from '../../src/shared/worlddata.js';
import { createNav } from '../../src/shared/nav.js';

const WALK = 3.9, SPRINT = 6.8, map = MAPS.coldwood, t = map.trial, { colliders } = buildWorld(undefined, 'coldwood');
const nav = createNav(colliders); nav.buildNav();
const len = (a, b, nv = nav) => { const p = [{ x: a[0], z: a[1] }, ...nv.findPath(a[0], a[1], b[0], b[1])]; let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); return d; };
const straight = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const S = [t.seekerStart.x, t.seekerStart.z], stats = (xs) => ({ min: Math.min(...xs), avg: xs.reduce((s, v) => s + v, 0) / xs.length, max: Math.max(...xs) });
const f = (v) => v.toFixed(1);

test('coldwood: travel times, relic spacing, spawn distances (printed)', () => {
  const pair = []; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) pair.push(len(t.relics[i], t.relics[j]));
  const nn = t.relics.map((r, i) => Math.min(...t.relics.filter((_, j) => j !== i).map((q) => len(r, q))));
  const far = Math.max(...pair), gates = len(t.gates[0], t.gates[1]);
  const sp2rel = t.hiderSpawns.map((s) => Math.min(...t.relics.map((r) => straight(s, r))));
  const sp2seek = t.hiderSpawns.map((s) => len(S, s));
  const seek2rel = t.relics.map((r) => len(S, r));
  const out = {
    'gate A -> gate B path (m)': f(gates), 'gate A -> gate B walk/sprint (s)': `${f(gates / WALK)} / ${f(gates / SPRINT)}`,
    'farthest relic pair path (m)': f(far), 'farthest relic pair walk/sprint (s)': `${f(far / WALK)} / ${f(far / SPRINT)}`,
    'relic pair path min/avg/max (m)': Object.values(stats(pair)).map(f).join(' / '), 'relic nearest-neighbour path min/avg/max (m)': Object.values(stats(nn)).map(f).join(' / '),
    'spawn -> nearest relic straight min/avg (m)': `${f(stats(sp2rel).min)} / ${f(stats(sp2rel).avg)}`, 'seeker start -> spawn path min/avg (m)': `${f(stats(sp2seek).min)} / ${f(stats(sp2seek).avg)}`,
    'seeker start -> relic path min/avg/max (m)': Object.values(stats(seek2rel)).map(f).join(' / '), 'seeker start -> relic walk avg (s)': f(stats(seek2rel).avg / WALK),
  };
  console.log(`coldwood metrics\n${Object.entries(out).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`);
  assert.ok(gates >= 70 && gates / SPRINT >= 10 && gates / WALK <= 40, `gates ${gates}`);
  assert.ok(stats(nn).min >= 14 && stats(nn).max <= 32, 'relics evenly spaced (nearest neighbour 14-32 m path)');
  assert.ok(stats(sp2rel).min >= 8, 'no hider spawns next to a relic');
  assert.ok(stats(sp2seek).min >= 40, 'seeker starts far from every hider spawn');
});

test('coldwood: both gates have two approaches (blocking the shortest route midpoint leaves a detour)', () => {
  for (const g of t.gates) for (const from of [S, [0, 10], [-21, 15.5], [24, -20]]) {
    const p = [{ x: from[0], z: from[1] }, ...nav.findPath(from[0], from[1], g[0], g[1])], base = len(from, g);
    if (base < 20) continue;
    let d = 0, mid = p[0]; for (let i = 1; i < p.length; i++) { const l = Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z); if (d + l >= base * 0.6) { const k = (base * 0.6 - d) / l; mid = { x: p[i - 1].x + (p[i].x - p[i - 1].x) * k, z: p[i - 1].z + (p[i].z - p[i - 1].z) * k }; break; } d += l; }
    if (Math.hypot(mid.x - g[0], mid.z - g[1]) < 6) continue;
    const cs = [...colliders, { x0: mid.x - 2.5, x1: mid.x + 2.5, z0: mid.z - 2.5, z1: mid.z + 2.5, y0: 0, y1: 2 }], nv = createNav(cs); nv.buildNav();
    const alt = nv.reachableFrom(from[0], from[1])(g[0], g[1]), altLen = alt ? len(from, g, nv) : Infinity;
    assert.ok(alt && altLen < base * 2.2, `gate ${g} from ${from}: detour ${f(altLen)} vs ${f(base)}`);
  }
});

test('coldwood: no snag colliders, vault count, light budget, grass coverage', () => {
  const tiny = colliders.filter((c) => Math.max(c.x1 - c.x0, c.z1 - c.z0) < 0.4 || Math.min(c.x1 - c.x0, c.z1 - c.z0) < 0.1);
  assert.deepEqual(tiny, []);
  assert.ok(t.vaults.length >= 8, `vaults ${t.vaults.length}`);
  let lights = 0; buildWorld({ light: () => lights++ }, 'coldwood');
  assert.ok(lights <= 14, `lights ${lights}`);
  const area = t.grass.reduce((s, g) => s + (g.x1 - g.x0) * (g.z1 - g.z0), 0);
  console.log(`  vaults ${t.vaults.length}, lights ${lights}, grass ${f(area)} m2 in ${t.grass.length} rects, colliders ${colliders.length}`);
});
