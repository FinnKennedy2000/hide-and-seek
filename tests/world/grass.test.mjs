// The hiding grass is a gameplay mechanic: no quality preset may thin, shorten or cull it, and it must reach past the server's concealment range.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grassSpec, planClumps, edgeDist, CONCEAL_RANGE, NEAR_FADE, HEIGHT } from '../../src/world/grassplan.js';
import { TIERS } from '../../src/perf/budget.js';
import { MAPS } from '../../src/shared/worlddata.js';

const base = grassSpec('high');
test('every preset keeps the same gameplay grass', () => {
  assert.deepEqual(TIERS, ['potato', 'low', 'med', 'high', 'ultra']);
  for (const t of TIERS) {
    const s = grassSpec(t);
    assert.deepEqual(s, base, `${t} changed the grass`);
    assert.ok(s.drawRange >= CONCEAL_RANGE, `${t} draw range`);
    assert.ok(s.heightMin >= 1.3 && s.heightMax <= 1.8 && s.clumpsPerM2 >= 5, `${t} density/height`);
    assert.ok(s.nearFade <= 0.6 && NEAR_FADE <= 0.6);
  }
});
for (const [id, map] of Object.entries(MAPS)) {
  if (!map.trial?.grass || map.meta.glb) continue; // (a GLB map draws its own authored grass: tests/world/coldwood.test.mjs audits it)
  test(`${id}: clumps stay in the rects, interior is dense, edges thin`, () => {
    const rects = map.trial.grass, cl = planClumps(rects, base), area = rects.reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
    assert.ok(cl.length > area * base.clumpsPerM2 * 0.7, 'too sparse');
    for (const c of cl) assert.ok(rects.some((r) => edgeDist(r, c.x, c.z) >= 0), 'clump outside rects');
    const rc = rects[0], inner = cl.filter((c) => edgeDist(rc, c.x, c.z) >= 2 && edgeDist(rc, c.x, c.z) >= 0), rim = cl.filter((c) => { const e = edgeDist(rc, c.x, c.z); return e >= 0 && e < 0.5; });
    const dens = (n, a) => n / a, w = rc.x1 - rc.x0, d = rc.z1 - rc.z0;
    assert.ok(dens(rim.length, w * d - (w - 1) * (d - 1)) < dens(inner.length, (w - 4) * (d - 4)) * 0.7, 'edges should be thinner');
    assert.ok(Math.max(...inner.map((c) => c.sy)) * 1.65 <= HEIGHT.max + 1e-6);
  });
}
