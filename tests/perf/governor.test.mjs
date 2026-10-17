import test from 'node:test';
import assert from 'node:assert/strict';
import { Governor } from '../../src/perf/governor.js';
import { pickTier, benchTier } from '../../src/perf/tier.js';
import { budget } from '../../src/perf/budget.js';

const feed = (g, ms, seconds) => { for (let t = 0; t < seconds * 1000; t += ms) g.frame(ms); };

test('governor: 3 s of 25 ms frames drops the scale to <= 0.8', () => {
  const g = new Governor({ tier: 'high' });
  feed(g, 25, 3);
  assert.ok(g.scale <= 0.8 + 1e-9, `scale ${g.scale}`);
});

test('governor: 10 s of 10 ms frames climbs back', () => {
  const g = new Governor({ tier: 'high' });
  feed(g, 25, 3); const low = g.scale;
  feed(g, 10, 10);
  assert.ok(g.scale > low, `scale ${g.scale} vs ${low}`);
});

test('governor: scale floor is 0.5 and never exceeds the tier scale', () => {
  const g = new Governor({ tier: 'low', minTier: 'low', maxTier: 'low' });
  feed(g, 40, 30); assert.equal(g.scale, 0.5);
  feed(g, 8, 60); assert.ok(g.scale <= budget.low.scale + 1e-9);
});

test('governor: at most one tier change per 5 s, whatever the load', () => {
  const changes = [];
  const g = new Governor({ tier: 'high', onTier: (t) => changes.push([g.t, t]) });
  for (let i = 0; i < 6; i++) { feed(g, 40, 20); feed(g, 6, 40); } // violent swings
  for (let i = 1; i < changes.length; i++) assert.ok(changes[i][0] - changes[i - 1][0] >= 5000, `changes ${JSON.stringify(changes)}`);
  assert.ok(changes.length > 0);
});

test('governor: 13-18 ms is a dead band (no change)', () => {
  const g = new Governor({ tier: 'med' }); feed(g, 15, 60);
  assert.equal(g.scale, 1); assert.equal(g.tier, 'med');
});

test('governor: a failed step up is not retried at once (ceiling)', () => {
  const g = new Governor({ tier: 'high', minTier: 'high', maxTier: 'high' });
  feed(g, 25, 2);              // 1.0 -> 0.8
  feed(g, 10, 5);              // up to 0.9
  assert.equal(g.scale, 0.9);
  feed(g, 25, 1);              // 0.9 fails -> back to 0.8, ceiling 0.8
  assert.equal(g.scale, 0.8);
  feed(g, 10, 20);
  assert.equal(g.scale, 0.8);
});

test('tier detection', () => {
  assert.equal(pickTier('Intel(R) Graphics'), 'low');
  assert.equal(pickTier('ANGLE (Intel, Intel(R) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(pickTier('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)'), 'low');
  assert.equal(pickTier('Intel(R) Iris(R) Xe Graphics'), 'low');
  assert.equal(pickTier('NVIDIA GeForce RTX 3060'), 'high');
  assert.equal(pickTier('NVIDIA GeForce RTX 4080'), 'ultra');
  assert.equal(pickTier('Intel(R) Arc(TM) A770 Graphics'), 'med');
  assert.equal(pickTier('Google SwiftShader'), 'potato');
  assert.equal(pickTier('Some Future GPU 9000'), 'med');
  assert.equal(pickTier(''), 'med');
  assert.equal(pickTier('NVIDIA GeForce RTX 3060', { memGB: 2 }), 'low');
});

test('benchmark verdict moves one tier', () => {
  assert.equal(benchTier('low', 6), 'med');
  assert.equal(benchTier('low', 15), 'low');
  assert.equal(benchTier('low', 40), 'potato');
  assert.equal(benchTier('potato', 40), 'potato');
});

test('governor: a tier we stepped up into and could not hold is not retried', () => {
  const g = new Governor({ tier: 'low' });
  g.setTier('med'); assert.equal(g.tier, 'med');   // e.g. the boot benchmark
  feed(g, 40, 9);                                   // cannot hold it: scale to the floor, then back down a tier
  assert.equal(g.tier, 'low');
  feed(g, 6, 120);                                  // plenty of headroom afterwards
  assert.equal(g.tier, 'low');
});
