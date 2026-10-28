// Procedural workwear humans for the dusk logging compound. Each character is ONE SkinnedMesh (one draw call, vertex colours,
// rigid binding) on a small bone rig, lit by the scene lights like the world: no emissive, rim or outline on anything a hider wears.
// Faces -Z (char.js turns it). Animation is code: planted-foot 2-bone IK driven by distance travelled (no foot sliding), smoothed
// blends between idle / walk / sprint / crouch / interact / vault / injured / caged. No DOM, no renderer imports (Node-testable).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const HATS = ['none', 'cap', 'beanie', 'bucket', 'crown']; // 'crown' is a hard hat: the name is kept because menus and the server use it
export const OUTFITS = ['plain', 'stripes', 'dots', 'overalls'];  // plain coat, plaid flannel, leather vest, denim overalls
export const SEEKER_CLASSES = ['tracker', 'phantom', 'trapper', 'charger'];
export const STAND_TOP = 1.77;   // head-top height (m) standing, no hat
export const CROUCH_TOP = 0.98;  // default head-top height fully crouched (55% of STAND_TOP); setCrouchHeight changes it per character

const V = THREE.Vector3, TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const mix = (a, b, t) => a + (b - a) * t;
const sstep = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

// ---- muted palette: the lobby colour only picks a swatch + a small lightness shift ----
const JACKETS = [0x5a5f3a, 0x7a4a2e, 0x3f5568, 0x6b5a45, 0x4a4f52, 0x44503a, 0x7d6f3c, 0x5e3a36];
const PANTS = [0x3a3f45, 0x4a4034, 0x2f3e4e, 0x4b4b3c];
const SKINS = [0xc9a27e, 0xa87a58, 0x7a5237, 0xe0b896];
const HAIRS = [0x2a2118, 0x4a3524, 0x6b5a45, 0x1c1c1e];
const COAT = { tracker: 0x2e3328, phantom: 0x1c1d22, trapper: 0x4a3626, charger: 0x3a2a26 };
const hashOf = (c) => { let h = (c | 0) ^ 0x9e3779b9; h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) >>> 0; };
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

// ---- skeleton: rest pose is standing straight; the legs are 2 x 0.45 m ----
const L1 = 0.45, L2 = 0.45, HIP = 0.88, ANKLE = 0.02;
const BONES = [ // name, parent, x, y, z
  ['hips', null, 0, HIP, 0], ['cloak', 'hips', 0, 0, 0],
  ['thighL', 'hips', -0.1, 0, 0], ['kneeL', 'thighL', 0, -L1, 0], ['footL', 'kneeL', 0, -L2, 0],
  ['thighR', 'hips', 0.1, 0, 0], ['kneeR', 'thighR', 0, -L1, 0], ['footR', 'kneeR', 0, -L2, 0],
  ['torso', 'hips', 0, 0.05, 0], ['head', 'torso', 0, 0.58, 0],
  ['armL', 'torso', -0.21, 0.5, 0], ['elbowL', 'armL', 0, -0.29, 0], ['handL', 'elbowL', 0, -0.27, 0],
  ['armR', 'torso', 0.21, 0.5, 0], ['elbowR', 'armR', 0, -0.29, 0], ['handR', 'elbowR', 0, -0.27, 0],
];
const lanternGlass = new THREE.MeshBasicMaterial({ color: 0xd9a24a }); // a seeker's own lantern, the only unlit thing on a character
const lanternGeo = new THREE.BoxGeometry(0.06, 0.08, 0.06);

function makeSkeleton() {
  const root = new THREE.Group(), by = {}, list = [];
  for (const [n, p, x, y, z] of BONES) { const b = new THREE.Bone(); b.name = n; b.position.set(x, y, z); (p ? by[p] : root).add(b); by[n] = b; list.push(b); }
  root.updateMatrixWorld(true);
  const rest = Object.fromEntries(list.map((b) => [b.name, b.matrixWorld.clone()])); // rest-pose world matrices: geometry is always baked against these
  return { root, by, list, rest, index: Object.fromEntries(BONES.map((b, i) => [b[0], i])) };
}

// geometry for one look. `add` bakes a primitive into bone-local space, colours it and binds it rigidly to that bone.
function buildGeometry(sk, cfg) {
  const geos = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const add = (geo, bone, p, hex, o = {}) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.deleteAttribute('uv');
    m4.compose(new V(...p), q.setFromEuler(e.set(...(o.r || [0, 0, 0]))), new V(...(o.s || [1, 1, 1]))).premultiply(sk.rest[bone]);
    g.applyMatrix4(m4);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), c = new THREE.Color(hex), pos = g.attributes.position;
    for (let i = 0; i < n; i++) {
      const k = o.pat ? o.pat(pos.getX(i), pos.getY(i), pos.getZ(i)) : 1;
      col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k; si[i * 4] = sk.index[bone]; sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geos.push(g);
  };
  const box = (w, h, d, sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  const cyl = (rt, rb, h, seg = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const sph = (r, top = false) => new THREE.SphereGeometry(r, 12, 8, 0, TAU, 0, top ? Math.PI / 2 : Math.PI);
  const { jacket, pants, skin, hair, hat, outfit, cls } = cfg, X = Math.PI / 2;
  const boot = 0x2b2620, glove = 0x4a3a2a, leather = 0x3b2a1e, iron = 0x30302f, burlap = 0x7a6a4a;
  const plaid = (x, y) => 1 - 0.2 * (Math.floor(x * 14) & 1) - 0.2 * (Math.floor(y * 14) & 1);
  const coat = cls ? COAT[cls] : jacket;
  const body = outfit === 'overalls' && !cls ? shade(jacket, 1.1) : coat;
  const legs = outfit === 'overalls' && !cls ? 0x3b5063 : cls ? shade(coat, 0.8) : pants;

  // legs, boots
  for (const s of ['L', 'R']) {
    add(box(0.3, 0.2, 0.2), 'hips', [0, 0, 0], legs);
    add(cyl(0.078, 0.066, L1, 8), 'thigh' + s, [0, -L1 / 2, 0], legs);
    add(cyl(0.064, 0.056, L2, 8), 'knee' + s, [0, -L2 / 2, 0], legs);
    add(box(0.11, 0.17, 0.27), 'foot' + s, [0, 0.055, -0.05], boot);
  }
  // torso (coat), neck, head
  add(box(0.42, 0.55, 0.24, 6, 8, 3), 'torso', [0, 0.25, 0], body, { pat: outfit === 'stripes' && !cls ? (x, y) => plaid(x, y) : null });
  add(box(0.44, 0.1, 0.26), 'torso', [0, 0.02, 0], shade(body, 0.8)); // hem
  add(cyl(0.05, 0.055, 0.1, 8), 'head', [0, -0.03, 0], skin);
  add(sph(0.115), 'head', [0, 0.12, 0], skin, { s: [0.94, 1.1, 1] });
  add(sph(0.121, true), 'head', [0, 0.135, 0.012], hair, { s: [1, 0.9, 1] });
  add(box(0.03, 0.045, 0.03), 'head', [0, 0.1, -0.115], shade(skin, 0.92)); // nose
  for (const x of [-0.04, 0.04]) add(box(0.022, 0.014, 0.01), 'head', [x, 0.14, -0.108], 0x1a1612);
  // arms: sleeves, gloves
  for (const s of ['L', 'R']) {
    add(cyl(0.058, 0.05, 0.29, 8), 'arm' + s, [0, -0.145, 0], body);
    add(cyl(0.05, 0.044, 0.27, 8), 'elbow' + s, [0, -0.135, 0], body);
    add(sph(0.05), 'hand' + s, [0, -0.03, 0], glove);
  }
  if (!cls && outfit === 'dots') { // leather work vest with pockets
    add(box(0.45, 0.4, 0.27), 'torso', [0, 0.3, 0], leather);
    for (const x of [-0.12, 0.12]) add(box(0.1, 0.09, 0.03), 'torso', [x, 0.15, -0.14], shade(leather, 1.3));
  }
  if (!cls && outfit === 'overalls') {
    add(box(0.3, 0.3, 0.02), 'torso', [0, 0.2, -0.125], legs);
    for (const x of [-0.11, 0.11]) add(box(0.05, 0.4, 0.26), 'torso', [x, 0.35, 0], legs);
  }
  // hats (hiders)
  if (!cls) {
    if (hat === 'cap') { add(sph(0.127, true), 'head', [0, 0.15, 0], 0x6e3f27); add(box(0.2, 0.014, 0.12), 'head', [0, 0.15, -0.14], 0x5a3320); }
    else if (hat === 'beanie') add(sph(0.13, true), 'head', [0, 0.14, 0], 0x4a4a3f, { s: [1, 1.15, 1] });
    else if (hat === 'bucket') { add(cyl(0.12, 0.125, 0.1, 12), 'head', [0, 0.21, 0], 0x6b6648); add(cyl(0.2, 0.2, 0.014, 14), 'head', [0, 0.17, 0], 0x6b6648); }
    else if (hat === 'crown') { add(sph(0.13, true), 'head', [0, 0.15, 0], 0x9a8442); add(box(0.04, 0.02, 0.26), 'head', [0, 0.27, 0], 0x867236); add(box(0.2, 0.014, 0.1), 'head', [0, 0.15, -0.13], 0x867236); }
  }
  // ---- seeker classes: distinct silhouettes ----
  if (cls === 'tracker') { // long coat, wide hat, hound-scarf, lantern in the left hand
    add(cyl(0.24, 0.3, 0.6, 10, true), 'cloak', [0, -0.3, 0], shade(coat, 0.9));
    add(cyl(0.22, 0.22, 0.014, 14), 'head', [0, 0.2, 0], 0x25231f); add(cyl(0.11, 0.12, 0.12, 12), 'head', [0, 0.26, 0], 0x25231f);
    add(new THREE.TorusGeometry(0.1, 0.045, 6, 12), 'head', [0, -0.03, 0], 0x7a3b2a, { r: [X, 0, 0] });
    add(box(0.09, 0.3, 0.03), 'torso', [0.05, 0.38, -0.13], 0x7a3b2a); add(box(0.09, 0.22, 0.03), 'torso', [-0.04, 0.42, -0.13], 0x6a3022);
    add(new THREE.TorusGeometry(0.035, 0.007, 4, 8, Math.PI), 'handL', [0, -0.14, 0], iron, { r: [0, X, 0] });
    add(box(0.07, 0.1, 0.07), 'handL', [0, -0.2, 0], iron);
  } else if (cls === 'phantom') { // hooded cloak, no visible face
    add(cyl(0.2, 0.3, 0.62, 12, true), 'torso', [0, 0.27, 0], coat, { s: [1, 1, 0.9] });
    add(cyl(0.3, 0.43, 0.7, 12, true), 'cloak', [0, -0.3, 0], coat);
    add(sph(0.16), 'head', [0, 0.13, 0.02], coat, { s: [1, 1.12, 1.05] });
    add(new THREE.ConeGeometry(0.11, 0.2, 8), 'head', [0, 0.1, 0.17], coat, { r: [X + 0.3, 0, 0] });
    add(sph(0.095), 'head', [0, 0.125, -0.06], 0x050507);
    for (const s of ['L', 'R']) add(cyl(0.09, 0.07, 0.3, 8), 'arm' + s, [0, -0.14, 0], coat);
  } else if (cls === 'trapper') { // sack on the back, bandolier, trap at the belt, flat cap
    add(sph(0.2), 'torso', [0, 0.3, 0.24], burlap, { s: [1.1, 1.3, 0.9] }); add(box(0.12, 0.05, 0.1), 'torso', [0, 0.62, 0.24], shade(burlap, 0.7));
    add(box(0.08, 0.62, 0.02), 'torso', [0, 0.27, -0.125], leather, { r: [0, 0, 0.65] });
    add(new THREE.TorusGeometry(0.08, 0.018, 5, 10), 'hips', [0.2, -0.05, 0.02], iron, { r: [0, X, 0] }); add(box(0.1, 0.02, 0.12), 'hips', [0.2, -0.05, 0.02], iron);
    add(sph(0.125, true), 'head', [0, 0.14, 0], 0x2a2620); add(box(0.2, 0.014, 0.1), 'head', [0, 0.15, -0.14], 0x2a2620);
    add(box(0.2, 0.1, 0.06), 'head', [0, 0.06, -0.09], 0x3a342a); // neck rag over the lower face
  } else if (cls === 'charger') { // broad, bulky, leather apron, heavy mallet
    for (const x of [-0.27, 0.27]) add(sph(0.14), 'torso', [x, 0.48, 0], shade(coat, 1.15));
    add(box(0.5, 0.45, 0.3), 'torso', [0, 0.28, 0], shade(coat, 1.1));
    add(box(0.38, 0.85, 0.02), 'torso', [0, -0.03, -0.14], leather);
    for (const s of ['L', 'R']) { add(cyl(0.085, 0.07, 0.29, 8), 'arm' + s, [0, -0.145, 0], coat); add(cyl(0.07, 0.06, 0.27, 8), 'elbow' + s, [0, -0.135, 0], coat); }
    add(box(0.1, 0.04, 0.26), 'head', [0, 0.17, 0], 0x1d1a17); // leather skullcap
    add(cyl(0.025, 0.025, 1.0, 6), 'handR', [0, -0.04, 0.4], 0x4a3a28, { r: [X, 0, 0] });
    add(box(0.2, 0.2, 0.34), 'handR', [0, -0.04, 0.95], iron);
  }
  return mergeGeometries(geos, false);
}

export function createCharacter({ color = 0x4cc9f0, hat = 'none', outfit = 'plain', seeker = false, cls = null } = {}) {
  if (!HATS.includes(hat)) hat = 'none';
  if (!OUTFITS.includes(outfit)) outfit = 'plain';
  const h = hashOf(color), sk = makeSkeleton(), B = sk.by;
  const look = { jacket: shade(JACKETS[h % 8], 0.94 + ((h >>> 3) % 7) * 0.02), pants: PANTS[(h >>> 6) % 4], skin: SKINS[(h >>> 9) % 4], hair: HAIRS[(h >>> 12) % 4], hat, outfit };
  const S = { seeker: false, cls: 'tracker', move: 0, run: 0, crouch: 0, air: 0, look: 0, pitch: 0, phase: 0, t: Math.random() * 10, taunt: -1, hit: -1, mode: null,
    w: { inter: 0, vault: 0, inj: 0, cage: 0, down: 0, vic: 0 }, hipC: CROUCH_TOP - 0.58, top: STAND_TOP, lastSpeed: 0 };

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), mat);
  mesh.castShadow = true; mesh.frustumCulled = false; // bounds change with the pose
  mesh.add(B.hips); mesh.bind(new THREE.Skeleton(sk.list));
  const pivot = new THREE.Group(); pivot.rotation.y = Math.PI; pivot.add(mesh); // character faces -Z, game faces +Z
  const root = new THREE.Group(); root.add(pivot);
  let extra = [], hatTop = hat === 'none' ? 0 : hat === 'cap' ? 0.03 : hat === 'beanie' ? 0.02 : 0.06;

  function rebuild() {
    mesh.geometry.dispose(); mesh.geometry = buildGeometry(sk, { ...look, cls: S.seeker ? S.cls : null });
    for (const x of extra) x.parent.remove(x); extra = [];
    if (S.seeker && S.cls === 'tracker') { const l = new THREE.Mesh(lanternGeo, lanternGlass); l.position.set(0, -0.2, 0); B.handL.add(l); extra.push(l); }
    hatTop = S.seeker ? { tracker: 0.12, phantom: 0.08, trapper: 0.03, charger: 0.05 }[S.cls] : hat === 'none' ? 0 : hat === 'cap' ? 0.03 : hat === 'beanie' ? 0.02 : 0.06;
    pivot.scale.setScalar(S.seeker ? { tracker: 1, phantom: 1.03, trapper: 0.98, charger: 1.1 }[S.cls] : 1);
  }
  function setSeeker(v, c) {
    v = !!v; if (SEEKER_CLASSES.includes(c)) S.cls = c;
    const next = v ? S.cls : null; if (next === S.cur) return;
    S.seeker = v; S.cur = next; rebuild();
  }
  S.seeker = !!seeker; if (SEEKER_CLASSES.includes(cls)) S.cls = cls; rebuild(); S.cur = S.seeker ? S.cls : null;

  const ft = { L: { x: -0.11, y: ANKLE, z: 0 }, R: { x: 0.11, y: ANKLE, z: 0 } };
  function legIK(s, hipY, hipZ) {
    const t = ft[s], dy = t.y - hipY, dz = t.z - hipZ, d = clamp(Math.hypot(dy, dz), 0.2, L1 + L2 - 0.002);
    const cK = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1), cB = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const th = Math.atan2(-dz, -dy) + Math.acos(cB), kn = -(Math.PI - Math.acos(cK));
    B['thigh' + s].rotation.x = th; B['knee' + s].rotation.x = kn; B['foot' + s].rotation.x = -(th + kn);
  }
  // planted foot: travels back at body speed while on the ground (linear), swings forward with a lift
  function stepFoot(p, A, lift) {
    p = ((p % TAU) + TAU) % TAU;
    if (p < Math.PI) return [-A + (2 * A * p) / Math.PI, 0];
    const u = (p - Math.PI) / Math.PI, e = sstep(u); return [A - 2 * A * e, Math.sin(Math.PI * u) * lift];
  }

  function update(dt, { speed = 0, crouch = 0, airborne = false, lookYaw = 0, aimPitch = 0 } = {}) {
    dt = clamp(dt || 0, 0, 0.1); if (!root.visible) return;
    S.t += dt;
    const c = typeof crouch === 'number' ? clamp(crouch, 0, 1) : crouch ? 1 : 0, W = S.w;
    S.move = damp(S.move, speed > 0.15 ? clamp(speed / 1.2, 0, 1) : 0, 10, dt);
    S.run = damp(S.run, clamp((speed - 2.5) / 2.5, 0, 1), 6, dt);
    S.crouch = damp(S.crouch, c, 12, dt);
    S.air = damp(S.air, airborne ? 1 : 0, 14, dt);
    S.look = damp(S.look, clamp(lookYaw, -1.2, 1.2), 10, dt);
    S.pitch = damp(S.pitch, clamp(aimPitch, -1.2, 1.2), 14, dt);
    for (const [k, n] of [['inter', 'interact'], ['vault', 'vault'], ['inj', 'injured'], ['cage', 'caged'], ['down', 'tagged'], ['vic', 'victory']]) W[k] = damp(W[k], S.mode === n ? 1 : 0, k === 'down' ? 8 : 7, dt);
    let tw = 0, hw = 0;
    if (S.taunt >= 0) { S.taunt += dt; const u = S.taunt / 1.2; if (u >= 1) S.taunt = -1; else tw = sstep(Math.min(1, u / 0.15, (1 - u) / 0.15)); }
    if (S.hit >= 0) { S.hit += dt; const u = S.hit / 0.4; if (u >= 1) S.hit = -1; else hw = Math.sin(Math.PI * Math.pow(u, 0.6)); }
    const cr = S.crouch * (1 - S.air), run = S.run, m = S.move, grounded = 1 - S.air, t = S.t;
    const lim = W.inj; // injured: shorter, uneven steps

    // stride: half-length A (m); the phase advances with distance so the planted foot matches the ground speed
    const A = clamp(0.1 + 0.11 * speed, 0.05, 0.44) * (1 - 0.45 * cr) * (1 - 0.35 * lim), Ae = A * m;
    if (speed > 0.1) S.phase += Math.min(22, (Math.PI * speed) / (2 * A)) * dt * (0.4 + 0.6 * m);
    const lift = (0.07 + 0.07 * run) * (1 - 0.4 * cr) * (1 - 0.3 * lim);
    const fL = stepFoot(S.phase, Ae, lift), fR = stepFoot(S.phase + Math.PI * (1 - 0.25 * lim), Ae * (1 - 0.35 * lim), lift * (1 - 0.5 * lim));
    const idleZ = 0.03 * (1 - m);
    ft.L.z = fL[0] - idleZ - 0.06 * cr; ft.L.y = ANKLE + fL[1]; ft.R.z = fR[0] + idleZ - 0.06 * cr; ft.R.y = ANKLE + fR[1];
    ft.L.x = -0.11 - 0.03 * cr; ft.R.x = 0.11 + 0.03 * cr;

    let hipY = mix(HIP - 0.03 * m * (0.5 + 0.5 * Math.cos(2 * S.phase)) - 0.012 * Math.sin(t * 1.8) * (1 - m), S.hipC, cr);
    let lean = mix(0.03 + 0.13 * run * m, 1.0, cr), hipZ = 0.12 * cr, headX = 0.8 * lean * cr;
    // air: tuck the legs
    if (S.air > 0.01) { ft.L.y = mix(ft.L.y, ANKLE + 0.2, S.air); ft.L.z = mix(ft.L.z, -0.15, S.air); ft.R.y = mix(ft.R.y, ANKLE + 0.12, S.air); ft.R.z = mix(ft.R.z, 0.12, S.air); }
    // vault: one knee up and over, body pitched forward and low
    if (W.vault > 0.01) { const w = W.vault; ft.L.y = mix(ft.L.y, 0.5, w); ft.L.z = mix(ft.L.z, -0.28, w); ft.R.y = mix(ft.R.y, 0.2, w); ft.R.z = mix(ft.R.z, 0.12, w); hipY = mix(hipY, 0.68, w); lean = mix(lean, 0.6, w); }
    // caged: kneeling, hugging the knees
    if (W.cage > 0.01) { const w = W.cage; ft.L.y = mix(ft.L.y, 0.1, w); ft.L.z = mix(ft.L.z, 0.2, w); ft.R.y = mix(ft.R.y, 0.1, w); ft.R.z = mix(ft.R.z, 0.2, w); hipY = mix(hipY, 0.4, w); lean = mix(lean, 0.5, w); hipZ = mix(hipZ, 0.2, w); }
    if (W.inter > 0.01) { hipY = mix(hipY, hipY - 0.06, W.inter); lean = mix(lean, lean + 0.22, W.inter); }
    if (lim > 0.01) { hipY -= 0.05 * lim; lean = mix(lean, Math.max(lean, 0.38), lim); }
    lean += 0.35 * hw; lean = clamp(lean, -0.2, 1.3);
    hipY = Math.max(0.3, hipY);

    B.hips.position.set(0, hipY, hipZ);
    B.cloak.scale.y = clamp(hipY / HIP, 0.4, 1);
    legIK('L', hipY, hipZ); legIK('R', hipY, hipZ);
    const tz = Math.sin(S.phase) * 0.12 * run * m * grounded;
    B.torso.rotation.set(-lean, tz, Math.sin(t * 1.3) * 0.015 * (1 - m) + Math.sin(S.phase) * 0.03 * m);
    B.head.rotation.set(headX + S.pitch * 0.6 + 0.35 * lim + 0.2 * W.cage - 0.25 * hw + 0.3 * W.inter, clamp(S.look, -0.9, 0.9) * 0.6 - tz, 0);

    // arms: swing against the legs; modes pull them to their poses
    const carryL = S.seeker && S.cls === 'tracker', carryR = S.seeker && S.cls === 'charger', ph = Math.sin(S.phase);
    const nL = fL[0] / Math.max(Ae, 0.05), nR = fR[0] / Math.max(Ae, 0.05), amp = (0.45 + 0.35 * run) * m * grounded;
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? -1 : 1, a = B['arm' + s], e = B['elbow' + s];
      let sx = -(s === 'L' ? nR : nL) * amp, ex = 0.12 + 0.55 * run * m, sz = sg * (0.07 + 0.1 * cr);
      sx = mix(sx, 0.7, S.air); sz = mix(sz, sg * 1.5, S.air * 0.7);
      if ((s === 'L' && carryL) || (s === 'R' && carryR)) { sx = mix(sx * 0.3, s === 'L' ? 0.35 : 0.3, 0.9); ex = mix(ex, s === 'L' ? 0.9 : 1.0, 0.9) - 0.7 * cr; }
      if (S.seeker && S.cls === 'phantom') { sx *= 0.4; sz = sg * 0.16; }
      const wob = Math.sin(t * 7 + (sg > 0 ? 1.7 : 0)) * 0.12;
      sx = mix(sx, 1.25 + wob, W.inter); ex = mix(ex, 0.7, W.inter); sz = mix(sz, sg * 0.15, W.inter);
      sx = mix(sx, 1.0, W.vault); ex = mix(ex, 0.3, W.vault);
      sx = mix(sx, 0.9, W.cage); ex = mix(ex, 1.9, W.cage); sz = mix(sz, sg * 0.1, W.cage);
      if (s === 'L') { sx = mix(sx, 0.35, lim); ex = mix(ex, 1.5, lim); sz = mix(sz, 0.3, lim); } // hand held to the side
      sx = mix(sx, 3.0, W.vic); sz = mix(sz, sg * 0.35, W.vic); ex = mix(ex, 0.2, W.vic);
      sx += 0.5 * hw; sz = mix(sz, sg * (0.9 + 0.5 * hw), hw);
      if (s === 'R' && tw > 0) { sx = mix(sx, 0, tw); sz = mix(sz, 2.7 + Math.sin(t * 14) * 0.4, tw); ex = mix(ex, 0.5, tw); }
      a.rotation.set(sx, 0, sz); e.rotation.set(ex, 0, 0);
    }

    // whole-body: tagged topples sideways, victory hops; yaw wiggle on taunt
    pivot.rotation.z = 1.45 * W.down; pivot.position.y = 0.14 * W.down + Math.abs(Math.sin(t * 9)) * 0.18 * W.vic;
    pivot.position.z = 0.1 * hw;
    S.top = hipY + 0.63 * Math.cos(lean) + 0.245 * Math.cos(headX - lean + S.pitch * 0.6) + hatTop;
    S.lastSpeed = speed;
  }

  function play(name) {
    if (name === 'taunt') S.taunt = 0;
    else if (name === 'hit') S.hit = 0;
    else if (['tagged', 'victory', 'interact', 'vault', 'injured', 'caged'].includes(name)) S.mode = name;
    else if (name === 'reset' || name === 'idle') { S.mode = null; S.hit = S.taunt = -1; }
  }
  const setTint = (c, amount = 0) => { mat.color.set(0xffffff).lerp(new THREE.Color(c), clamp(amount, 0, 1) * 0.8); }; // multiplies the muted vertex colours
  const setCrouchHeight = (h) => { S.hipC = clamp(h - 0.58, 0.28, 0.7); }; // head-top height (m) when fully crouched; hats add a few cm on top
  const setConcealed = (on) => { mesh.castShadow = !on; }; // a concealed player must not cast a shadow shape out of the grass
  const dispose = () => { mesh.geometry.dispose(); mat.dispose(); for (const x of extra) x.parent?.remove(x); };
  update(0, {});
  return { kind: 'procedural', root, update, play, setSeeker, setTint, setCrouchHeight, setConcealed, headTop: () => S.top, dispose };
}
