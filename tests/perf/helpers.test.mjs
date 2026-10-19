import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeByMaterial, instanceStatic, lod, every, propRaycast } from '../../src/perf/helpers.js';

const box = (mat, x, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat); m.position.set(x, y, z); return m; };
const meshes = (g) => { const a = []; g.traverse((o) => o.isMesh && a.push(o)); return a; };

test('mergeByMaterial: N meshes of 2 materials -> 2 meshes, same bounds, group transform kept', () => {
  const a = new THREE.MeshBasicMaterial(), b = new THREE.MeshBasicMaterial(), g = new THREE.Group();
  g.position.set(10, 0, 0);
  for (let i = 0; i < 6; i++) g.add(box(i % 2 ? a : b, i * 2));
  mergeByMaterial(g);
  assert.equal(meshes(g).length, 2);
  const bb = new THREE.Box3().setFromObject(g);
  assert.ok(Math.abs(bb.min.x - 9.5) < 1e-6 && Math.abs(bb.max.x - 20.5) < 1e-6, JSON.stringify(bb));
});

test('instanceStatic: repeated geometry+material -> one InstancedMesh with the right matrices', () => {
  const geo = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshBasicMaterial(), g = new THREE.Group();
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(geo, mat); m.position.set(i * 3, 1, 0); m.userData.id = i; g.add(m); }
  g.add(box(mat, 50)); // different geometry: stays
  instanceStatic(g, { min: 4 });
  const inst = g.children.filter((o) => o.isInstancedMesh);
  assert.equal(inst.length, 1); assert.equal(inst[0].count, 5); assert.equal(g.children.length, 2);
  const m4 = new THREE.Matrix4(); inst[0].getMatrixAt(3, m4);
  assert.equal(new THREE.Vector3().setFromMatrixPosition(m4).x, 9);
  assert.equal(inst[0].userData.sources[3].id, 3);
});

test('lod: levels sorted, no levels returns the object', () => {
  const near = new THREE.Object3D(), far = new THREE.Object3D(), far2 = new THREE.Object3D();
  assert.equal(lod(near, []), near);
  const l = lod(near, [{ dist: 40, obj: far2 }, { dist: 10, obj: far }]);
  assert.ok(l.isLOD); assert.deepEqual(l.levels.map((x) => x.distance), [0, 10, 40]);
});

test('every: fires at the given rate', () => {
  let n = 0; const t = every(10, () => n++);
  for (let i = 0; i < 60; i++) t(1 / 60);
  assert.ok(n >= 9 && n <= 11, `n=${n}`);
});

test('propRaycast: a hit on a merged mesh reports the owning prop via a proxy that keeps the material', () => {
  const mat = new THREE.MeshBasicMaterial({ color: 0x123456 });
  const g1 = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), g2 = new THREE.BoxGeometry(1, 1, 1).toNonIndexed(); g2.translate(5, 0, 0);
  const merged = mergeGeometriesLocal([g1, g2]); merged.computeBoundsTree();
  const mesh = new THREE.Mesh(merged, mat);
  propRaycast(mesh, [0, g1.attributes.position.count / 3], [7, 9]);
  const rc = new THREE.Raycaster(new THREE.Vector3(5.1, 0.2, 10), new THREE.Vector3(0, 0, -1));
  const hit = rc.intersectObjects([mesh], false)[0];
  assert.equal(hit.object.userData.propId, 9); assert.equal(hit.object.material.color.getHex(), 0x123456);
  rc.set(new THREE.Vector3(0.1, 0.2, 10), new THREE.Vector3(0, 0, -1));
  assert.equal(rc.intersectObjects([mesh], false)[0].object.userData.propId, 7);
  assert.equal(rc.intersectObjects([mesh], false).length, 1); // front face only
});

import { mergeGeometries as mergeGeometriesLocal } from 'three/addons/utils/BufferGeometryUtils.js';
