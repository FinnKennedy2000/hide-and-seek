// GLB characters (FIELD asset pack, public/models/characters/*.glb): the primary character path. One rigged model per role
// (moss_hider, tracker/phantom/trapper/brute seekers), clips Idle/Walk/Run/CrouchIdle/CrouchWalk (Phantom: HoverIdle/HoverMove), +Z forward, metres.
// Same interface as character.js (update/play/setSeeker/setTint/setCrouchHeight/setConcealed/headTop/dispose) plus setHeld.
// Animation: all clips run at once with blend weights from the real velocity; locomotion clips share one normalised stride phase that
// advances by distance (speed / measured stride length), so planted feet do not slide. interact / vault / injured / caged / tagged /
// victory / taunt / hit have no clips: they are bone overlays (rotations in model space) on top of the clip pose.
// Loading never throws: a failed file is logged (console + assetFail) and rigStatus() becomes 'failed' so char.js uses the procedural humans.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadGroup } from '../core/assets.js';
import { bus, EV } from '../core/bus.js';

export const MODEL_URL = (id) => `/models/characters/${id}.glb`;
export const MODEL_OF = { hider: 'moss_hider', tracker: 'tracker_seeker', phantom: 'phantom_seeker', trapper: 'trapper_seeker', charger: 'brute_seeker' };
export const HELD_OF = { tracker: 'Held_Lantern', trapper: 'Held_BearTrap', charger: 'Held_IronHammer' }; // phantom/hider hold nothing

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ---- template: loaded once per model, with the primitives merged per material kind (a hider is 2 draw calls, not 13) ----
// kind: emissive materials stay apart (Phantom eyes, lantern glass: seeker-only), metal apart (buckles), the rest is one cloth/skin/leather mesh.
const kindOf = (m) => (m.emissive && m.emissive.getHex() > 0 ? 'e' + m.emissive.getHex() : m.metalness > 0.1 ? 'm' : 'n');

function buildTemplate(id, gltf) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const groups = new Map(), drop = [];
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    let holder = '', p = o.parent; while (p && p !== scene) { if (/^Held_/.test(p.name)) holder = p.name; p = p.parent; }
    const m = o.material, key = `${holder}|${m.map?.uuid}|${kindOf(m)}|${m.side}`;
    (groups.get(key) ?? groups.set(key, { holder, first: o, list: [] }).get(key)).list.push(o);
    drop.push(o);
  });
  if (!groups.size) throw new Error(`${id}: no skinned mesh`);
  const out = new THREE.Group(); out.name = 'parts';
  for (const g of groups.values()) {
    const geo = mergeGeometries(g.list.map((o) => o.geometry), false);
    if (!geo) throw new Error(`${id}: primitives of ${g.holder || 'body'} would not merge`);
    const src = g.first.material, mat = new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, normalScale: src.normalScale.clone(), roughness: src.roughness, metalness: src.metalness, side: src.side, emissive: src.emissive.clone(), emissiveIntensity: src.emissiveIntensity });
    const sm = new THREE.SkinnedMesh(geo, mat); sm.name = g.holder || 'body'; sm.frustumCulled = false; sm.castShadow = true; sm.userData.held = g.holder; sm.userData.glow = mat.emissive.getHex() > 0;
    sm.bind(g.first.skeleton, g.first.bindMatrix);
    out.add(sm);
  }
  for (const o of drop) { o.geometry.dispose(); o.removeFromParent(); }
  scene.add(out);
  // keep the original skeleton's bones where they are; SkeletonUtils.clone rebinds by name
  const tpl = { id, scene, clips: new Map(gltf.animations.map((c) => [c.name, c])), stride: {}, phase0: {}, topOffset: 0, standTop: 0 };
  measure(tpl);
  return tpl;
}

// stride length (m per cycle) and the phase of left-foot heel strike for each locomotion clip, from the clip itself; plus the head-top offset above the head bone
function measure(tpl) {
  const root = cloneSkinned(tpl.scene), mixer = new THREE.AnimationMixer(root), bone = (n) => root.getObjectByName(n);
  const L = bone('footL'), R = bone('footR'), head = bone('head'), p = new THREE.Vector3();
  const topY = () => { const bb = new THREE.Box3(), t = new THREE.Box3(); root.traverse((o) => { if (o.isSkinnedMesh && !o.userData.held) { t.setFromObject(o, true); bb.union(t); } }); return bb.max.y; }; // precise = skinned vertices
  const clip = tpl.clips.get('Idle') ?? [...tpl.clips.values()][0];
  const a = mixer.clipAction(clip); a.play(); mixer.update(0); root.updateMatrixWorld(true);
  tpl.standTop = topY(); head.getWorldPosition(p); tpl.topOffset = tpl.standTop - p.y;
  mixer.stopAllAction();
  if (!L || !R) return; // phantom: no feet
  for (const name of ['Walk', 'Run', 'CrouchWalk']) {
    const c = tpl.clips.get(name); if (!c) continue;
    const act = mixer.clipAction(c); act.play(); const N = 96, z = [], y = [], zr = [], yr = [];
    for (let i = 0; i < N; i++) { act.time = (i / N) * c.duration; mixer.update(0); root.updateMatrixWorld(true); L.getWorldPosition(p); z.push(p.z); y.push(p.y); R.getWorldPosition(p); zr.push(p.z); yr.push(p.y); }
    // the starter clips swing each foot back and forth by `range` per cycle; a foot that moves back at body speed for half a cycle, alternating
    // with the other foot, means one cycle covers 2 x range of ground
    const range = ((Math.max(...z) - Math.min(...z)) + (Math.max(...zr) - Math.min(...zr))) / 2;
    tpl.stride[name] = 2 * range; // metres of ground per cycle
    let best = 0; for (let i = 1; i < N; i++) if (z[i] > z[best]) best = i;
    tpl.phase0[name] = best / N;
    mixer.stopAllAction();
  }
  mixer.uncacheRoot(root);
}

// ---- loading ----
let status = 'idle'; const templates = new Map(); const waiting = new Set();
export const glbStatus = () => status;
export const glbReady = (id) => templates.get(id) ?? null;
export function onGlbReady(fn) { waiting.add(fn); return () => waiting.delete(fn); }
export function preloadGlb() {
  if (status !== 'idle') return;
  status = 'loading';
  const ids = [...new Set(Object.values(MODEL_OF))];
  loadGroup('characters', ids.map((id) => ({ key: id, url: MODEL_URL(id), type: 'gltf' }))).then((got) => {
    const failed = [];
    for (const id of ids) {
      try { const g = got.get(id); if (!g) throw new Error('download/parse failed (see asset warning above)'); templates.set(id, buildTemplate(id, g)); }
      catch (e) { failed.push(id); console.error(`[characters] GLB ${id} unusable, procedural fallback for it:`, e); bus.emit(EV.ASSET_FAIL, { group: 'characters', key: id, url: MODEL_URL(id), error: String(e?.message || e) }); } // (hud.js shows the 'using fallbacks' toast)
    }
    status = failed.length ? 'failed' : 'ready'; // 'failed' = at least one role falls back; glbReady(id) says which
    if (failed.length) console.error(`[characters] GLB models failed: ${failed.join(', ')}`);
    for (const fn of [...waiting]) { try { fn(); } catch (e) { console.error('[characters] onGlbReady callback threw:', e); } }
  });
}

// ---- instance ----
export const TOPS = { stand: 1.72, crouch: 1.19 }; // documented sampled tops of the hider GLB (START_HERE); real ones come from the instance
const AXX = new THREE.Vector3(1, 0, 0), AXZ = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _w = new THREE.Quaternion();
// rotate `bone` by `ang` about a model-space axis (rig is posed first, parents before children)
function rot(bone, axis, ang) {
  if (!bone || !ang) return;
  bone.parent.getWorldQuaternion(_p); _w.setFromAxisAngle(axis, ang);
  _q.copy(_p).invert().multiply(_w).multiply(_p); bone.quaternion.premultiply(_q); bone.updateMatrixWorld(true);
}
// highest foot-cycle rate (cycles/s) before the legs look like a sped-up film; the starter clips' strides are short (0.6 / 1.1 / 0.4 m/s), so game speeds hit this cap
const CAP = { Walk: 1.8, Run: 2.4, CrouchWalk: 1.8 };
const LOCO = { hider: ['Idle', 'Walk', 'Run', 'CrouchIdle', 'CrouchWalk'], phantom: ['HoverIdle', 'HoverMove'] };

export function createGlbCharacter({ cls = null, seeker = false, tint = null, hat = 'none' } = {}) {
  const S = { seeker: false, cls: 'tracker', inst: null, move: 0, speed: 0, crouch: 0, air: 0, look: 0, pitch: 0, phase: 0, t: Math.random() * 10, taunt: -1, hit: -1, mode: null,
    w: { inter: 0, vault: 0, inj: 0, cage: 0, down: 0, vic: 0 }, held: true, concealed: false, tintHex: 0xffffff, tintAmt: 0, hipC: null, top: TOPS.stand, wts: {}, rstride: 0 };
  const root = new THREE.Group(); root.name = 'glbchar';
  const pivot = new THREE.Group(); root.add(pivot); // tagged topple / victory hop move the pivot, never the root the game positions

  function build() {
    if (S.inst) { pivot.remove(S.inst.obj); S.inst.mixer.stopAllAction(); S.inst.mixer.uncacheRoot(S.inst.obj); S.inst.mats.forEach((m) => m.dispose()); S.inst = null; }
    const id = MODEL_OF[S.seeker ? S.cls : 'hider'], tpl = templates.get(id);
    if (!tpl) throw new Error(`GLB ${id} not loaded`);
    const obj = cloneSkinned(tpl.scene), mixer = new THREE.AnimationMixer(obj), mats = [], held = [], glow = [];
    obj.traverse((o) => { if (o.isSkinnedMesh) { o.material = o.material.clone(); o.castShadow = !S.concealed; mats.push(o.material); if (o.userData.held) held.push(o); if (o.userData.glow) glow.push(o); } });
    const set = S.seeker ? LOCO[S.cls === 'phantom' ? 'phantom' : 'hider'] : LOCO.hider, actions = {};
    for (const n of set) { const c = tpl.clips.get(n); if (!c) throw new Error(`${id} has no clip ${n}`); const a = mixer.clipAction(c); a.play(); a.setEffectiveWeight(n === set[0] ? 1 : 0); actions[n] = a; }
    const b = (n) => obj.getObjectByName(n);
    const bones = { pelvis: b('pelvis'), spine: b('spine'), chest: b('chest'), head: b('head'), uaL: b('upper_armL'), uaR: b('upper_armR'), faL: b('forearmL'), faR: b('forearmR') };
    if (!bones.head || !bones.spine) throw new Error(`${id}: expected bone names missing`);
    pivot.add(obj);
    S.inst = { id, tpl, obj, mixer, actions, bones, mats, held, glow, phantom: S.seeker && S.cls === 'phantom' };
    // a hider must never glow; only seeker models keep emissive parts (Phantom eyes, lantern glass)
    for (const m of mats) if (!S.seeker) { m.emissive.setHex(0); m.emissiveIntensity = 0; }
    applyTint(); applyHeld(); hatMesh = null; setHat(S.hat);
  }
  function applyTint() { if (!S.inst) return; for (const m of S.inst.mats) m.color.set(0xffffff).lerp(new THREE.Color(S.tintHex), S.tintAmt); }
  function applyHeld() { if (S.inst) for (const o of S.inst.held) o.visible = S.held; }
  function setSeeker(v, c) {
    v = !!v; if (c in MODEL_OF && c !== 'hider') S.cls = c;
    const next = v ? S.cls : null; if (next === S.cur && S.inst) return;
    S.seeker = v; S.cur = next; build();
  }
  S.seeker = !!seeker; if (cls in MODEL_OF && cls !== 'hider') S.cls = cls; S.cur = S.seeker ? S.cls : null;
  S.tintHex = tint ?? 0xffffff; S.tintAmt = tint != null ? 0.18 : 0;
  let hatMesh = null; const hatMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }); S.hat = hat; S.hatTop = 0; S.base = tint != null ? 0.18 : 0; S.base0 = tint ?? 0xffffff;
  build();

  // hat accessories for the hider (lobby choice): one small unlit-free muted mesh on the head bone, none for seekers
  function setHat(h) {
    if (hatMesh) { hatMesh.removeFromParent(); hatMesh.geometry.dispose(); hatMesh = null; }
    S.hat = h; S.hatTop = 0;
    if (!S.inst || S.seeker || !h || h === 'none') return;
    const cfg = { cap: [0x6e3f27, 0.11, 0.6], beanie: [0x4a4a3f, 0.12, 1.1], bucket: [0x6b6648, 0.115, 0.7], crown: [0x9a8442, 0.12, 0.8] }[h]; if (!cfg) return;
    const [col, r, sy] = cfg, g = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, sy, 1);
    hatMesh = new THREE.Mesh(g, hatMat.clone()); hatMesh.material.color.setHex(col); hatMesh.position.set(0, 0.2, 0.01); hatMesh.castShadow = !S.concealed;
    S.inst.bones.head.add(hatMesh); S.hatTop = 0.2 + r * sy - 0.248;
  }

  const headW = new THREE.Vector3();
  function update(dt, { speed = 0, crouch = 0, airborne = false, lookYaw = 0, aimPitch = 0 } = {}) {
    dt = clamp(dt || 0, 0, 0.1); if (!root.visible || !S.inst) return;
    const I = S.inst, T = I.tpl, W = S.w; S.t += dt;
    const cwant = I.phantom ? 0 : (typeof crouch === 'number' ? crouch : crouch ? 1 : 0) > 0.5 || S.mode === 'caged' ? 1 : 0; // discrete: CrouchIdle/CrouchWalk, matching the controller's crouch state
    const sp = S.mode === 'caged' ? 0 : speed;
    S.speed = damp(S.speed, sp, 14, dt);
    S.crouch = damp(S.crouch, cwant, 14, dt);
    S.air = damp(S.air, airborne ? 1 : 0, 14, dt);
    S.look = damp(S.look, clamp(lookYaw, -1.2, 1.2), 10, dt);
    S.pitch = damp(S.pitch, clamp(aimPitch, -1.2, 1.2), 14, dt);
    for (const [k, n] of [['inter', 'interact'], ['vault', 'vault'], ['inj', 'injured'], ['cage', 'caged'], ['down', 'tagged'], ['vic', 'victory']]) W[k] = damp(W[k], S.mode === n ? 1 : 0, k === 'down' ? 8 : 7, dt);
    let tw = 0, hw = 0;
    if (S.taunt >= 0) { S.taunt += dt; const u = S.taunt / 1.2; if (u >= 1) S.taunt = -1; else tw = sstep(Math.min(1, u / 0.15, (1 - u) / 0.15)); }
    if (S.hit >= 0) { S.hit += dt; const u = S.hit / 0.4; if (u >= 1) S.hit = -1; else hw = Math.sin(Math.PI * Math.pow(u, 0.6)); }

    // ---- clip weights ----
    const A = I.actions, s = S.speed, cr = S.crouch, wts = {};
    if (I.phantom) {
      const m = sstep((s - 0.15) / 1.2); wts.HoverIdle = 1 - m; wts.HoverMove = m;
      A.HoverIdle.time = (A.HoverIdle.time + dt) % A.HoverIdle.getClip().duration;
      A.HoverMove.time = (A.HoverMove.time + dt * (0.8 + 0.5 * clamp(s / 4, 0, 1.5))) % A.HoverMove.getClip().duration;
    } else {
      const m = sstep((s - 0.05) / 0.45); // idle -> moving (quick, so the idle pose does not dilute the stride and make the feet slide)
      const r = sstep((s - 3.0) / 2.5); // walk -> run: game walk is 3.9 m/s, sprint 6.8 (the clips' own speeds are far lower, see CAP)
      const stand = 1 - cr;
      wts.Idle = stand * (1 - m); wts.Walk = stand * m * (1 - r); wts.Run = stand * m * r;
      const mc = sstep((s - 0.05) / 0.45);
      wts.CrouchIdle = cr * (1 - mc); wts.CrouchWalk = cr * mc;
      // one phase unit = one foot cycle; distance per cycle blends with the weights, so the planted foot keeps the ground speed
      const stride = stand * ((1 - r) * T.stride.Walk + r * T.stride.Run) + cr * T.stride.CrouchWalk || 1;
      const cps = Math.min(Math.max(0, s) / stride, stand * ((1 - r) * CAP.Walk + r * CAP.Run) + cr * CAP.CrouchWalk); // cycles/s, capped: past the cap the feet slide rather than spin
      S.phase = (S.phase + cps * dt * (1 - 0.6 * S.air)) % 1;
      const setT = (n, p0) => { const a = A[n]; a.time = (((S.phase + p0) % 1) * a.getClip().duration); };
      setT('Walk', T.phase0.Walk || 0); setT('Run', T.phase0.Run || 0); setT('CrouchWalk', T.phase0.CrouchWalk || 0);
      for (const n of ['Idle', 'CrouchIdle']) A[n].time = (A[n].time + dt) % A[n].getClip().duration;
    }
    let tot = 0; for (const n in A) tot += wts[n] || 0; tot = tot || 1;
    for (const n in A) A[n].setEffectiveWeight((wts[n] || 0) / tot);
    I.mixer.update(0);
    I.obj.updateMatrixWorld(true);

    // ---- overlays (no clips for these) ----
    const B = I.bones, lean = 0.5 * W.vault + 0.3 * W.inter + 0.35 * W.inj + 0.55 * W.cage + 0.35 * hw + 0.12 * S.pitch * 0 - 0.1 * W.vic;
    rot(B.spine, AXX, lean * 0.5); rot(B.chest, AXX, lean * 0.5);
    rot(B.head, AXX, 0.3 * W.inj + 0.2 * W.cage - 0.25 * hw + 0.3 * W.inter + S.pitch * 0.5 - lean * 0.3);
    const arms = (bUp, bFa, side) => {
      const wob = Math.sin(S.t * 7 + (side > 0 ? 1.7 : 0)) * 0.12;
      rot(bUp, AXX, -(1.25 + wob) * W.inter - 1.4 * W.vault - 0.9 * W.cage - 3.0 * W.vic - 0.5 * hw);
      rot(bFa, AXX, -0.7 * W.inter - 0.3 * W.vault - 1.9 * W.cage - 0.2 * W.vic);
    };
    arms(B.uaR, B.faR, -1); arms(B.uaL, B.faL, 1);
    if (W.inj > 0.01) { rot(B.uaL, AXX, -0.35 * W.inj); rot(B.faL, AXX, -1.5 * W.inj); } // hand held to the side
    if (tw > 0) { rot(B.uaR, AXZ, -(2.7 + Math.sin(S.t * 14) * 0.4) * tw); rot(B.faR, AXX, -0.5 * tw); } // wave
    // whole body: tagged topples sideways, victory hops, hit knocks back
    pivot.rotation.z = 1.45 * W.down; pivot.position.y = 0.14 * W.down + Math.abs(Math.sin(S.t * 9)) * 0.18 * W.vic; pivot.position.z = -0.1 * hw;
    pivot.scale.y = S.hipC ? mix(1, clamp(S.hipC / TOPS.crouch, 0.85, 1), S.crouch) : 1;
    I.obj.updateMatrixWorld(true);
    B.head.getWorldPosition(headW); S.top = headW.y - root.getWorldPosition(new THREE.Vector3()).y + T.topOffset + S.hatTop;
  }
  function play(name) {
    if (name === 'taunt') S.taunt = 0;
    else if (name === 'hit') S.hit = 0;
    else if (['tagged', 'victory', 'interact', 'vault', 'injured', 'caged'].includes(name)) S.mode = name;
    else if (name === 'reset' || name === 'idle') { S.mode = null; S.hit = S.taunt = -1; }
  }
  const setTint = (c, amount = 0) => { if (amount > 0) { S.tintHex = c; S.tintAmt = clamp(amount, 0, 1) * 0.8; } else { S.tintHex = S.base0; S.tintAmt = S.base; } applyTint(); }; // amount 0 restores the lobby swatch
  // The controller's crouch collider is ~1.0 m, the GLB CrouchIdle top 1.15 m: by default the clip is shown as authored. Passing a lower head-top compresses
  // the model vertically (at most 15%) so a hider can be forced under a grass height; it is a visual aid, not a crouch mechanic.
  const setCrouchHeight = (h) => { S.hipC = h; };
  const setConcealed = (on) => { S.concealed = !!on; if (S.inst) for (const m of S.inst.obj.children) m.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = !on; }); if (hatMesh) hatMesh.castShadow = !on; };
  const setHeld = (on) => { S.held = !!on; applyHeld(); };
  const dispose = () => { if (S.inst) { S.inst.mixer.stopAllAction(); S.inst.mats.forEach((m) => m.dispose()); S.inst.obj.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.dispose(); }); } if (hatMesh) hatMesh.geometry.dispose(); hatMat.dispose(); };
  const api = { kind: 'glb', root, update, play, setSeeker, setTint, setCrouchHeight, setConcealed, setHeld, setHat, headTop: () => S.top, dispose, _S: S };
  return api;
}
if (typeof window !== 'undefined') window.__glb = { templates, clone: cloneSkinned, THREE }; // tests/chars.spec.js
