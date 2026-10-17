import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWorld } from '../shared/worlddata.js';
import { MAPS } from '../shared/maps/index.js';
import { rnd } from '../core/util.js';
import { scene } from '../render/renderer.js';
import { mat, M, grassTex, bookTex } from './materials.js';
import { applyEnv } from './env.js';
import { buildNav, setSpots } from '../ai/nav.js';

// ======================================================================
// world building. Rebuildable: setWorld(mapId) tears the current map down and builds another (see shared/maps/index.js).
// ======================================================================
export const colliders = [], props = []; // {x0,x1,z0,z1,y0,y1} / disguisable furniture (id = index). Refilled IN PLACE by setWorld: other modules import these arrays
export const solids = [];             // meshes that block the third-person camera and are sampled by camouflage / prop picking
export const propMeshes = [];         // propId -> meshes that make up that prop
const geoCache = new Map();
const GEO = {
  ico: (r, d) => new THREE.IcosahedronGeometry(r, d), sphere: (r, w, h) => new THREE.SphereGeometry(r, w, h),
  cyl: (rt, rb, h, s) => new THREE.CylinderGeometry(rt, rb, h, s), plane: (w, h) => new THREE.PlaneGeometry(w, h),
};
const geoOf = (spec) => { const k = spec.join(); let g = geoCache.get(k); if (!g) { g = GEO[spec[0]](...spec.slice(1)); geoCache.set(k, g); } return g; };
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
function track(m, propId, solid = true) {
  m.userData.propId = propId;
  if (propId >= 0) (propMeshes[propId] ||= []).push(m);
  if (solid) solids.push(m);
  return m;
}
export let worldKey = null, meta = null; // (exports are live bindings: only this module assigns them)
let world = null; // current map: group holding everything map-specific, its id, its MAPS meta
export let bounds = { x0: -23.5, x1: 23.5, z0: -23.5, z1: 23.5 };
let recs = null;               // geometry recorded while the map builds; merged by material in flushRecs()
const ownMats = [], flickers = []; // per-map materials to dispose; lights that flicker
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _m4 = new THREE.Matrix4();
function addRec(base, matName, cast, recv, propId, solid) {
  if (!mat[matName]) { console.warn('unknown material', matName); matName = 'dark'; }
  const g = base.index ? base.toNonIndexed() : base.clone(); // one attribute layout for every piece, so they can merge
  g.applyMatrix4(_m4);
  recs.push({ g, matName, cast, recv, propId, solid });
}
// Draw calls: every box / mesh is baked into world space and merged per (prop, material, shadow flags). All static scenery of
// one material becomes ONE mesh; each disguisable prop keeps its own mesh(es) so it stays addressable (picking, makePropClone).
function flushRecs() {
  const groups = new Map();
  for (const r of recs) { const k = `${r.propId}|${r.matName}|${r.cast}|${r.recv}|${r.solid}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  for (const list of groups.values()) {
    const r = list[0], g = mergeGeometries(list.map((x) => x.g));
    if (!g) throw new Error('geometry merge failed for ' + r.matName);
    for (const x of list) x.g.dispose();
    const m = new THREE.Mesh(g, mat[r.matName]);
    m.castShadow = r.cast; m.receiveShadow = r.recv; m.matrixAutoUpdate = false; // identity matrix: geometry is already in world space
    world.add(m); track(m, r.propId, r.solid);
  }
  recs = null;
}
// visual callbacks for worlddata.js: the layout (and colliders / props) lives there, shared with the server
const visual = {
  box(cx, cz, w, d, h, matName, o, propId) {
    const { y0 = 0, cast = true, ry = 0, recv = true } = o;
    _m4.compose(_p.set(cx, y0 + h / 2, cz), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(w, h, d));
    addRec(boxGeo, matName, cast, recv, propId, true);
  },
  mesh(spec, matName, x, y, z, o, propId) {
    _m4.compose(_p.set(x, y, z), _q.setFromEuler(o.r ? _e.set(...o.r) : _e.set(0, 0, 0)), o.s ? _s.set(...o.s) : _s.set(1, 1, 1));
    addRec(geoOf(spec), matName, o.cast ?? true, true, propId, o.cast !== false);
  },
  light(x, y, z, intensity, dist, color) {
    const l = new THREE.PointLight(color, intensity, dist, 2); l.position.set(x, y, z); world.add(l);
    if (color === meta.flicker) flickers.push({ l, base: intensity, dip: 0 });
  },
  books(cx, cz, len, propId) { // against a west wall, faces +x
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len * 0.94, 1.8), new THREE.MeshStandardMaterial({ map: bookTex, roughness: 0.9 }));
    p.rotation.y = Math.PI / 2; p.position.set(cx + 0.185, 1.0, cz);
    p.material.map = bookTex.clone(); p.material.map.repeat.set(len / 2, 1); p.material.map.needsUpdate = true;
    p.material.userData.ownMap = true; ownMats.push(p.material);
    world.add(p); track(p, propId);
  },
};

// A free-standing copy of a prop for disguises: same geometry/material/scale, origin at the prop's footprint centre on the floor.
// (Prop meshes are baked into world space with an identity transform, so shifting the clone's position is all it takes.)
export function makePropClone(id) {
  const pr = props[id], g = new THREE.Group();
  for (const m of propMeshes[id]) {
    const c = m.clone(); c.userData = {}; c.matrixAutoUpdate = true;
    c.position.x -= pr.x; c.position.z -= pr.z; c.position.y -= pr.y0;
    g.add(c);
  }
  return g;
}

// house-only scenery: grass tufts + distant conifers (instanced)
function houseScenery() {
  const own = (m) => { ownMats.push(m); return m; };
  const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 0.4, 3), own(M(0x3f6a35, 1)), 1500);
  const d = new THREE.Object3D();
  for (let i = 0; i < 1500; i++) {
    let x, z;
    do { x = rnd(-23, 23); z = rnd(-23, 23); } while (Math.abs(x) < 8.8 && Math.abs(z) < 6.8);
    d.position.set(x, 0.17, z); d.rotation.set(rnd(-0.2, 0.2), rnd(0, 6), rnd(-0.2, 0.2)); d.scale.setScalar(rnd(0.6, 1.5)); d.updateMatrix();
    tuft.setMatrixAt(i, d.matrix);
  }
  world.add(tuft);
  const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 9, 7), own(M(0x16221f, 1)), 90);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + rnd(-0.05, 0.05), r = rnd(30, 62);
    d.position.set(Math.cos(a) * r, 4.2, Math.sin(a) * r); d.rotation.set(0, 0, 0); d.scale.setScalar(rnd(0.8, 1.8)); d.updateMatrix();
    pines.setMatrixAt(i, d.matrix);
  }
  world.add(pines);
}

function clearWorld() {
  if (!world) return;
  scene.remove(world);
  world.traverse((o) => { if (o.isInstancedMesh) o.dispose(); o.geometry?.dispose(); }); // world geometry is all per-map (geoCache bases are never in the scene)
  for (const m of ownMats) { if (m.userData.ownMap) m.map.dispose(); m.dispose(); }
  ownMats.length = 0; flickers.length = 0;
  colliders.length = 0; props.length = 0; solids.length = 0; propMeshes.length = 0;
  world = null; worldKey = null;
}
// Build map `id` (a MAPS key), replacing the current one. No-op when it is already loaded.
export function setWorld(id) {
  if (!Object.hasOwn(MAPS, id)) id = 'house';
  if (id === worldKey) return;
  clearWorld();
  const map = MAPS[id];
  meta = map.meta;
  for (const [n, spec] of Object.entries(map.materials)) if (!mat[n]) mat[n] = new THREE.MeshStandardMaterial({ metalness: 0, ...spec });
  applyEnv(meta); bounds = meta.bounds;
  world = new THREE.Group(); scene.add(world);
  recs = [];
  const built = buildWorld(visual, id); // colliders + props come from the shared module; meshes via `visual`
  colliders.push(...built.colliders); props.push(...built.props);
  flushRecs();
  const gm = id === 'house' ? mat.grass : M(0x14161a, 0.95); // outside the shop fence: dark verge
  if (id !== 'house') ownMats.push(gm);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), gm);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  world.add(ground); solids.push(ground);
  if (id === 'house') { grassTex.repeat.set(300, 300); houseScenery(); }
  worldKey = id;
  buildNav();
  setSpots(map);
}
export const worldId = () => worldKey;

// fluorescent strips (lights whose colour is the map's `flicker` colour): jitter intensity, with the odd brief dropout
export function updateFlicker(dt) {
  for (const f of flickers) {
    f.dip -= dt;
    if (f.dip <= 0 && Math.random() < dt * 0.05) f.dip = 0.05 + Math.random() * 0.1; // rare short dropout
    f.l.intensity = f.base * (f.dip > 0 ? 0.45 + Math.random() * 0.25 : 0.96 + Math.random() * 0.04); // otherwise nearly steady
  }
}
