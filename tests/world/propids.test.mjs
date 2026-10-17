// Prop ids are append-only: the (id, name) of every prop that existed on main (fixtures/propids.json) must not move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWorld } from '../../src/shared/worlddata.js';

const snap = JSON.parse(readFileSync(new URL('../fixtures/propids.json', import.meta.url), 'utf8'));
for (const [id, list] of Object.entries(snap)) {
  test(`${id}: first ${list.length} prop ids and names unchanged`, () => {
    const got = buildWorld(undefined, id).props.slice(0, list.length).map((p) => [p.id, p.name]);
    assert.deepEqual(got, list);
  });
}
