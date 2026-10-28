// Node test for the procedural characters: crouch height, grounded non-sliding feet, state blends stay finite, class silhouettes,
// and nothing on a character glows. (Name kept: `npm run test:chars` points here.)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCharacter, HATS, OUTFITS, SEEKER_CLASSES, STAND_TOP, CROUCH_TOP } from '../../src/characters/character.js';

const box = (ch) => { ch.root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(ch.root, true); };
const run = (ch, n, o) => { for (let i = 0; i < n; i++) ch.update(1 / 60, o); };

test('standing is human height; crouching lowers the body to ~55% (hats and class gear included)', () => {
  for (const hat of HATS) for (const cls of [null, ...SEEKER_CLASSES]) {
    const ch = createCharacter({ color: 0x336699, hat, seeker: !!cls, cls });
    run(ch, 60, {}); const st = box(ch).max.y;
    run(ch, 60, { crouch: 1 }); const cr = box(ch).max.y;
    assert.ok(st > 1.6 && st < 2.1, `${hat}/${cls} stands ${st.toFixed(2)}`);
    assert.ok(cr / st < 0.66, `${hat}/${cls} crouch ratio ${(cr / st).toFixed(2)}`);
    assert.ok(Math.abs(ch.headTop() - cr) < 0.12, `headTop() ${ch.headTop().toFixed(2)} vs measured ${cr.toFixed(2)} (${hat}/${cls})`);
    assert.ok(box(ch).min.y > -0.04, `nothing sinks when crouched: ${hat}/${cls} ${box(ch).min.y}`);
    ch.dispose();
  }
  const plain = createCharacter({}); run(plain, 60, { crouch: 1 }); assert.ok(Math.abs(plain.headTop() - CROUCH_TOP) < 0.1 && STAND_TOP > CROUCH_TOP);
});

test('setCrouchHeight lowers the crouched head-top', () => {
  const ch = createCharacter({}); run(ch, 60, { crouch: 1 }); const a = box(ch).max.y;
  ch.setCrouchHeight(0.8); run(ch, 60, { crouch: 1 }); assert.ok(box(ch).max.y < a - 0.05);
});

test('planted feet do not slide: the stance foot moves back at the body speed', () => {
  for (const speed of [1.4, 5]) {
    const ch = createCharacter({}); run(ch, 120, { speed });
    const foot = ch.root.getObjectByName('footL'), p = new THREE.Vector3(), dt = 1 / 60, z = [], y = [];
    for (let i = 0; i < 120; i++) { ch.update(dt, { speed }); ch.root.updateMatrixWorld(true); foot.getWorldPosition(p); z.push(p.z); y.push(p.y); }
    // the character faces +Z in world (pivot turned PI), so a planted foot moves back: dz/dt = -speed
    let n = 0, err = 0;
    for (let i = 1; i < z.length; i++) if (y[i] < 0.03 && y[i - 1] < 0.03) { n++; err += Math.abs((z[i] - z[i - 1]) / dt + speed); }
    assert.ok(n > 15, `foot was planted for ${n} frames at ${speed} m/s`);
    assert.ok(err / n < 0.15 * speed + 0.1, `mean slide ${(err / n).toFixed(2)} m/s at ${speed} m/s`);
    ch.dispose();
  }
});

test('every pose and transition stays finite and above ground', () => {
  const ch = createCharacter({ hat: 'crown', outfit: 'overalls', seeker: true, cls: 'charger' });
  const inputs = [{}, { speed: 1.5 }, { speed: 5 }, { speed: 2, crouch: 0.5 }, { crouch: 1 }, { airborne: true }, { aimPitch: 0.8, lookYaw: 0.4 }];
  for (const name of ['reset', 'interact', 'vault', 'injured', 'caged', 'tagged', 'victory', 'reset']) {
    ch.play(name); ch.play('taunt'); ch.play('hit');
    for (const i of inputs) run(ch, 25, i);
    ch.root.updateMatrixWorld(true);
    ch.root.traverse((o) => { if (o.isBone) for (const x of o.matrix.elements) assert.ok(Number.isFinite(x), `${name}: bone ${o.name} not finite`); });
    if (name !== 'tagged') assert.ok(box(ch).min.y > -0.3, `${name} min y ${box(ch).min.y}`);
  }
  ch.dispose();
});

test('transitions are smooth: no frame-to-frame jump in head height beyond a crouch rate', () => {
  const ch = createCharacter({}); run(ch, 30, {}); let prev = ch.headTop(), worst = 0;
    for (const m of ['interact', 'vault', 'injured', 'caged']) { ch.play(m); for (let i = 0; i < 40; i++) { ch.update(1 / 60, {}); worst = Math.max(worst, Math.abs(ch.headTop() - prev)); prev = ch.headTop(); } }
  assert.ok(worst < 0.06, `largest per-frame head-height change ${worst.toFixed(3)} m`);
});

test('seeker classes are distinct silhouettes, one skinned mesh, and no character material glows', () => {
  const dims = SEEKER_CLASSES.map((cls) => { const ch = createCharacter({ seeker: true, cls }); run(ch, 5, {}); const b = box(ch), s = b.getSize(new THREE.Vector3()); ch.root.userData.c = ch; return [cls, s, ch]; });
  for (let i = 0; i < dims.length; i++) for (let j = i + 1; j < dims.length; j++) {
    const a = dims[i][1], b = dims[j][1];
    assert.ok(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) > 0.05, `${dims[i][0]} and ${dims[j][0]} look alike`);
  }
  for (const [, , ch] of dims) {
    const skinned = []; ch.root.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); if (o.isMesh && !o.isSkinnedMesh) assert.ok(o.material.isMeshBasicMaterial, 'only the lantern is a separate mesh'); });
    assert.equal(skinned.length, 1);
    assert.equal(skinned[0].material.emissiveIntensity, 1); assert.equal(skinned[0].material.emissive.getHex(), 0);
  }
  const hider = createCharacter({ hat: 'cap', outfit: 'stripes' }); let meshes = 0; hider.root.traverse((o) => { if (o.isMesh) meshes++; });
  assert.equal(meshes, 1, 'a hider is a single mesh, lantern-free'); assert.equal(HATS.length + OUTFITS.length, 9);
});

test('a tagged hider becomes a seeker in place and back', () => {
  const ch = createCharacter({}); run(ch, 3, {}); const root = ch.root, w = box(ch).getSize(new THREE.Vector3()).x;
  ch.setSeeker(true, 'phantom'); assert.equal(ch.root, root); ch.setSeeker(false); run(ch, 3, {});
  assert.ok(Math.abs(box(ch).getSize(new THREE.Vector3()).x - w) < 0.05);
});

test('the procedural character faces +Z (the game convention): the sprint lean puts the head ahead of the hips', () => {
  const ch = createCharacter({}); run(ch, 90, { speed: 6 }); ch.root.updateMatrixWorld(true);
  const p = new THREE.Vector3(), q = new THREE.Vector3(); ch.root.getObjectByName('head').getWorldPosition(p); ch.root.getObjectByName('hips').getWorldPosition(q);
  assert.ok(p.z - q.z > 0.05, `head z ${p.z.toFixed(2)} vs hips z ${q.z.toFixed(2)}`);
});

test('char.js adapter: before the GLB models load (Node: never) makeChar gives the procedural human, same root through setSeeker, setHeld is safe', async () => {
  const c = await import('../../src/characters/char.js');
  assert.equal(c.rigStatus(), 'loading');
  const root = c.makeChar(0x336699, { hat: 'cap' }), inner = root.ch.root;
  assert.equal(root.ch.kind, 'procedural'); assert.equal(root.userData.ownLod, false);
  c.setSeeker(root, true, 'trapper'); c.setHeld(root, false); c.setConcealed(root, true); c.setCrouchHeight(root, 0.9);
  assert.equal(root.ch.root, inner); c.animate(root, 1 / 60, { speed: 2, crouch: 1 }); assert.ok(c.headTop(root) > 0.7);
  c.playChar(root, 'caged'); c.animate(root, 1 / 60, {}); c.disposeChar(root);
});
