// Every kind audio.play() accepts must map to a visual cue (glyph + caption), and every sample it names must ship in public/audio.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { KINDS, files } from '../../src/audio/kinds.js';

globalThis.localStorage ??= { getItem: () => null, setItem() {} };
const { CUE } = await import('../../src/ui/hud.js');

test('no silent kinds: each kind has a cue glyph, caption and colour', () => {
  for (const [kind, def] of Object.entries(KINDS)) {
    const c = CUE[def.cue];
    assert.ok(c, `kind '${kind}' maps to unknown cue '${def.cue}'`);
    assert.ok(c[0] && c[1] && c[2], `cue '${def.cue}' needs caption, colour, glyph`);
    assert.ok(def.vol > 0, `${kind} needs a default vol`);
  }
});
test('every sample file exists and total audio is under 3 MB', () => {
  let total = 0;
  const surf = ['wood', 'tile', 'grass', 'concrete'].flatMap((s) => files(`step_${s}`, 3));
  for (const k of Object.values(KINDS)) if (k.s && !k.s.includes('*')) surf.push(...files(k.s, k.n));
  for (const f of surf) { const p = `public${f.url}`; assert.ok(fs.existsSync(p), `missing ${p}`); total += fs.statSync(p).size; }
  assert.ok(total < 3 * 1024 * 1024, `audio is ${total} bytes`);
});

test('parseSound validates network sound events (vol clamped, x/y/z must be finite)', async () => {
  const { parseSound } = await import('../../src/audio/kinds.js');
  const ok = { kind: 'shot', x: 1, y: 1, z: 2, vol: 5 };
  assert.equal(parseSound(ok).vol, 1, 'vol clamped to 1');
  assert.equal(parseSound({ ...ok, vol: -3 }).vol, 0, 'vol clamped to 0');
  assert.equal(parseSound({ ...ok, vol: undefined }).vol, KINDS.shot.vol, 'missing vol = kind default');
  for (const bad of [{ y: NaN }, { y: undefined }, { x: Infinity }, { z: 'a' }, { vol: NaN }, { kind: 'nope' }]) assert.equal(parseSound({ ...ok, ...bad }), null, JSON.stringify(bad));
  assert.equal(parseSound(null), null);
});
