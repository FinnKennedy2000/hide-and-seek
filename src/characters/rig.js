// glTF characters: a CC0 robot rig (public/models/characters/robot.glb, built by tools/build-model.mjs) driven by an AnimationMixer.
// One SkinnedMesh and one draw call per character. No DOM, no renderer imports (the Node test imports this file).
//   locomotion  idle/walk/run 1D blend      jump  start -> hold -> land      layers  taunt (upper body), full-body tagged / victory
//   procedural  (after the mixer, in model space)  crouch, aim pitch, seeker blaster hold, hit flinch
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { loadGroup } from '../core/assets.js';
import { bus, EV } from '../core/bus.js';
import { settings } from '../core/settings.js';
import { CLIP, MODEL_URL } from './clips.js';
import { gearGeometry, gearMat, seekerGearMat } from './gear.js';

export const HATS = ['none', 'cap', 'beanie', 'bucket', 'crown'];
export const OUTFITS = ['plain', 'stripes', 'dots', 'overalls'];

const HEIGHT = 1.6, RIG_H = 4.46;           // metres tall; head-top height of the source rig at rest
const SCALE = HEIGHT / RIG_H;
const U = 1 / (100 * SCALE);                 // metres -> bone-local units (armature node is scaled x100)
const HEAD_K = 1.25, HEAD_Y = 0.6 / 100;     // hat size multiplier and head-centre offset above the Head bone (bone-local units)

// ---- shared state ----
let tpl = null, status = 'idle', loading = null;
const live = new Set();
export const rigStatus = () => status;      // 'idle' | 'loading' | 'ready' | 'failed'
export const lod = { camera: null };         // set by index.js (kept out of here so Node can import this file)

const UPPER = /^(Head|Neck|Shoulder[LR]|UpperArm[LR]|LowerArm[LR]|Palm|Middle|Thumb|Index|Ring)/;
function buildTemplate(gltf) {
  const need = Object.values(CLIP);
  const missing = need.filter((n) => !gltf.animations.some((a) => a.name === n));
  if (missing.length) throw new Error(`robot.glb is missing clips: ${missing.join(', ')}`);
  let mesh = null; gltf.scene.traverse((o) => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh) throw new Error('robot.glb has no SkinnedMesh');
  const g = mesh.geometry, m = g.getAttribute('_mask');
  if (m) { g.setAttribute('aMask', m); g.deleteAttribute('_mask'); }
  const by = (n) => gltf.animations.find((a) => a.name === n);
  const wave = by(CLIP.taunt).clone();
  wave.tracks = wave.tracks.filter((t) => UPPER.test(t.name));
  return {
    scene: gltf.scene,
    clips: {
      idle: by(CLIP.idle), walk: by(CLIP.walk), run: by(CLIP.run), tagged: by(CLIP.tagged), victory: by(CLIP.victory), taunt: wave,
      jumpStart: THREE.AnimationUtils.subclip(by(CLIP.jump), 'JumpStart', 0, 9, 30),
      jumpLand: THREE.AnimationUtils.subclip(by(CLIP.jump), 'JumpLand', 12, 21, 30),
    },
  };
}
// `gltf` = a parsed GLTF (tests call this directly); null marks a failed load
export function setRigAsset(gltf) {
  if (!gltf) { status = 'failed'; return false; }
  try { tpl = buildTemplate(gltf); status = 'ready'; return true; } catch (e) { console.warn('character rig unusable', e); status = 'failed'; return false; }
}
export function loadRig() {
  if (!loading) { status = 'loading'; loading = loadGroup('characters', [{ key: 'robot', url: MODEL_URL, type: 'gltf' }]).then((r) => setRigAsset(r.get('robot'))); }
  return loading;
}
// a new round clears tagged / victory poses left over from the last one
bus.on(EV.ROUND, () => { for (const c of live) c.play('reset'); });

// ---- tinted material: vertex albedo, `aMask` says how much of the player colour a vertex takes; one shared program ----
function makeMaterial(tint, pat) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTint = { value: tint }; sh.uniforms.uPat = pat;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMask;\nvarying float vMask;\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aMask; vOP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;\nuniform float uPat;\nvarying float vMask;\nvarying vec3 vOP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float pt = 1.0;
        if (uPat < 1.5) pt = 0.78 + 0.22 * step(0.0, sin(vOP.y * 9.0));
        else if (uPat < 2.5) pt = 0.8 + 0.2 * step(0.0, sin(vOP.y * 7.0) * sin(vOP.x * 7.0 + vOP.z * 7.0));
        else if (uPat < 3.5) pt = mix(0.55, 1.0, step(1.4, vOP.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTint * pt, vMask);`);
  };
  m.customProgramCacheKey = () => 'rigchar';
  return m;
}

// ---- LOD / visibility (module-wide: one frustum refresh serves every character) ----
const fr = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere(new THREE.Vector3(), 1.4), wp = new THREE.Vector3(), cp = new THREE.Vector3();
let frT = -1e9;
function view(root) { // -> { d (metres to camera), vis }
  for (let o = root; o; o = o.parent) if (!o.visible) return { d: 0, vis: false };
  const cam = lod.camera; if (!cam) return { d: 0, vis: true };
  const now = performance.now();
  if (now - frT > 3) { pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(pm); cam.getWorldPosition(cp); frT = now; }
  root.updateWorldMatrix(true, false); wp.setFromMatrixPosition(root.matrixWorld);
  sph.center.copy(wp).y += 0.8;
  return { d: wp.distanceTo(cp), vis: fr.intersectsSphere(sph) };
}
// seconds between bone updates: full rate within 15 m, reduced beyond 30 m; low presets drop earlier
function stepFor(d) {
  const q = settings.quality;
  if (q === 'potato') return d < 8 ? 0 : d < 30 ? 1 / 15 : 1 / 10;
  if (q === 'low') return d < 15 ? 0 : d < 30 ? 1 / 20 : 1 / 12;
  return d < 15 ? 0 : d < 30 ? 1 / 30 : 1 / 15;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const sstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
const _pq = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _dq = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

export function createRigCharacter({ color = 0x4cc9f0, hat = 'none', outfit = 'plain', seeker = false } = {}) {
  if (!tpl) throw new Error('character rig not loaded');
  if (!HATS.includes(hat)) hat = 'none';
  if (!OUTFITS.includes(outfit)) outfit = 'plain';

  const model = cloneSkinned(tpl.scene);
  let skin = null; model.traverse((o) => { if (o.isSkinnedMesh) skin = o; });
  const base = new THREE.Color(color), tint = base.clone();
  const mat = makeMaterial(tint, { value: OUTFITS.indexOf(outfit) });
  skin.material = mat; skin.castShadow = true; skin.receiveShadow = false;

  const pivot = new THREE.Group(); pivot.rotation.y = Math.PI; pivot.scale.setScalar(SCALE); pivot.add(model); // character.js faces -Z
  const root = new THREE.Group(); root.add(pivot);

  const B = {}; // bones by sanitised name
  for (const n of ['Body', 'Abdomen', 'Torso', 'Neck', 'Head', 'UpperArmR', 'LowerArmR', 'Palm2R', 'UpperLegL', 'LowerLegL', 'UpperLegR', 'LowerLegR']) B[n] = model.getObjectByName(n);
  const handled = Object.values(B).filter(Boolean);
  const baseQ = new Map(handled.map((b) => [b, b.quaternion.clone()])), baseY = B.Body.position.y;

  // gear: one merged mesh each, children of the head bone (+Z is forward in bone space, hats are authored facing -Z)
  const mkGear = (name, m) => {
    const geo = gearGeometry(name, HEAD_K); if (!geo) return null;
    const g = new THREE.Mesh(geo, m); g.scale.setScalar(U); g.position.y = HEAD_Y; g.rotation.y = Math.PI; B.Head.add(g); return g;
  };
  if (hat !== 'none') mkGear(hat, gearMat);
  const seekerGear = mkGear('seeker', seekerGearMat);
  const setSeeker = (v) => { S.seeker = !!v; seekerGear.visible = !!v; };

  // ---- animation ----
  const mixer = new THREE.AnimationMixer(model);
  const act = (clip, loop) => { const a = mixer.clipAction(clip); a.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity); a.clampWhenFinished = loop === THREE.LoopOnce; return a; };
  const C = tpl.clips;
  const A = {
    idle: act(C.idle, THREE.LoopRepeat), walk: act(C.walk, THREE.LoopRepeat), run: act(C.run, THREE.LoopRepeat),
    js: act(C.jumpStart, THREE.LoopOnce), jl: act(C.jumpLand, THREE.LoopOnce), taunt: act(C.taunt, THREE.LoopOnce),
    tag: act(C.tagged, THREE.LoopOnce), vic: act(C.victory, THREE.LoopRepeat),
  };
  A.taunt.clampWhenFinished = false;
  for (const k of ['idle', 'walk', 'run']) { A[k].play(); A[k].time = Math.random() * 0.9; } // desync neighbours
  for (const a of Object.values(A)) a.setEffectiveWeight(0);

  const S = { seeker: false, move: 0, run: 0, crouch: 0, air: 0, hold: 0, look: 0, pitch: 0, ov: 0, mode: null, vicT: 0,
    taunt: -1, hit: -1, landT: -1, wasAir: false, acc: 0, any: false };
  setSeeker(seeker); S.hold = seeker ? 1 : 0;
  const TAUNT_T = C.taunt.duration, LAND_T = C.jumpLand.duration + 0.1, HIT_T = 0.4;

  function rot(bone, axis, ang) { // rotate `bone` by `ang` about a MODEL-space axis (independent of the bone's own axes)
    if (!bone || Math.abs(ang) < 1e-4) return;
    chainQ(bone.parent, _pq); _bq.copy(_pq).multiply(bone.quaternion);
    _dq.setFromAxisAngle(axis, ang); _bq.premultiply(_dq);
    bone.quaternion.copy(_pq.invert().multiply(_bq));
  }
  function chainQ(bone, out) { out.identity(); const ch = []; for (let o = bone; o && o !== model; o = o.parent) ch.push(o); for (let i = ch.length - 1; i >= 0; i--) out.multiply(ch[i].quaternion); return out; }
  function point(bone, child, dir, w) { // swing `bone` so that bone->child points along model-space `dir`, blended by `w`
    if (!bone || !child || w < 0.01) return;
    chainQ(bone.parent, _pq); _bq.copy(_pq).multiply(bone.quaternion);
    _v.copy(child.position).normalize().applyQuaternion(_bq);
    _dq.setFromUnitVectors(_v, dir); _bq.premultiply(_dq);
    _bq.premultiply(_pq.invert()); bone.quaternion.slerp(_bq, w);
  }
  const HOLD_UP = new THREE.Vector3(), HOLD_LO = new THREE.Vector3();

  function update(dt, { speed = 0, crouch = false, airborne = false, lookYaw = 0, aimPitch = 0 } = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    const { d, vis } = view(root);
    if (!vis) { S.any = false; return; } // off-screen or hidden: the mixer is paused, state resumes when it returns
    S.acc += dt;
    const step = stepFor(d);
    if (S.acc < step && S.any) { applyPose(); return; } // reduced-rate bone update: re-apply the held pose only
    const h = S.acc; S.acc = 0; S.any = true;

    S.move = damp(S.move, speed > 0.15 ? clamp(speed / 1.2, 0, 1) : 0, 10, h);
    S.run = damp(S.run, clamp((speed - 2.5) / 2.5, 0, 1), 6, h);
    S.crouch = damp(S.crouch, crouch ? 1 : 0, 12, h);
    S.air = damp(S.air, airborne ? 1 : 0, 14, h);
    S.look = damp(S.look, clamp(lookYaw, -1.2, 1.2), 10, h);
    S.pitch = damp(S.pitch, clamp(aimPitch, -1.2, 1.2), 14, h);
    S.ov = damp(S.ov, S.mode ? 1 : 0, 9, h);
    if (S.mode === 'victory' && (S.vicT += h) > C.victory.duration * 2) S.mode = null;

    if (airborne && !S.wasAir) { A.js.reset().play(); S.landT = -1; }
    if (!airborne && S.wasAir) { A.jl.reset().play(); S.landT = 0; }
    S.wasAir = airborne;
    if (S.landT >= 0 && (S.landT += h) > LAND_T) S.landT = -1;
    if (S.taunt >= 0 && (S.taunt += h) > TAUNT_T) S.taunt = -1;
    if (S.hit >= 0 && (S.hit += h) > HIT_T) S.hit = -1;

    const free = 1 - S.ov, landW = S.landT >= 0 ? 1 - sstep(S.landT / LAND_T) : 0;
    const loco = free * (1 - Math.max(S.air, landW));
    A.idle.setEffectiveWeight(loco * (1 - S.move));
    A.walk.setEffectiveWeight(loco * S.move * (1 - S.run));
    A.run.setEffectiveWeight(loco * S.move * S.run);
    A.js.setEffectiveWeight(free * S.air);
    A.jl.setEffectiveWeight(free * landW * (1 - S.air));
    // walk and run clips share one duration, so one time scale keeps their feet in phase
    const ts = clamp(speed / (2.2 + 2.8 * S.run), 0.6, 1.5); A.walk.timeScale = A.run.timeScale = ts;
    const tw = S.taunt >= 0 ? sstep(Math.min(1, S.taunt / 0.15, (TAUNT_T - S.taunt) / 0.25)) : 0;
    A.taunt.setEffectiveWeight(tw * free * 12); // the clip only drives the arm, so it must out-weigh the locomotion on those tracks
    A.tag.setEffectiveWeight(S.mode === 'tagged' ? S.ov : 0);
    A.vic.setEffectiveWeight(S.mode === 'victory' ? S.ov : 0);
    S.tw = tw;

    for (const b of handled) b.quaternion.copy(baseQ.get(b)); B.Body.position.y = baseY; // undo last frame's procedural pose
    mixer.update(h);
    for (const b of handled) baseQ.get(b).copy(b.quaternion); // (bones the clips don't drive keep their rest value)
    applyPose();
  }

  function applyPose() {
    const { crouch: cr, pitch: p, hold, look } = S, free = 1 - S.ov;
    const bq = baseQ;
    for (const b of handled) b.quaternion.copy(bq.get(b));
    B.Body.position.y = baseY;
    const c = cr * free * (1 - S.air);
    if (c > 0.01) {
      B.Body.position.y = baseY - 0.19 * c * U;
      rot(B.UpperLegL, AX, -0.8 * c); rot(B.UpperLegR, AX, -0.8 * c);
      rot(B.LowerLegL, AX, 1.6 * c); rot(B.LowerLegR, AX, 1.6 * c);
      rot(B.Abdomen, AX, 0.25 * c);
    }
    const f = free;
    rot(B.Abdomen, AX, -p * 0.3 * f); rot(B.Torso, AX, -p * 0.25 * f); rot(B.Head, AX, -p * 0.35 * f);
    rot(B.Head, AY, look * 0.3 * f);
    if (S.hit >= 0) { const e = Math.sin(Math.PI * Math.pow(S.hit / HIT_T, 0.6)); rot(B.Abdomen, AX, -0.45 * e); rot(B.Head, AX, -0.25 * e); }
    const hw = hold * f * (1 - S.tw) * (1 - S.air * 0.5);
    if (hw > 0.01) { // blaster hold: right arm out in front, tilted with the aim
      const s = Math.sin(p * 0.9);
      point(B.UpperArmR, B.LowerArmR, HOLD_UP.set(-0.15, s * 0.8 + 0.1, 1).normalize(), hw);
      point(B.LowerArmR, B.Palm2R, HOLD_LO.set(-0.05, s + 0.05, 1).normalize(), hw);
    }
  }

  function play(name) {
    if (name === 'taunt') { S.taunt = 0; A.taunt.reset().play(); }
    else if (name === 'hit') S.hit = 0;
    else if (name === 'tagged') { S.mode = 'tagged'; A.tag.reset().play(); }
    else if (name === 'victory') { S.mode = 'victory'; S.vicT = 0; A.vic.reset().play(); }
    else if (name === 'reset' || name === 'idle') { S.mode = null; S.hit = S.taunt = -1; }
  }
  function setTint(c, amount = 0) { tint.copy(base).lerp(new THREE.Color(c), clamp(amount, 0, 1)); }
  function dispose() { live.delete(api); mixer.stopAllAction(); mixer.uncacheRoot(model); skin.skeleton.dispose(); mat.dispose(); }

  const api = { kind: 'rig', root, update, play, setSeeker, setTint, dispose };
  live.add(api);
  applyPose();
  return api;
}
