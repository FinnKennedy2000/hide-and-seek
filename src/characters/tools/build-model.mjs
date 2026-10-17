// One-off asset build (NOT part of the game bundle). Turns three.js' RobotExpressive.glb (CC0, see ASSETS.md) into
// public/models/characters/robot.glb: ONE skinned mesh / ONE draw call, per-vertex albedo + tint mask, 7 clips, meshopt-compressed.
//   mkdir gt && cd gt && echo '{"type":"module"}' > package.json && npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   node build-model.mjs RobotExpressive.glb robot.glb
// The source has 12 rigid meshes parented to bones plus 2 skinned hands (3 materials, ~20 primitives = ~20 draw calls per character).
// Every vertex is baked to world space at rest pose and (re)weighted to one shared 43+ bone skin.
import { NodeIO, Accessor } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { reorder, prune, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [src, dst] = process.argv.slice(2);
const KEEP = new Set(['Idle', 'Walking', 'Running', 'Jump', 'Death', 'Dance', 'Wave']);
// tint mask per source material: Main (orange body) takes the full player colour, Grey a little of it, Black none
const MASK = { Main: 1, Grey: 0.35, Black: 0 };
const ALBEDO = { Main: [0.9, 0.9, 0.9], Grey: null, Black: null }; // null = keep the material's own colour

const io = new NodeIO().registerExtensions([EXTMeshoptCompression]);
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
io.registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot(), scene = root.listScenes()[0];

// ---- tiny column-major mat4 helpers
const mulP = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
const mulV = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
function inv(m) {
  const o = new Array(16), [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; d = 1 / d;
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d; o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d; o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d; o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d; o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return o;
}

// ---- joint list: every joint of the hand skin plus the bone each rigid mesh hangs from
const handSkin = root.listSkins()[0];
const joints = [...handSkin.listJoints()];
const jIndex = (n) => { let i = joints.indexOf(n); if (i < 0) { joints.push(n); i = joints.length - 1; } return i; };
const nearestBone = (n) => { for (let p = n.getParentNode(); p; p = p.getParentNode()) if (p !== n && !p.getMesh()) return p; throw new Error('no bone'); };

const P = [], N = [], C = [], M = [], J = [], W = [], I = [];
const toDelete = [];
function push(pos, nor, mat, jw) { // jw: [[joint, weight] x<=4]
  const mn = mat.getName(), base = ALBEDO[mn] || mat.getBaseColorFactor().slice(0, 3);
  P.push(...pos); N.push(...nor); C.push(...base, 1); M.push(MASK[mn] ?? 0);
  const s = jw.slice(0, 4); while (s.length < 4) s.push([0, 0]);
  J.push(...s.map((x) => x[0])); W.push(...s.map((x) => x[1]));
}
const all = []; scene.traverse((n) => all.push(n));
for (const node of all) {
  const mesh = node.getMesh(); if (!mesh) continue;
  toDelete.push(node);
  const skin = node.getSkin(), Wm = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), nor = prim.getAttribute('NORMAL'), idx = prim.getIndices(), mat = prim.getMaterial();
    const base = P.length / 3, v = [0, 0, 0], nn = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v); nor.getElement(i, nn);
      if (!skin) {
        const b = jIndex(nearestBone(node));
        const nw = mulV(Wm, ...nn), l = Math.hypot(...nw) || 1;
        push(mulP(Wm, ...v), nw.map((x) => x / l), mat, [[b, 1]]);
      } else { // skinned hand: evaluate the rest pose
        const j = prim.getAttribute('JOINTS_0').getElement(i, []), w = prim.getAttribute('WEIGHTS_0').getElement(i, []);
        const ws = w.reduce((a, b) => a + b, 0) || 1; for (let k = 0; k < 4; k++) w[k] /= ws; // the source weights are not normalised (three.js normalises on load)
        const sj = skin.listJoints(), ibm = skin.getInverseBindMatrices();
        let p = [0, 0, 0], nm = [0, 0, 0];
        const jw = [];
        for (let k = 0; k < 4; k++) if (w[k] > 0) {
          const m = sj[j[k]].getWorldMatrix(), ib = ibm.getElement(j[k], []);
                    // three.js binds with an identity bind matrix, so world = jointWorld * IBM * v (the hand node's own transform is not applied)
          const a = mulP(ib, ...v), b = mulP(m, ...a), an = mulV(ib, ...nn), bn = mulV(m, ...an);
          p = p.map((x, q) => x + b[q] * w[k]); nm = nm.map((x, q) => x + bn[q] * w[k]);
          jw.push([jIndex(sj[j[k]]), w[k]]);
        }
        const l = Math.hypot(...nm) || 1;
        push(p, nm.map((x) => x / l), mat, jw);
      }
    }
    for (let i = 0; i < idx.getCount(); i++) I.push(idx.getScalar(i) + base);
  }
}

// ---- build the single skinned mesh at scene root
const buf = root.listBuffers()[0];
const acc = (type, arr, Ctor) => doc.createAccessor().setType(type).setArray(new Ctor(arr)).setBuffer(buf);
const iba = new Float32Array(joints.length * 16);
joints.forEach((jn, k) => iba.set(inv(jn.getWorldMatrix()), k * 16));
const skin = doc.createSkin('RobotSkin').setInverseBindMatrices(acc(Accessor.Type.MAT4, iba, Float32Array));
joints.forEach((jn) => skin.addJoint(jn));
skin.setSkeleton(joints[0].getParentNode() || joints[0]);
const mat = doc.createMaterial('Robot').setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0.1).setRoughnessFactor(0.9);
const prim = doc.createPrimitive().setMaterial(mat)
  .setAttribute('POSITION', acc('VEC3', P, Float32Array)).setAttribute('NORMAL', acc('VEC3', N, Float32Array))
  .setAttribute('COLOR_0', acc('VEC4', C, Float32Array)).setAttribute('_MASK', acc('SCALAR', M, Float32Array))
  .setAttribute('JOINTS_0', acc('VEC4', J, Uint16Array)).setAttribute('WEIGHTS_0', acc('VEC4', W, Float32Array))
  .setIndices(acc('SCALAR', I, Uint32Array));
const rmesh = doc.createMesh('Robot').addPrimitive(prim);
const rnode = doc.createNode('RobotMesh').setMesh(rmesh).setSkin(skin);
scene.addChild(rnode);

// ---- simplify (keeps existing vertices, so joint indices stay valid), then drop the old meshes
{
  const idx = prim.getIndices(), a = new Uint32Array(idx.getArray());
  const pos = prim.getAttribute('POSITION').getArray();
  const [out] = MeshoptSimplifier.simplify(a, pos, 3, Math.floor(a.length * 0.6 / 3) * 3, 0.01, ['LockBorder']);
  idx.setArray(out);
}
for (const n of toDelete) { const m = n.getMesh(); n.setMesh(null); n.setSkin(null); if (m && m !== rmesh) m.dispose(); if (!n.listChildren().length && n.getName() !== 'RobotMesh') { /* keep bone nodes */ } }
for (const n of toDelete) if (!joints.includes(n)) n.dispose();
root.listSkins().filter((s) => s !== skin).forEach((s) => s.dispose());

// ---- animations: keep 7, drop morph-weight channels (face morphs are gone)
for (const a of root.listAnimations()) {
  if (!KEEP.has(a.getName())) { a.dispose(); continue; }
  for (const ch of a.listChannels()) if (ch.getTargetPath() === 'weights') ch.dispose();
}
await doc.transform(resample(), prune(), reorder({ encoder: MeshoptEncoder }));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(dst, doc);
console.log('verts', P.length / 3, 'tris', Math.floor(prim.getIndices().getCount() / 3), 'joints', joints.length);
