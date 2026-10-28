// Coldwood estate GLB pipeline: pack models/coldwood_farm_web.glb -> public/models/map/coldwood_estate.glb (web-deliverable).
// usage: GLTF_DEPS=<dir with @gltf-transform/{core,functions,extensions}@4.5.1, meshoptimizer, sharp in node_modules> \
//        node scripts/estate/glb.mjs <pack dir> [out.glb]
// (the repo does not depend on gltf-transform; install those into a scratch dir and point GLTF_DEPS at it)
// Steps: flatten (field.mjs: per-instance / per-node / per-vertex, the same field the colliders use), drop gameplay empties, simplify
// the repeated trees and heavy props (never the grass: it is the hiding cover), textures -> WebP <= 1024 px (base colour sRGB, normals as
// data, names kept), dedup / prune, meshopt compression (EXT_meshopt_compression + quantization; three's GLTFLoader decodes it with
// MeshoptDecoder, which core/assets.js already registers). Material names, alpha / double-sided flags and instancing are preserved.
import { createRequire } from 'node:module';
import { statSync, readFileSync, writeFileSync } from 'node:fs';
import { loadField } from './field.mjs';

const pack = process.argv[2], outFile = process.argv[3] || new URL('../../public/models/map/coldwood_estate.glb', import.meta.url).pathname;
const req = createRequire(`${process.env.GLTF_DEPS || process.cwd()}/`);
const imp = (m) => import(req.resolve(m));
const [{ NodeIO, getBounds }, { ALL_EXTENSIONS }, fn, { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier }, sharp] = await Promise.all(
  ['@gltf-transform/core', '@gltf-transform/extensions', '@gltf-transform/functions', 'meshoptimizer', 'sharp'].map(imp));
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const F = loadField(pack);
const src = `${pack}/models/coldwood_farm_web.glb`;
const doc = await io.read(src);
const root = doc.getRoot();
const tris = () => root.listNodes().reduce((n, nd) => { const m = nd.getMesh(); if (!m) return n; const k = nd.getExtension('EXT_mesh_gpu_instancing')?.getAttribute('TRANSLATION')?.getCount() ?? 1; return n + k * m.listPrimitives().reduce((s, p) => s + (p.getIndices() ? p.getIndices().getCount() : p.getAttribute('POSITION').getCount()) / 3, 0); }, 0);
const before = { bytes: statSync(src).size, tris: tris() };

// ---------- 1. flatten
const isIdentityRS = (m) => Math.abs(m[0] - 1) < 1e-5 && Math.abs(m[5] - 1) < 1e-5 && Math.abs(m[10] - 1) < 1e-5 && [1, 2, 4, 6, 8, 9].every((i) => Math.abs(m[i]) < 1e-5);
const parentWorld = (n) => { const p = n.getParentNode(); return p ? p.getWorldMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; };
const meshUsers = new Map();
for (const n of root.listNodes()) if (n.getMesh()) meshUsers.set(n.getMesh(), (meshUsers.get(n.getMesh()) || 0) + 1);
let nInst = 0, nRigid = 0, nVert = 0;
for (const n of root.listNodes()) {
  const mesh = n.getMesh(); if (!mesh) continue;
  if (!isIdentityRS(parentWorld(n))) throw new Error(`parent of ${n.getName()} is rotated/scaled: flatten would need a local-space delta`);
  const inst = n.getExtension('EXT_mesh_gpu_instancing');
  if (inst) {
    const w = n.getWorldMatrix(); if (!isIdentityRS(w)) throw new Error(`instanced node ${n.getName()} is rotated/scaled`);
    const t = inst.getAttribute('TRANSLATION'), v = [0, 0, 0];
    for (let i = 0; i < t.getCount(); i++) { t.getElement(i, v); v[1] -= F.d(v[0] + w[12], v[2] + w[14]); t.setElement(i, v); nInst++; }
    continue;
  }
  const b = getBounds(n), cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2, w = n.getWorldMatrix();
  const placed = !isIdentityRS(w) || Math.abs(w[12]) + Math.abs(w[13]) + Math.abs(w[14]) > 1e-5; // its own transform: a placed prop / tree
  if (placed || Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) <= 8) { // a rigid object: lower the whole node (at its footprint centre)
    const t = n.getTranslation(); n.setTranslation([t[0], t[1] - F.d(cx, cz), t[2]]); nRigid++; continue;
  }
  // a big merged piece (buildings, fences, terrain): lower every vertex by the field under it
  if (meshUsers.get(mesh) > 1) throw new Error(`merged mesh ${mesh.getName()} is shared`);
  for (const p of mesh.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); v[1] -= F.d(v[0], v[2]); pos.setElement(i, v); }
    nVert += pos.getCount();
  }
}

// ---------- 2. gameplay empties (the game places its own markers from data/gameplay.json)
for (const n of root.listNodes()) if (!n.getMesh() && /^(Gameplay_|Spawn_Anchors|H\d\d$|SEEKER_START)/.test(n.getName()) && !n.listChildren().some((c) => c.getMesh())) n.dispose();

// ---------- 3. simplify the repeated scenery (ratio of triangles kept, error cap relative to mesh size). Foliage is loose leaf triangles
// (no shared vertices), which a simplifier cannot reduce, so only bark / prop surfaces are simplified. Never the grass (hiding cover).
const SIMPLIFY = { pine_01_Mesh: 0.3, pine_02_Mesh: 0.3, deciduous_01_Mesh: 0.3, dead_tree_01_Mesh: 0.5, 'Cylinder.071': 0.35, 'Cube.545': 0.5, 'Cube.001': 0.5, 'Cube.234': 0.5, 'Cube.202': 0.5 };
for (const m of root.listMeshes()) {
  const ratio = SIMPLIFY[m.getName()]; if (!ratio) continue;
  for (const p of m.listPrimitives()) { fn.weldPrimitive(p, { tolerance: 0.0001 }); fn.simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio, error: 0.02, lockBorder: false }); }
}
// The scenic forest outside the fence (Forest_Scenic_*: never closer than ~4 m to a player, mostly 15+ m) gets its own copy of each tree
// mesh with 55% of the leaf triangles (a seeded pick); the trees inside the fence keep every leaf.
const FAR_KEEP = 0.55, farCopy = new Map();
const keepTri = (i) => (((i * 2654435761) >>> 0) % 1000) / 1000 < FAR_KEEP;
for (const n of root.listNodes()) {
  const m = n.getMesh(); if (!m || !/^Forest_Scenic/.test(n.getParentNode()?.getName() || n.getName()) || !/^(pine|deciduous)/.test(m.getName())) continue;
  let far = farCopy.get(m);
  if (!far) {
    far = doc.createMesh(`${m.getName()}_far`); // (Mesh.clone shares its primitives: clone each one)
    for (const p0 of m.listPrimitives()) far.addPrimitive(p0.clone());
    for (const p of far.listPrimitives()) {
      if (!/foliage/.test(p.getMaterial()?.getName() || '')) continue;
      const ix = p.getIndices().clone(), src = ix.getArray(), keep = [];
      for (let t = 0; t < src.length / 3; t++) if (keepTri(t)) keep.push(src[3 * t], src[3 * t + 1], src[3 * t + 2]);
      p.setIndices(ix.setArray(new (src.constructor)(keep)));
    }
    farCopy.set(m, far);
  }
  n.setMesh(far);
}

// ---------- grass audit: tall-grass clumps (GRASS_xx.* instances) inside each patch's concealment core. Written next to this script and
// checked by tests/world/coldwood.test.mjs (the cores are the server's concealment rects, so they must be the densest part of the field).
{
  const G = JSON.parse(readFileSync(`${pack}/data/gameplay.json`, 'utf8')), audit = [];
  for (const g of G.grass_patches) {
    const [cx, , cz] = g.core_center, [sx, , sz] = g.concealment_core_size, x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    let n = 0, all = 0, minH = Infinity;
    for (const nd of root.listNodes()) {
      if (!nd.getName().startsWith(`${g.id}.`)) continue;
      const inst = nd.getExtension('EXT_mesh_gpu_instancing'); if (!inst) continue;
      const t = inst.getAttribute('TRANSLATION'), sc = inst.getAttribute('SCALE'), v = [0, 0, 0], s = [1, 1, 1];
      const top = nd.getMesh().listPrimitives().reduce((m, p) => Math.max(m, p.getAttribute('POSITION').getMax([])[1]), 0);
      for (let i = 0; i < t.getCount(); i++) { t.getElement(i, v); all++; if (v[0] >= x0 && v[0] <= x1 && v[2] >= z0 && v[2] <= z1) { n++; if (sc) sc.getElement(i, s); minH = Math.min(minH, top * s[1] + v[1]); } }
    }
    audit.push({ id: g.id, clumps: all, inCore: n, coreArea: +(sx * sz).toFixed(2), perM2: +(n / (sx * sz)).toFixed(2), minTop: +minH.toFixed(2) });
  }
  writeFileSync(new URL('./grass-audit.json', import.meta.url), `${JSON.stringify(audit, null, 1)}\n`);
  console.log('grass cores: min clumps/m2', Math.min(...audit.map((a) => a.perM2)), 'min blade top (m)', Math.min(...audit.map((a) => a.minTop)));
}

// ---------- 3b. draw calls: the export has one instanced node per mesh per district block (plus loose single trees), ~1000 draw calls in
// the wide views. Every placement of a mesh is regrouped into one instanced node per 44 m chunk (3 x 3 inside the fence, a ring outside),
// per category (scenic forest / tall grass / ground dressing / the rest), so frustum culling still works per chunk. (After the grass audit.)
{
  const CH = 44, chunk = (x, z) => `${Math.floor((x + 66) / CH)},${Math.floor((z + 66) / CH)}`;
  const top = (n) => { let p = n; while (p.getParentNode()) p = p.getParentNode(); return p.getName(); };
  const cat = (n) => { const t = top(n), nm = n.getName(); return /^Forest_Scenic/.test(t) || /^Forest_Scenic/.test(nm) ? 'Forest_Scenic' : /^GRASS_/.test(nm) ? 'GRASS' : /^Ground_Dressing/.test(t) || /^Ground_Dressing/.test(nm) ? 'Ground_Dressing' : 'Props'; };
  const uses = new Map(); for (const n of root.listNodes()) if (n.getMesh()) uses.set(n.getMesh(), (uses.get(n.getMesh()) || 0) + 1);
  const groups = new Map(), scene = root.listScenes()[0];
  const m4 = (n) => n.getWorldMatrix(), dec = (m) => { // world TRS of a placed node (uniform-ish scale, yaw-only rotation in this export)
    const sx = Math.hypot(m[0], m[1], m[2]), sy = Math.hypot(m[4], m[5], m[6]), sz = Math.hypot(m[8], m[9], m[10]);
    const r00 = m[0] / sx, r11 = m[5] / sy, r22 = m[10] / sz, r21 = m[6] / sy, r12 = m[9] / sz, r02 = m[8] / sz, r20 = m[2] / sx, r10 = m[1] / sx, r01 = m[4] / sy;
    const w = Math.sqrt(Math.max(0, 1 + r00 + r11 + r22)) / 2, k = 1 / (4 * w || 1);
    return { t: [m[12], m[13], m[14]], r: [(r21 - r12) * k, (r02 - r20) * k, (r10 - r01) * k, w], s: [sx, sy, sz] };
  };
  for (const n of root.listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const inst = n.getExtension('EXT_mesh_gpu_instancing');
    const list = [];
    if (inst) {
      const T = inst.getAttribute('TRANSLATION'), R = inst.getAttribute('ROTATION'), S = inst.getAttribute('SCALE'), w = m4(n);
      for (let i = 0; i < T.getCount(); i++) { const t = T.getElement(i, []); list.push({ t: [t[0] + w[12], t[1] + w[13], t[2] + w[14]], r: R ? R.getElement(i, []) : [0, 0, 0, 1], s: S ? S.getElement(i, []) : [1, 1, 1] }); }
    } else if (uses.get(mesh) > 1 && n.listChildren().length === 0) list.push(dec(m4(n)));
    else continue;
    for (const it of list) { const key = `${cat(n)}|${mesh.getName()}|${chunk(it.t[0], it.t[2])}`; let g = groups.get(key); if (!g) groups.set(key, (g = { mesh, cat: cat(n), ch: chunk(it.t[0], it.t[2]), items: [] })); g.items.push(it); }
    n.setMesh(null); if (inst) n.setExtension('EXT_mesh_gpu_instancing', null);
  }
  const ext = doc.createExtension(ALL_EXTENSIONS.find((E) => E.EXTENSION_NAME === 'EXT_mesh_gpu_instancing')).setRequired(false), buf = root.listBuffers()[0];
  const parents = new Map();
  for (const g of groups.values()) {
    let p = parents.get(g.cat); if (!p) { p = doc.createNode(g.cat === 'GRASS' ? 'GRASS_fields' : g.cat); scene.addChild(p); parents.set(g.cat, p); }
    const acc = (type, arr) => doc.createAccessor().setType(type).setArray(new Float32Array(arr)).setBuffer(buf);
    const node = doc.createNode(`${g.cat}_${g.mesh.getName()}_${g.ch}`).setMesh(g.mesh).setExtension('EXT_mesh_gpu_instancing', ext.createInstancedMesh()
      .setAttribute('TRANSLATION', acc('VEC3', g.items.flatMap((i) => i.t))).setAttribute('ROTATION', acc('VEC4', g.items.flatMap((i) => i.r))).setAttribute('SCALE', acc('VEC3', g.items.flatMap((i) => i.s))));
    p.addChild(node);
  }
  console.log('regrouped instancing:', groups.size, 'instanced nodes');
}

// ---------- 4. textures: WebP, max 1024 (terrain 2048 -> 1024; the rest are 512 already)
await doc.transform(
  fn.dedup(), fn.prune({ keepLeaves: false, keepAttributes: true }),
  fn.textureCompress({ encoder: sharp.default, targetFormat: 'webp', resize: [1024, 1024], quality: 82, slots: /^(?!normal).*/ }),
  fn.textureCompress({ encoder: sharp.default, targetFormat: 'webp', resize: [1024, 1024], quality: 92, slots: /^normal/ }),
  fn.meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(outFile, doc);
const after = { bytes: statSync(outFile).size, tris: tris() };
console.log({ before, after, flattened: { instances: nInst, rigidNodes: nRigid, vertices: nVert } });
