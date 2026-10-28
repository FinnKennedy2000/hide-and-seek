// Trial-mode map contract (docs/PLAN-trial.md): every map that exports `trial` must have its objectives reachable on foot from seekerStart,
// relics spread out, gates far apart, vault walls 1.2 m tall with free floor on both sides, grass rectangles inside the bounds.
// A map whose relics sit on authored stations (`trial.scenery`: the Coldwood estate) needs a free, reachable standing spot within 1.8 m of each.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld, MAPS } from '../../src/shared/worlddata.js';
import { createNav } from '../../src/shared/nav.js';

const R = 0.3;
const hits = (cs, x, z, m) => cs.some((c) => x > c.x0 - m && x < c.x1 + m && z > c.z0 - m && z < c.z1 + m && c.y0 < 1.7 && c.y1 > 0.2);
for (const [id, map] of Object.entries(MAPS)) {
  if (!map.trial) continue;
  const t = map.trial, { colliders } = buildWorld(undefined, id), nav = createNav(colliders, map.meta.bounds); nav.buildNav();
  const reach = nav.reachableFrom(t.seekerStart.x, t.seekerStart.z), b = map.meta.bounds;
  const pts = { relic: t.relics, gate: t.gates, cage: t.cages, spawn: t.hiderSpawns };
  test(`${id}: counts`, () => { assert.equal(t.relics.length, 8); assert.equal(t.gates.length, 2); assert.ok(t.cages.length >= 4 && t.hiderSpawns.length >= 8 && t.vaults.length >= 4); });
  test(`${id}: relics, gates, cages, spawns reachable and clear of colliders`, () => {
    const bad = [];
    for (const [k, list] of Object.entries(pts)) for (const [x, z] of list) {
      if (k === 'relic' && t.scenery) { // on a station: some spot on a ring 1.2-1.8 m out must be free and reachable
        const ok = [1.2, 1.5, 1.8].some((r) => [...Array(16).keys()].some((a) => { const px = x + r * Math.cos(a * Math.PI / 8), pz = z + r * Math.sin(a * Math.PI / 8); return !hits(colliders, px, pz, R) && reach(px, pz); }));
        if (!ok) bad.push(`${k} ${x},${z} has no free reachable spot within 1.8 m`);
      } else {
        if (!reach(x, z)) bad.push(`${k} ${x},${z} unreachable`);
        if (k !== 'cage' && hits(colliders, x, z, R)) bad.push(`${k} ${x},${z} inside a collider`);
      }
      if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) bad.push(`${k} ${x},${z} out of bounds`);
    }
    assert.deepEqual(bad, []);
  });
  test(`${id}: relics >= 14 m apart, gates far apart`, () => {
    for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) assert.ok(Math.hypot(t.relics[i][0] - t.relics[j][0], t.relics[i][1] - t.relics[j][1]) >= 14, `relic ${i}-${j}`);
    assert.ok(Math.hypot(t.gates[0][0] - t.gates[1][0], t.gates[0][1] - t.gates[1][1]) > 40);
  });
  test(`${id}: vaults are 1.2 m, 0.3-0.35 m thick walls with free floor on both sides`, () => {
    for (const v of t.vaults) {
      const w = colliders.find((c) => v.x > c.x0 && v.x < c.x1 && v.z > c.z0 && v.z < c.z1 && Math.abs(c.y0) < 0.011 && Math.abs(c.y1 - 1.2) < 1e-6);
      assert.ok(w, `vault ${v.x},${v.z} has a 1.2 m wall`);
      const thin = v.ax === 'x' ? w.z1 - w.z0 : w.x1 - w.x0; assert.ok(thin > 0.3 - 1e-6 && thin < 0.35 + 1e-6, `vault ${v.x},${v.z} thickness ${thin}`);
      for (const s of [-1, 1]) for (const d of [0.9, 1.4]) {
        const x = v.ax === 'x' ? v.x : v.x + s * d, z = v.ax === 'x' ? v.z + s * d : v.z;
        assert.ok(!hits(colliders, x, z, R), `vault ${v.x},${v.z} side ${s} blocked at ${d}`);
        assert.ok(reach(x, z), `vault ${v.x},${v.z} side ${s} unreachable`);
      }
    }
  });
  test(`${id}: grass rectangles inside bounds`, () => { for (const g of t.grass) assert.ok(g.x0 >= b.x0 && g.x1 <= b.x1 && g.z0 >= b.z0 && g.z1 <= b.z1 && g.x0 < g.x1 && g.z0 < g.z1); });
}
