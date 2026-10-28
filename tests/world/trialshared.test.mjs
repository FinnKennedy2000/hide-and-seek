import test from 'node:test';
import assert from 'node:assert/strict';
import { validRect, validVault, keepValid, guarded } from '../../src/shared/trial.js';

test('validRect rejects malformed grass rects', () => {
  assert.ok(validRect({ x0: 0, x1: 1, z0: 0, z1: 1 }));
  for (const g of [null, {}, { x0: 1, x1: 0, z0: 0, z1: 1 }, { x0: 0, x1: 1, z0: 2, z1: 2 }, { x0: 0, x1: NaN, z0: 0, z1: 1 }, { x0: '0', x1: 1, z0: 0, z1: 1 }]) assert.equal(validRect(g), false);
});
test('validVault and keepValid', () => {
  assert.ok(validVault({ x: 1, z: 2, ax: 'x', w: 1.8 })); assert.ok(validVault({ x: 1, z: 2 }));
  assert.equal(validVault({ x: 1, z: NaN, ax: 'x' }), false); assert.equal(validVault({ x: 1, z: 2, ax: 'q' }), false); assert.equal(validVault({ x: 1, z: 2, w: 'a' }), false);
  const bad = []; const kept = keepValid([{ x0: 0, x1: 1, z0: 0, z1: 1 }, { x0: 5 }], validRect, (g, i) => bad.push(i));
  assert.equal(kept.length, 1); assert.deepEqual(bad, [1]); assert.deepEqual(keepValid(undefined, validRect), []);
});
test('guarded logs throws and disables the hook after max', () => {
  const orig = console.error; let logs = 0; console.error = () => { logs++; };
  try {
    let calls = 0; const f = guarded('t', 3)(() => { calls++; throw new Error('x'); });
    for (let i = 0; i < 10; i++) f();
    assert.equal(calls, 3); assert.equal(logs, 3);
    assert.equal(guarded('t')((a) => a + 1)(1), 2);
  } finally { console.error = orig; }
});
