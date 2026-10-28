// Trial mode 3D props and effects. No point lights anywhere: emissive materials + additive glow sprites keep it cheap.
// buildRoundProps() at round start, clearRoundProps() at the end (disposes everything). All exports are safe at any time.
import * as THREE from 'three';
import { scene } from '../render/renderer.js';
import { burst } from '../render/fx.js';
import { addSystem } from '../core/loop.js';

const C = { relic: 0xffb44d, scream: 0xff3a48, gate: 0x5ec8ff, trap: 0xff6a3d, cage: 0xff3a48, hit: 0xffffff, red: 0xff2a2a, green: 0x39ff7a };
const guard = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.warn('trialfx', e); } };

// ----- shared resources (built lazily, disposed in clearRoundProps)
let R = null;
function res() {
  if (R) return R;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const glow = new THREE.CanvasTexture(cv); glow.colorSpace = THREE.SRGBColorSpace;
  const mkTex = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const scratch = mkTex((g2) => { g2.strokeStyle = 'rgba(235,225,200,.95)'; g2.lineWidth = 3; g2.lineCap = 'round'; for (const [x, a] of [[16, 0.2], [32, -0.1], [48, 0.25]]) { g2.beginPath(); g2.moveTo(x - 8 * a, 8); g2.lineTo(x + 8 * a, 56); g2.stroke(); } });
  const blood = mkTex((g2) => { g2.fillStyle = 'rgba(150,10,16,.95)'; for (let i = 0; i < 7; i++) { g2.beginPath(); g2.arc(14 + Math.random() * 36, 14 + Math.random() * 36, 3 + Math.random() * 8, 0, 7); g2.fill(); } });
  R = {
    glowTex: glow, scratch, blood,
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
    sphere: new THREE.SphereGeometry(1, 12, 10),
    col: new THREE.CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0),
    ring: new THREE.RingGeometry(0.55, 0.7, 48),
    quad: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    iron: new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.6, metalness: 0.7 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x5a3a28, roughness: 0.85, metalness: 0.4 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x4a4650, roughness: 0.95 }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x050508 }),
    pale: new THREE.MeshBasicMaterial({ color: 0xe8e2c8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  return R;
}
const additive = (color, map) => new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
const mesh = (geo, mat, parent, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); parent?.add(m); return m; };
const xz = (o) => (Array.isArray(o) ? { x: o[0], z: o[1] } : { x: o.x, z: o.z });

const own = [];              // everything added to the scene by this module (for clear)
const relics = new Map(), gates = new Map(), cages = new Map(), traps = new Map();
const cols = [];             // light columns {m, mat, t, life, kind}
const ringMat = () => new THREE.ShaderMaterial({
  uniforms: { uP: { value: 0 }, uC: { value: new THREE.Color(C.relic) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform float uP;uniform vec3 uC;varying vec2 vUv;void main(){float a=atan(vUv.x-.5,vUv.y-.5);float f=1.-(a/6.2831853+.5);float on=step(f,uP);gl_FragColor=vec4(uC,mix(.16,.95,on));}',
});
const colMat = (color, a, depthTest) => new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Color(color) }, uA: { value: a }, uT: { value: 0 } }, transparent: true, depthWrite: false, depthTest, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  vertexShader: 'varying float vY;void main(){vY=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform vec3 uC;uniform float uA,uT;varying float vY;void main(){float p=.75+.25*sin(vY*6.-uT*8.);gl_FragColor=vec4(uC,uA*p*(1.-vY*.55));}',
});

function addOwn(o) { scene.add(o); own.push(o); return o; }

// ----- relics: stone pedestal, lantern with emissive core, additive glow, flat progress ring
function buildRelic(r, k) {
  const q = res(), { x, z } = xz(r), id = r.i ?? k, g = new THREE.Group(); g.position.set(x, 0, z);
  mesh(q.cyl, q.stone, g, 0.5, 0.7, 0.5, 0, 0.35, 0); mesh(q.cyl, q.stone, g, 0.62, 0.12, 0.62, 0, 0.06, 0);
  const lan = new THREE.Group(); lan.position.y = 1.15; g.add(lan);
  const core = new THREE.MeshBasicMaterial({ color: C.relic });
  mesh(q.sphere, core, lan, 0.17, 0.24, 0.17);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) mesh(q.box, q.iron, lan, 0.025, 0.5, 0.025, 0.2 * sx, 0, 0.2 * sz);
  mesh(q.box, q.iron, lan, 0.46, 0.04, 0.46, 0, 0.27, 0); mesh(q.box, q.iron, lan, 0.46, 0.04, 0.46, 0, -0.27, 0);
  const spr = new THREE.Sprite(additive(C.relic, q.glowTex)); spr.scale.setScalar(2.6); lan.add(spr);
  const rm = ringMat(), ring = new THREE.Mesh(q.ring, rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.scale.setScalar(1.6); g.add(ring);
  addOwn(g); relics.set(id, { g, lan, core, spr, ring, rm, p: 0, done: false, ph: Math.random() * 6, x, z });
}
export const setRelicProgress = guard((i, p) => {
  const r = relics.get(i); if (!r || r.done) return;
  p = Math.min(1, Math.max(0, +p || 0)); r.p = p; r.rm.uniforms.uP.value = p;
  r.spr.scale.setScalar(2.6 + p * 1.6);
});
export const relicDone = guard((i) => {
  const r = relics.get(i); const pos = r ? { x: r.x, z: r.z } : null; if (!pos) return;
  if (!r.done) {
    r.done = true; r.core.color.setHex(0x3a3328); r.spr.material.color.setHex(0x443820); r.spr.scale.setScalar(1.4); r.ring.visible = false;
  }
  burst(pos.x, 1.2, pos.z, C.relic, 40, 1.1, 3, 0.16); burst(pos.x, 1.2, pos.z, 0xffffff, 16, 0.6, 1.5, 0.1);
  column(pos.x, pos.z, C.relic, 4, { h: 140, r: 0.35, depthTest: true, a: 0.85 });
});

// ----- gates: iron frame, two swinging leaves, lever, red -> green lamp
function buildGate(o, k) {
  const q = res(), { x, z } = xz(o), id = o.i ?? k, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = Math.atan2(-x, -z); // faces the map centre
  const W = 4.6, H = 3.6;
  for (const s of [-1, 1]) { mesh(q.box, q.iron, g, 0.4, H, 0.4, s * W / 2, H / 2, 0); mesh(q.box, q.rust, g, 0.6, 0.25, 0.6, s * W / 2, 0.12, 0); }
  mesh(q.box, q.iron, g, W + 0.4, 0.4, 0.4, 0, H + 0.1, 0); mesh(q.box, q.iron, g, W, 0.12, 0.2, 0, H - 0.4, 0);
  const leaves = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * (W / 2 - 0.2), 0, 0); g.add(piv);
    const lf = new THREE.Group(); lf.position.x = -s * (W / 4 - 0.1); piv.add(lf);
    mesh(q.box, q.iron, lf, W / 2 - 0.3, 0.1, 0.1, 0, 0.5, 0); mesh(q.box, q.iron, lf, W / 2 - 0.3, 0.1, 0.1, 0, H - 0.8, 0);
    for (let b = 0; b < 6; b++) mesh(q.box, q.iron, lf, 0.07, H - 0.8, 0.07, (b / 5 - 0.5) * (W / 2 - 0.5), H / 2 - 0.15, 0);
    leaves.push({ piv, s });
  }
  const lever = new THREE.Group(); lever.position.set(W / 2 + 0.7, 0.9, 0.2); g.add(lever);
  mesh(q.box, q.iron, lever, 0.3, 1.1, 0.3, 0, -0.1, 0); const arm = new THREE.Group(); arm.position.set(0, 0.15, 0.2); lever.add(arm);
  mesh(q.box, q.rust, arm, 0.08, 0.7, 0.08, 0, 0.3, 0); mesh(q.sphere, q.rust, arm, 0.1, 0.1, 0.1, 0, 0.68, 0); arm.rotation.x = -0.6;
  const lampMat = new THREE.MeshBasicMaterial({ color: C.red }); mesh(q.sphere, lampMat, g, 0.22, 0.22, 0.22, 0, H + 0.55, 0);
  const spr = new THREE.Sprite(additive(C.red, q.glowTex)); spr.scale.setScalar(2.4); spr.position.set(0, H + 0.55, 0.1); g.add(spr);
  addOwn(g); gates.set(id, { g, leaves, arm, lampMat, spr, open: 0, want: 0, x, z });
}
export const openGates = guard(() => {
  for (const o of gates.values()) { o.want = 1; o.lampMat.color.setHex(C.green); o.spr.material.color.setHex(C.green); burst(o.x, 3.6, o.z, C.green, 24, 0.9, 2.2, 0.14); }
});

// ----- cages: chain, iron cage with bars, silhouette inside
function buildCage(o, k) {
  const q = res(), { x, z } = xz(o), id = o.i ?? k, g = new THREE.Group(); g.position.set(x, 0, z);
  mesh(q.cyl, q.iron, g, 0.025, 4.4, 0.025, 0, 4.2, 0);
  const c = new THREE.Group(); c.position.y = 1.15; g.add(c);
  mesh(q.cyl, q.iron, c, 0.8, 0.08, 0.8, 0, -1, 0); mesh(q.cyl, q.iron, c, 0.8, 0.08, 0.8, 0, 1, 0); mesh(q.cyl, q.iron, c, 0.12, 0.2, 0.12, 0, 1.12, 0);
  for (let b = 0; b < 10; b++) { const a = (b / 10) * Math.PI * 2; mesh(q.box, q.iron, c, 0.05, 2, 0.05, Math.cos(a) * 0.75, 0, Math.sin(a) * 0.75); }
  const sil = new THREE.Group(); sil.visible = false; c.add(sil);
  mesh(q.sphere, q.shadow, sil, 0.18, 0.2, 0.18, 0, 0.35, 0); mesh(q.cyl, q.shadow, sil, 0.24, 0.5, 0.18, 0, -0.1, 0);
  const rg = new THREE.Sprite(additive(C.cage, q.glowTex)); rg.scale.setScalar(2.2); rg.position.y = 0.1; rg.visible = false; c.add(rg);
  addOwn(g); cages.set(id, { g, c, sil, rg, ph: Math.random() * 6, on: false });
}
export const cageOccupied = guard((i, on) => { const c = cages.get(i); if (c) { c.on = !!on; c.sil.visible = !!on; c.rg.visible = !!on; } });

// ----- vault rim highlight: one InstancedMesh of pale strips
function buildVaults(v) {
  if (!v?.length) return;
  const q = res(), im = new THREE.InstancedMesh(q.box, q.pale, v.length), m = new THREE.Matrix4(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), qt = new THREE.Quaternion();
  v.forEach((w, k) => { const alongX = w.ax === 'x' || w.ax === 0 || w.ax === 'X'; e.set(0, alongX ? 0 : Math.PI / 2, 0); qt.setFromEuler(e); s.set(2.4, 0.06, 0.55); p.set(w.x, 1.22, w.z); m.compose(p, qt, s); im.setMatrixAt(k, m); });
  im.frustumCulled = false; addOwn(im);
}

export const buildRoundProps = guard((o = {}) => {
  clearRoundProps(); res();
  (o.relics || []).forEach(buildRelic); (o.gates || []).forEach(buildGate); (o.cages || []).forEach(buildCage); buildVaults(o.vaults);
});

// ----- light columns: relic beams (depth tested) and beacons (seen through walls)
function column(x, z, color, secs, { h = 90, r = 0.45, depthTest = false, a = 0.7 } = {}) {
  const q = res(), mat = colMat(color, a, depthTest), m = new THREE.Mesh(q.col, mat);
  m.scale.set(r, h, r); m.position.set(x, 0, z); m.frustumCulled = false; m.renderOrder = 20; scene.add(m);
  cols.push({ m, mat, t: 0, life: secs, a, h });
  if (cols.length > 24) dropCol(0);
}
function dropCol(i) { const c = cols[i]; scene.remove(c.m); c.mat.dispose(); cols.splice(i, 1); }
export const beacon = guard((x, z, secs = 5, kind = 'relic') => {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  const color = C[kind] ?? C.relic;
  column(x, z, color, secs, { h: 60, r: kind === 'scream' ? 0.7 : 0.5, depthTest: false, a: 0.6 });
  burst(x, 0.5, z, color, 14, 0.7, 1.5, 0.14);
});

// ----- marks: 60 pooled ground decals, fade over 20 s
const MARKS = 60, MARK_LIFE = 20; let marks = null, markI = 0;
export const mark = guard((x, z, blood) => {
  if (!marks) {
    const q = res(); marks = [];
    for (let i = 0; i < MARKS; i++) { const m = new THREE.Mesh(q.quad, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0 })); m.visible = false; m.renderOrder = 2; scene.add(m); marks.push({ m, age: MARK_LIFE }); }
  }
  const k = marks[markI++ % MARKS], m = k.m;
  m.material.map = blood ? R.blood : R.scratch; m.material.needsUpdate = true;
  m.position.set(x + (Math.random() - 0.5) * 0.3, 0.04, z + (Math.random() - 0.5) * 0.3); m.rotation.y = Math.random() * 6.28; m.scale.setScalar(blood ? 0.5 + Math.random() * 0.3 : 0.7);
  k.age = 0; m.visible = true;
});

// ----- bear traps
export const placeTrap = guard((i, x, z) => {
  const q = res(); removeTrap(i, true);
  const g = new THREE.Group(); g.position.set(x, 0.03, z); g.rotation.y = Math.random() * 6;
  mesh(q.cyl, q.iron, g, 0.4, 0.04, 0.4, 0, 0, 0); mesh(q.cyl, q.rust, g, 0.1, 0.06, 0.1, 0, 0.04, 0);
  const jaws = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(0, 0.04, s * 0.32); g.add(piv);
    const a = new THREE.Group(); piv.add(a); a.position.z = -s * 0.32;
    mesh(q.box, q.rust, a, 0.55, 0.03, 0.04, 0, 0, 0);
    for (let t = 0; t < 6; t++) mesh(q.box, q.iron, a, 0.035, 0.07, 0.03, (t / 5 - 0.5) * 0.5, 0.04, 0);
    a.position.z = -s * 0.3; piv.rotation.x = s * 1.25; // open
    jaws.push({ piv, s });
  }
  addOwn(g); traps.set(i, { g, jaws, snap: -1, gone: false });
});
export const removeTrap = guard((i, instant) => {
  const t = traps.get(i); if (!t) return;
  if (instant) { disposeOne(t.g); traps.delete(i); return; }
  t.snap = 0; // snap shut, then vanish
  burst(t.g.position.x, 0.2, t.g.position.z, 0xcfcfcf, 10, 0.4, 1.2, 0.07);
});
function disposeOne(o) { scene.remove(o); const k = own.indexOf(o); if (k >= 0) own.splice(k, 1); }

// ----- cloak: swap in translucent clones, shimmer, restore on off
const cloaked = new Map();
export const cloakFx = guard((root, on) => {
  if (!root) return;
  if (!on) {
    const c = cloaked.get(root); if (!c) return;
    for (const e of c.list) { e.m.material = e.orig; for (const cl of [].concat(e.clone)) cl.dispose(); }
    cloaked.delete(root); return;
  }
  if (cloaked.has(root)) return;
  const list = [];
  root.traverse((n) => {
    if (!n.isMesh && !n.isSkinnedMesh) return;
    const orig = n.material, clone = Array.isArray(orig) ? orig.map((m) => m.clone()) : orig.clone();
    for (const m of [].concat(clone)) { m.transparent = true; m.depthWrite = false; m.opacity = 0.14; }
    n.material = clone; list.push({ m: n, orig, clone });
  });
  cloaked.set(root, { list, t: Math.random() * 6 });
});

// ----- frame update (registered below at order 41)
export const updateTrialFx = guard((dt) => {
  const t = performance.now() / 1000;
  for (const r of relics.values()) {
    if (r.done) continue;
    r.lan.position.y = 1.15 + Math.sin(t * 1.6 + r.ph) * 0.06; r.lan.rotation.y += dt * 0.6;
    const f = 1 + Math.sin(t * 5 + r.ph) * 0.08; r.spr.material.opacity = 0.75 + Math.sin(t * 3 + r.ph) * 0.2; r.spr.scale.setScalar((2.6 + r.p * 1.6) * f);
  }
  for (const o of gates.values()) {
    o.open += (o.want - o.open) * Math.min(1, dt * 1.6);
    for (const l of o.leaves) l.piv.rotation.y = l.s * o.open * 1.45;
    o.arm.rotation.x = -0.6 + o.open * 1.2;
    if (!o.want) o.spr.material.opacity = 0.6 + Math.sin(t * 4) * 0.3;
  }
  for (const c of cages.values()) { c.c.rotation.y = Math.sin(t * 0.8 + c.ph) * 0.06; c.c.position.y = 1.15 + Math.sin(t * 1.1 + c.ph) * 0.03; if (c.on) { c.rg.material.opacity = 0.5 + Math.sin(t * 6) * 0.25; c.sil.rotation.y = Math.sin(t * 3) * 0.3; } }
  for (const [i, tr] of traps) if (tr.snap >= 0) {
    tr.snap += dt; const k = Math.min(1, tr.snap / 0.1); for (const j of tr.jaws) j.piv.rotation.x = j.s * 1.25 * (1 - k);
    if (tr.snap > 1.4) { disposeOne(tr.g); traps.delete(i); }
  }
  for (let i = cols.length - 1; i >= 0; i--) {
    const c = cols[i]; c.t += dt; c.mat.uniforms.uT.value = c.t;
    const f = Math.min(1, c.t / 0.15) * Math.min(1, (c.life - c.t) / 0.8); c.mat.uniforms.uA.value = c.a * Math.max(0, f);
    if (c.t >= c.life) dropCol(i);
  }
  if (marks) for (const k of marks) if (k.m.visible) { k.age += dt; const a = 1 - k.age / MARK_LIFE; if (a <= 0) k.m.visible = false; else k.m.material.opacity = Math.min(0.9, a * 1.3); }
  for (const c of cloaked.values()) { c.t += dt; const o = 0.1 + 0.08 * (1 + Math.sin(c.t * 9)); for (const e of c.list) for (const m of [].concat(e.clone)) m.opacity = o; }
});
addSystem({ name: 'trialfx', order: 41, update: (dt) => updateTrialFx(dt) });

export const clearRoundProps = guard(() => {
  for (const c of [...cloaked.keys()]) cloakFx(c, false);
  while (cols.length) dropCol(0);
  for (const o of own) { scene.remove(o); o.traverse((n) => { if (n.material && !Object.values(R || {}).includes(n.material)) n.material.dispose?.(); }); if (o.isInstancedMesh) o.dispose(); }
  own.length = 0; relics.clear(); gates.clear(); cages.clear(); traps.clear();
  if (marks) { for (const k of marks) { scene.remove(k.m); k.m.material.dispose(); } marks = null; markI = 0; }
  if (R) { for (const k of Object.keys(R)) { const v = R[k]; if (v?.dispose) v.dispose(); } R = null; }
});
