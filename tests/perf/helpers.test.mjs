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

test('summarize: percentiles, fps from the mean, hitch counts', async () => {
  const { summarize } = await import('../../src/perf/helpers.js');
  const ms = [...Array(98).fill(16), 40, 100];
  const s = summarize(ms);
  assert.equal(s.n, 100); assert.equal(s.p50, 16); assert.equal(s.p95, 16); assert.equal(s.p99, 100); assert.equal(s.max, 100);
  assert.equal(s.over33, 2); assert.equal(s.over50, 1);
  assert.equal(s.mean, 17.1); assert.equal(s.fps, 58.5);
  assert.deepEqual(summarize([]), { n: 0 });
});

test('batchStatic: small quantized / instanced meshes -> one world-space mesh per material and cell; big ones untouched', async () => {
  const { batchStatic } = await import('../../src/perf/helpers.js');
  const q = new THREE.BoxGeometry(1, 1, 1), pos = q.attributes.position; // int16-normalized positions, scaled back by the node (as KHR_mesh_quantization does)
  const qa = new THREE.BufferAttribute(new Int16Array(pos.count * 3), 3, true);
  for (let i = 0; i < pos.count; i++) qa.setXYZ(i, pos.getX(i), pos.getY(i), pos.getZ(i));
  q.setAttribute('position', qa);
  const mat = new THREE.MeshBasicMaterial(), other = new THREE.MeshBasicMaterial(), root = new THREE.Group(), top = new THREE.Group(); root.add(top);
  const a = new THREE.Mesh(q, mat); a.position.set(2, 0, 0); a.scale.setScalar(2); top.add(a);
  const im = new THREE.InstancedMesh(q, mat, 2); im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(5, 0, 0)); im.setMatrixAt(1, new THREE.Matrix4().makeTranslation(7, 0, 0)); top.add(im);
  const far = new THREE.Mesh(q, mat); far.position.set(100, 0, 0); top.add(far); // another 66 m cell
  const big = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), other); top.add(big); // > BATCH_MAX_TRIS: stays
  const kept = new THREE.Mesh(q, other); kept.name = 'keep'; top.add(kept);
  const r = batchStatic(root, (o) => o.name === 'keep');
  assert.deepEqual(r, { from: 3, to: 2 });
  const ms = meshes(root), batches = ms.filter((m) => m.name === 'batch');
  assert.equal(ms.length, 4); assert.ok(ms.includes(big) && ms.includes(kept));
  const near = batches.find((m) => { m.geometry.computeBoundingBox(); return m.geometry.boundingBox.max.x < 50; });
  assert.equal(near.geometry.index.count / 3, 12 * 3); // 3 boxes of 12 triangles
  const bb = near.geometry.boundingBox;
  assert.ok(Math.abs(bb.min.x - 1) < 1e-3 && Math.abs(bb.max.x - 7.5) < 1e-3 && Math.abs(bb.max.y - 1) < 1e-3, JSON.stringify(bb));
});
