// Static-geometry helpers: the draw-call reducers Agents W and M use for anything that never moves.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// BVH-accelerated raycasts: only meshes that called geometry.computeBoundsTree() change behaviour (the rest fall back to three's own).
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const _m = new THREE.Matrix4();
const isStatic = (o) => o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material);

// Same attribute layout for every piece so they can merge: non-indexed position / normal / uv only.
export function bake(mesh, rootInv) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  mesh.updateWorldMatrix(true, false);
  g.applyMatrix4(rootInv ? _m.multiplyMatrices(rootInv, mesh.matrixWorld) : mesh.matrixWorld);
  return g;
}

// Merge every static mesh under `group` into one mesh per (material, castShadow, receiveShadow); everything else is left alone.
// Positions are baked into the group's space, so the group itself can still be moved. Returns the same group.
export function mergeByMaterial(group) {
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map(), old = [];
  group.traverse((o) => {
    if (o === group || !isStatic(o) || !o.visible) return;
    const k = `${o.material.uuid}|${+o.castShadow}|${+o.receiveShadow}`;
    let b = buckets.get(k); if (!b) buckets.set(k, (b = { material: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] }));
    b.geos.push(bake(o, inv)); old.push(o);
  });
  for (const o of old) { o.removeFromParent(); o.geometry.dispose?.(); }
  for (const b of buckets.values()) {
    const g = mergeGeometries(b.geos); b.geos.forEach((x) => x.dispose());
    if (!g) continue;
    const m = new THREE.Mesh(g, b.material); m.castShadow = b.cast; m.receiveShadow = b.recv; m.matrixAutoUpdate = false; m.userData.merged = true;
    group.add(m);
  }
  return group;
}

// Replace meshes that share one geometry AND one material (at least `min` of them) with a single InstancedMesh.
// inst.userData.sources[i] is the userData of the mesh that became instance i. Returns the same group.
export function instanceStatic(group, { min = 4 } = {}) {
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((o) => {
    if (o === group || !isStatic(o) || !o.visible) return;
    const k = `${o.geometry.uuid}|${o.material.uuid}|${+o.castShadow}|${+o.receiveShadow}`;
    let b = buckets.get(k); if (!b) buckets.set(k, (b = []));
    b.push(o);
  });
  for (const list of buckets.values()) {
    if (list.length < min) continue;
    const { geometry, material, castShadow, receiveShadow } = list[0];
    const inst = new THREE.InstancedMesh(geometry, material, list.length);
    list.forEach((o, i) => { o.updateWorldMatrix(true, false); inst.setMatrixAt(i, _m.multiplyMatrices(inv, o.matrixWorld)); o.removeFromParent(); });
    inst.castShadow = castShadow; inst.receiveShadow = receiveShadow; inst.userData.sources = list.map((o) => o.userData);
    inst.instanceMatrix.needsUpdate = true; inst.computeBoundingSphere();
    group.add(inst);
  }
  return group;
}

// Distance LOD: perf.lod(near, [{ dist, obj }, ...]) -> THREE.LOD showing `near` up to the first dist, then each obj from its dist on.
// (THREE.LOD updates itself in onBeforeRender, no per-frame call needed.) With no levels it returns `near` unchanged.
export function lod(object, levels = []) {
  if (!levels.length) return object;
  const l = new THREE.LOD();
  l.addLevel(object, 0);
  for (const v of [...levels].sort((a, b) => (a.dist ?? a.distance) - (b.dist ?? b.distance))) l.addLevel(v.obj ?? v.object, v.dist ?? v.distance);
  return l;
}

// Run fn at most `hz` times per second from a per-frame call: const tick = every(10, fn); tick(dt).
export function every(hz, fn) {
  let acc = 0; const step = 1 / hz;
  return (dt) => { acc += dt; if (acc < step) return; const d = acc; acc %= step; fn(d); };
}

// Raycasts on a merged mesh report the prop that owns the hit triangle: `object` becomes a cached proxy that inherits everything
// (material, matrixWorld, geometry) from the mesh and carries userData.propId. starts[i] = first triangle of ids[i] (ascending).
export function propRaycast(m, starts, ids) {
  const proxies = new Map();
  const proxyFor = (id) => { let p = proxies.get(id); if (!p) { p = Object.create(m); p.userData = { propId: id }; proxies.set(id, p); } return p; };
  m.raycast = function (rc, hits) {
    const n = hits.length; acceleratedRaycast.call(this, rc, hits);
    for (let i = n; i < hits.length; i++) {
      let lo = 0, hi = starts.length - 1; const f = hits[i].faceIndex ?? 0;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= f) lo = mid; else hi = mid - 1; }
      hits[i].object = proxyFor(ids[lo]);
    }
  };
}

// Static batching for an authored GLB (the Coldwood estate: the pack splits props into 44 m chunks, and most chunk meshes are a few hundred
// triangles with one or two instances, over half of its 617 draw calls, each one more per shadow cascade). Every mesh `skip` leaves alone
// with at most BATCH_MAX_TRIS triangles once its instances are expanded is baked into world space and merged per (top-level group, material,
// attribute layout, solid(o), 66 m cell); bigger repeated meshes (trees) stay instanced. Same triangles and materials: it looks identical
// (mirrored instances flip winding, fine for the estate's double-sided materials). Merged solids get userData.solid.
const CELL = 66, BATCH_MAX_TRIS = 2000; // 2000: 313 of the 381 candidate draws, only 96k triangles; heavier meshes keep their per-chunk culling
const toFloat = (g) => { // GLB attributes are quantized (KHR_mesh_quantization): float copies, so the node matrix can be baked in
  const o = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(g.attributes)) {
    const n = a.itemSize, f = new Float32Array(a.count * n), get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < n; c++) f[i * n + c] = get[c].call(a, i);
    o.setAttribute(k, new THREE.BufferAttribute(f, n));
  }
  if (g.index) o.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
  return o;
};
// batchStatic(root, skip(o), solid(o), keep) -> { from, to }: draw calls before / after. Used by src/world/mapglb.js.
// keep (A/B measurements only): hide the sources instead of removing them; the result then carries { sources, batches }.
export function batchStatic(root, skip, solid = () => false, keep = false) {
  root.updateMatrixWorld(true);
  const buckets = new Map(), gone = [], m = new THREE.Matrix4(), mi = new THREE.Matrix4(), c = new THREE.Vector3();
  let draws = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || Array.isArray(o.material) || skip(o)) return;
    const g = o.geometry, n = o.isInstancedMesh ? o.count : 1, t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (t * n > BATCH_MAX_TRIS || Object.keys(g.morphAttributes).length) return;
    let top = o; while (top.parent && top.parent !== root) top = top.parent;
    const base = toFloat(g), sig = Object.keys(base.attributes).sort().join() + (base.index ? '|i' : '');
    for (let i = 0; i < n; i++) {
      m.copy(o.matrixWorld); if (o.isInstancedMesh) m.multiply((o.getMatrixAt(i, mi), mi));
      const b = base.clone().applyMatrix4(m); b.computeBoundingBox(); b.boundingBox.getCenter(c);
      const sol = solid(o), k = `${top.uuid}|${o.material.uuid}|${sig}|${sol}|${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`;
      let e = buckets.get(k); if (!e) buckets.set(k, (e = { top, mat: o.material, sol, geos: [] }));
      e.geos.push(b);
    }
    base.dispose(); gone.push(o); draws++;
  });
  for (const o of gone) if (keep) o.visible = false; else o.removeFromParent();
  const batches = [];
  for (const { top, mat, sol, geos } of buckets.values()) {
    const g = mergeGeometries(geos); geos.forEach((x) => x.dispose());
    g.applyMatrix4(m.copy(top.matrixWorld).invert());
    const b = new THREE.Mesh(g, mat); b.name = 'batch'; b.userData.solid = sol; b.matrixAutoUpdate = false; top.add(b); batches.push(b);
  }
  return keep ? { from: draws, to: buckets.size, sources: gone, batches } : { from: draws, to: buckets.size };
}

// Frame-interval summary for the benchmark (src/perf/bench.js): ms[] -> mean / p50 / p95 / p99 / max, fps from the mean, hitch counts.
export function summarize(ms) {
  const a = [...ms].sort((x, y) => x - y), n = a.length, r1 = (x) => Math.round(x * 10) / 10;
  if (!n) return { n: 0 };
  const q = (p) => a[Math.min(n - 1, Math.floor(n * p))], mean = a.reduce((s, x) => s + x, 0) / n;
  return { n, mean: r1(mean), p50: r1(q(0.5)), p95: r1(q(0.95)), p99: r1(q(0.99)), max: r1(a[n - 1]), fps: r1(1000 / mean), over33: a.filter((x) => x > 33.4).length, over50: a.filter((x) => x > 50).length };
}
