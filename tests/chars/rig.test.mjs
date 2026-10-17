// Node test for the glTF character rig: every clip name the code uses exists in the shipped file, and a rig character animates.
// GLTFLoader needs no DOM for a texture-less .glb (the model has no images), so no shim is required beyond the meshopt decoder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CLIP } from '../../src/characters/clips.js';
import { setRigAsset, rigStatus, createRigCharacter } from '../../src/characters/rig.js';
import { createCharacter } from '../../src/characters/char.js';

const file = new URL('../../public/models/characters/robot.glb', import.meta.url);
const buf = fs.readFileSync(file);
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');

test('a character made before the model loads is swapped to the rig in place', () => {
  assert.equal(rigStatus(), 'idle');
  const ch = createCharacter({ color: 0x00ff00, hat: 'cap', seeker: true });
  const root = ch.root; assert.equal(ch.kind, 'procedural');
  ch.setTint(0xff0000, 0.5); ch.play('tagged');
  assert.equal(setRigAsset(gltf), true);
  assert.equal(ch.kind, 'rig'); assert.equal(ch.root, root);
  assert.ok(root.children.length >= 1);
  ch.update(1 / 60, {}); ch.dispose();
});

test('every clip name used by the code exists in robot.glb', () => {
  const have = gltf.animations.map((a) => a.name);
  for (const [use, name] of Object.entries(CLIP)) assert.ok(have.includes(name), `clip '${name}' (${use}) missing; file has ${have.join(', ')}`);
});

test('the model is one skinned mesh (one draw call) with the tint mask attribute', () => {
  const meshes = []; gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 1);
  assert.ok(meshes[0].isSkinnedMesh);
  assert.ok(meshes[0].geometry.getAttribute('_mask') || meshes[0].geometry.getAttribute('aMask')); // renamed by setRigAsset
});

test('rig loads from the parsed file and characters animate without NaNs', () => {
  assert.equal(setRigAsset(gltf), true);
  assert.equal(rigStatus(), 'ready');
  const ch = createRigCharacter({ color: 0xff0000, hat: 'crown', outfit: 'stripes', seeker: true });
  assert.equal(ch.kind, 'rig');
  const inputs = [{ speed: 0 }, { speed: 1.5 }, { speed: 5 }, { crouch: true }, { airborne: true }, { aimPitch: 0.8 }, { speed: 3, lookYaw: 0.4 }];
  let minY = 1e9, maxY = -1e9; const body = ch.root.getObjectByName('Body');
  for (const i of inputs) for (let f = 0; f < 20; f++) { ch.update(1 / 60, i); minY = Math.min(minY, body.position.y); maxY = Math.max(maxY, body.position.y); }
  assert.ok(Number.isFinite(minY) && maxY - minY > 1e-4, 'Body height must follow the clips (jump arc, bob), not stay at rest');
  ch.play('taunt'); ch.play('hit'); for (let f = 0; f < 30; f++) ch.update(1 / 60, {});
  ch.play('tagged'); for (let f = 0; f < 80; f++) ch.update(1 / 60, {});
  ch.play('victory'); for (let f = 0; f < 30; f++) ch.update(1 / 60, {});
  ch.play('reset'); ch.setTint(0x00ff00, 0.9); ch.setSeeker(false);
  ch.root.updateMatrixWorld(true);
  ch.root.traverse((o) => { if (o.isBone) for (const x of o.matrix.elements) assert.ok(Number.isFinite(x), `bone ${o.name} has a non-finite matrix`); });
  ch.dispose();
});

test('a failed load reports failed (the caller then keeps the procedural character)', () => {
  assert.equal(setRigAsset(null), false);
  assert.equal(rigStatus(), 'failed');
  assert.ok(THREE.REVISION);
});
