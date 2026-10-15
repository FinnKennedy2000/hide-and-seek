// Seeker's cartoon paint blaster: first-person viewmodel with recoil, paint tracers, capped splat decals, and the ammo crate.
import { THREE, scene, camera, solids, burst } from './game.js';
import { splatMat } from './char.js';

const M = (color, e = 0.3) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: e });
const bx = (w, h, d, m, x, y, z, p) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); p.add(o); return o; };

// ----- viewmodel (chunky toy: orange body, cyan barrel, magenta paint hopper, yellow grip)
const vm = new THREE.Group();
const VM_POS = new THREE.Vector3(0.27, -0.25, -0.55);
{
  bx(0.13, 0.15, 0.42, M(0xff8a1f), 0, 0, 0, vm);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.28, 12), M(0x22d3ee)); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.015, -0.33); vm.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.015, 6, 12), M(0xffffff, 0.5)); muzzle.position.set(0, 0.015, -0.47); vm.add(muzzle);
  const hopper = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), new THREE.MeshStandardMaterial({ color: 0xff3fa4, emissive: 0xff3fa4, emissiveIntensity: 0.4, transparent: true, opacity: 0.85 })); hopper.position.set(0, 0.14, 0.02); vm.add(hopper);
  bx(0.09, 0.2, 0.1, M(0xffd23f), 0, -0.15, 0.12, vm).rotation.x = 0.25;
  bx(0.03, 0.04, 0.03, M(0xffffff), 0, 0.09, -0.2, vm);
  vm.muzzle = new THREE.Object3D(); vm.muzzle.position.set(0, 0.015, -0.5); vm.add(vm.muzzle);
  vm.position.copy(VM_POS); vm.rotation.y = 0.06; vm.visible = false;
  camera.add(vm);
}
let kick = 0, bob = 0;
export const showBlaster = (on) => { vm.visible = on; };
export function updateBlaster(dt, moving) {
  kick = Math.max(0, kick - dt * 7); bob += dt * (moving ? 9 : 1.5);
  vm.position.set(VM_POS.x + Math.sin(bob * 0.5) * (moving ? 0.008 : 0.002), VM_POS.y + Math.abs(Math.sin(bob)) * (moving ? 0.01 : 0.002), VM_POS.z + kick * 0.09);
  vm.rotation.x = kick * 0.22;
}
export function muzzleWorld(out = new THREE.Vector3()) { camera.updateMatrixWorld(true); return vm.muzzle.getWorldPosition(out); }
export function recoil() { kick = 1; const p = muzzleWorld(); burst(p.x, p.y, p.z, 0xffe9a0, 10, 0.25, 0.8, 0.09); }

// ----- tracers
const tracers = [];
const tMats = new Map();
const tGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
const SPEED = 110;
export function tracer(from, to, color, onArrive) {
  let m = tMats.get(color); if (!m) { m = new THREE.MeshBasicMaterial({ color, fog: false }); tMats.set(color, m); }
  const mesh = new THREE.Mesh(tGeo, m), d = from.distanceTo(to);
  mesh.position.copy(from); mesh.lookAt(to); mesh.frustumCulled = false; scene.add(mesh);
  tracers.push({ mesh, from: from.clone(), to: to.clone(), d, t: 0, onArrive });
}
export function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const k = tracers[i]; k.t += dt * SPEED;
    const head = Math.min(k.t, k.d), tail = Math.max(0, head - 1.4), len = Math.max(0.1, head - tail);
    k.mesh.position.lerpVectors(k.from, k.to, (head + tail) / 2 / (k.d || 1)); k.mesh.scale.z = len;
    if (k.t >= k.d) { scene.remove(k.mesh); k.onArrive?.(); tracers.splice(i, 1); }
  }
}

// ----- paint decals (last 60 only)
const decals = [], MAX_DECALS = 60;
const decalGeo = new THREE.PlaneGeometry(1, 1);
const ray = new THREE.Raycaster(), _n = new THREE.Vector3(), _t = new THREE.Vector3();
export function splat(point, normal, color) {
  const m = new THREE.Mesh(decalGeo, splatMat(color));
  m.position.copy(point).addScaledVector(normal, 0.02);
  m.lookAt(_t.copy(point).add(normal)); m.rotateZ(Math.random() * 6.28); m.scale.setScalar(0.5 + Math.random() * 0.45);
  scene.add(m); decals.push(m);
  if (decals.length > MAX_DECALS) scene.remove(decals.shift());
}
// surface normal where a shot from o along (p - o) ended; null if nothing solid was hit (sky)
export function surfaceNormal(o, p) {
  const dir = _t.copy(p).sub(o), d = dir.length(); dir.normalize();
  ray.set(o, dir); ray.far = d + 0.6;
  const h = ray.intersectObjects(solids, false)[0];
  if (h && h.face) return _n.copy(h.face.normal).transformDirection(h.object.matrixWorld).clone();
  return null;
}
export function clearFx() {
  for (const t of tracers) scene.remove(t.mesh); tracers.length = 0;
  for (const d of decals) scene.remove(d); decals.length = 0;
  removeCrate();
}

// ----- ammo crate
let crate = null, crateT = 0;
export const cratePos = () => crate && crate.position;
export function spawnCrate(x, z) {
  removeCrate();
  crate = new THREE.Group();
  bx(0.55, 0.4, 0.4, M(0x22d3ee, 0.6), 0, 0, 0, crate);
  bx(0.58, 0.1, 0.43, M(0xffd23f, 0.6), 0, 0.2, 0, crate);
  bx(0.2, 0.2, 0.02, M(0xff3fa4, 0.9), 0, 0, 0.21, crate);
  const l = new THREE.PointLight(0x66e0ff, 6, 6, 2); l.position.y = 0.6; crate.add(l);
  crate.position.set(x, 0.5, z); scene.add(crate);
}
export function removeCrate() { if (crate) { scene.remove(crate); crate = null; } }
export function updateCrate(dt, visible) {
  if (!crate) return;
  crate.visible = visible; crateT += dt; crate.rotation.y += dt * 1.5; crate.position.y = 0.55 + Math.sin(crateT * 3) * 0.1;
}
