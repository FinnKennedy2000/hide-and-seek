import test from 'node:test';
import assert from 'node:assert/strict';
import { makeZones, zoneAt, AUTO_MIN_TRIS } from '../../src/perf/zones.js';

const meta = { bounds: { x0: -20, x1: 20, z0: -20, z1: 20 }, zones: [
  { id: 'hall', box: [-5, -5, 5, 5] }, { id: 'kitchen', box: [5, -5, 15, 5] }, { id: 'garden', box: [-20, 5, 20, 20] }, { id: 'attic', box: [-20, -20, -10, -10], sees: [] },
] };

test('declared zones: touching rooms see each other, far ones do not, explicit sees wins', () => {
  const z = makeZones(meta);
  assert.equal(z.length, 4);
  const hall = z[0].vis, kitchen = z[1].vis;
  assert.ok(hall.has(0) && hall.has(1) && hall.has(2), 'hall sees itself, kitchen (shared wall) and garden (touching)');
  assert.ok(!hall.has(3), 'hall does not see the attic');
  assert.ok(kitchen.has(0) && kitchen.has(2));
  assert.deepEqual([...z[3].vis], [3], 'attic sees: [] -> itself only');
});

test('zoneAt', () => {
  const z = makeZones(meta);
  assert.equal(zoneAt(z, 0, 0), 0); assert.equal(zoneAt(z, 10, 0), 1); assert.equal(zoneAt(z, 0, 10), 2); assert.equal(zoneAt(z, 100, 100), -1);
});

test('no zones: small map -> no zones, heavy map -> 16 m grid', () => {
  const m = { bounds: meta.bounds };
  assert.deepEqual(makeZones(m, 1000), []);
  const g = makeZones(m, AUTO_MIN_TRIS + 1);
  assert.equal(g.length, 9); // 40 m / 16 m -> 3 x 3
  assert.ok(g[4].vis.size === 9 && g[0].vis.size === 4);
});
