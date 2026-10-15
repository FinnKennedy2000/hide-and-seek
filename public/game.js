import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWorld, MAPS } from './worlddata.js';
import { showBoss, hideBoss, bossOn } from './bossscreen.js';
import { makeChar, animate, setSeeker, HATS, OUTFITS } from './char.js';

// ======================================================================
// helpers
// ======================================================================
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const turnTo = (cur, target, rate) => {
  const d = ((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return cur + clamp(d, -rate, rate);
};
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };
const cache = {};
const setText = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };

// extension points used by online.js (set after load): update, tick, tag, fire, key, wheel, noise
export const hooks = {};

const SEEK_COUNT = 10, SEEK_TIME = 120, HIDE_COUNT = 20, HIDE_TIME = 90, N_HIDERS = 5;
const HIDER_COLORS = [0xff5a5f, 0x4cc9f0, 0xffd166, 0x80ed99, 0xc77dff];

// ======================================================================
// renderer / scene / post
// ======================================================================
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const PR = Math.min(window.devicePixelRatio || 1, 1.5);
renderer.setPixelRatio(PR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 600);
camera.rotation.order = 'YXZ';
scene.add(camera); // so first-person viewmodels can be parented to it

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.7, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(PR);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ======================================================================
// procedural textures
// ======================================================================
function canvasTex(size, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const speckle = (g, s, n, hue, sat, l0, l1, sz = 2) => {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(${hue + rnd(-8, 8)},${sat + rnd(-8, 8)}%,${rnd(l0, l1)}%)`;
    g.fillRect(Math.random() * s, Math.random() * s, sz, sz + rnd(0, 3));
  }
};
const grassTex = canvasTex(256, (g, s) => { g.fillStyle = '#2a4226'; g.fillRect(0, 0, s, s); speckle(g, s, 5000, 105, 38, 14, 30); }, 36, 36);
const hedgeTex = canvasTex(128, (g, s) => { g.fillStyle = '#1f3a22'; g.fillRect(0, 0, s, s); speckle(g, s, 2500, 110, 40, 12, 32, 3); }, 3, 1);
const plasterTex = canvasTex(128, (g, s) => { g.fillStyle = '#cdbfae'; g.fillRect(0, 0, s, s); speckle(g, s, 1500, 30, 15, 60, 78, 1); }, 1, 1);
const floorTex = canvasTex(256, (g, s) => {
  const n = 8, w = s / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(28,${rnd(35, 45)}%,${rnd(22, 32)}%)`; g.fillRect(i * w, 0, w, s);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(i * w, 0, 2, s);
    for (let k = 0; k < 18; k++) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(i * w + Math.random() * w, Math.random() * s, 1, rnd(10, 60)); }
    g.fillRect(i * w, ((i * 97) % s), w, 2);
  }
}, 8, 6);
const woodTex = canvasTex(128, (g, s) => {
  for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(28,${rnd(30, 42)}%,${rnd(26, 38)}%)`; g.fillRect(0, i * s / 8, s, s / 8); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, i * s / 8, s, 2); }
  speckle(g, s, 300, 28, 30, 18, 30, 1);
});
const bookTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#3b2a20'; g.fillRect(0, 0, s, s);
  for (let r = 0; r < 5; r++) {
    let x = 6;
    while (x < s - 12) {
      const w = rnd(6, 14), h = rnd(30, 44);
      g.fillStyle = `hsl(${rnd(0, 360)},${rnd(35, 65)}%,${rnd(28, 52)}%)`;
      g.fillRect(x, r * 51 + 46 - h, w, h);
      x += w + 1;
    }
    g.fillStyle = '#6a4a32'; g.fillRect(0, r * 51 + 46, s, 5);
  }
});

const M = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
const mat = {
  wall: M(0xffffff, 0.95, { map: plasterTex }),
  floor: M(0xffffff, 0.55, { map: floorTex }),
  grass: M(0xffffff, 1, { map: grassTex }),
  roof: M(0x2b2833, 0.9),
  wood: M(0xffffff, 0.85, { map: woodTex }),
  hedge: M(0xffffff, 1, { map: hedgeTex }),
  fabricRed: M(0x8a3b3f, 1), fabricBlue: M(0x3d5878, 1), fabricGreen: M(0x4e6b4a, 1), white: M(0xe8e4dc, 0.9),
  dark: M(0x2a2630, 0.6), metal: M(0x9aa0aa, 0.35, { metalness: 0.6 }), stone: M(0x8a8790, 0.95, { flatShading: true }),
  leaf: M(0x2f5c36, 0.9, { flatShading: true }), bark: M(0x4a3426, 1), rug: M(0x7a3b4a, 1), counter: M(0xbfb8ad, 0.4),
  glow: new THREE.MeshStandardMaterial({ color: 0x221a10, emissive: 0xffc477, emissiveIntensity: 2.4 }),
  tv: new THREE.MeshStandardMaterial({ color: 0x050508, emissive: 0x3b6cff, emissiveIntensity: 0.9 }),
  car: M(0x1d5c63, 0.35, { metalness: 0.4 }), glass: M(0x10161c, 0.1, { metalness: 0.6 }),
  slate: M(0x777b86, 0.9),
};

// ======================================================================
// world building. Rebuildable: setWorld(mapId) tears the current map down and builds another (see worlddata.js MAPS).
// ======================================================================
const colliders = [], props = []; // {x0,x1,z0,z1,y0,y1} / disguisable furniture (id = index). Refilled IN PLACE by setWorld: other modules import these arrays
const solids = [];             // meshes that block the third-person camera and are sampled by camouflage / prop picking
const propMeshes = [];         // propId -> meshes that make up that prop
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
let world = null, worldKey = null, meta = null; // current map: group holding everything map-specific, its id, its MAPS meta
let bounds = { x0: -23.5, x1: 23.5, z0: -23.5, z1: 23.5 };
let SPOTS = [];                // AI hiding spots of the current map
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
function makePropClone(id) {
  const pr = props[id], g = new THREE.Group();
  for (const m of propMeshes[id]) {
    const c = m.clone(); c.userData = {}; c.matrixAutoUpdate = true;
    c.position.x -= pr.x; c.position.z -= pr.z; c.position.y -= pr.y0;
    g.add(c);
  }
  return g;
}

// ----- sky, sun, ambient (persistent; setWorld retunes them per map)
const sunDir = new THREE.Vector3(-30, 11, -22).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { horizon: { value: new THREE.Color(0x6b4f6e) }, sun: { value: sunDir }, night: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec3 vP; uniform vec3 horizon; uniform vec3 sun; uniform float night;
    void main(){ float h=max(vP.y,0.);
      vec3 mid=mix(vec3(.20,.10,.28), vec3(.025,.035,.07), night), top=mix(vec3(.015,.02,.07), vec3(.008,.011,.03), night);
      vec3 c=mix(horizon, mid, smoothstep(0.,.22,h)); c=mix(c, top, smoothstep(.15,.85,h));
      float s=max(dot(normalize(vP),sun),0.);
      c+=(vec3(1.,.45,.15)*pow(s,10.)*.55+vec3(1.,.7,.35)*pow(s,120.)*1.2)*(1.-night);
      gl_FragColor=vec4(c,1.); }`,
});
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);
  const sp = new Float32Array(900);
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.asin(rnd(0.12, 1));
    sp.set([Math.cos(a) * Math.cos(e) * 400, Math.sin(e) * 400, Math.sin(a) * Math.cos(e) * 400], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
}
const sun = new THREE.DirectionalLight(0xff9a62, 1.9); // the only shadow caster; hidden (no shadow pass at all) on night maps
sun.position.copy(sunDir).multiplyScalar(45);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 5, far: 110 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
scene.add(sun);
const hemi = new THREE.HemisphereLight(0x7a68b0, 0x2a2030, 0.62);
scene.add(hemi);

function applyEnv(m) {
  const f = m.fog;
  scene.fog = f.density ? new THREE.FogExp2(f.color, f.density) : new THREE.Fog(f.color, f.near, f.far);
  skyMat.uniforms.horizon.value.set(f.color);
  skyMat.uniforms.night.value = m.sky === 'night' ? 1 : 0;
  sun.visible = m.sky !== 'night';
  hemi.color.set(m.ambient.color); hemi.groundColor.set(m.ambient.ground ?? m.ambient.color); if (m.ambient.ground == null) hemi.groundColor.multiplyScalar(0.5);
  hemi.intensity = m.ambient.intensity;
  bounds = m.bounds;
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
function setWorld(id) {
  if (!Object.hasOwn(MAPS, id)) id = 'house';
  if (id === worldKey) return;
  clearWorld();
  const map = MAPS[id];
  meta = map.meta;
  for (const [n, spec] of Object.entries(map.materials)) if (!mat[n]) mat[n] = new THREE.MeshStandardMaterial({ metalness: 0, ...spec });
  applyEnv(meta);
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

// ======================================================================
// navigation grid + line of sight
// ======================================================================
const NG = 104, CELL = 0.5, NMIN = -26, NR = 0.3;
const blocked = new Uint8Array(NG * NG);
function buildNav() { // rasterise the current map's low colliders into the grid (rerun by setWorld)
  blocked.fill(0);
  for (const c of colliders) {
    if (c.y0 > 0.69 || c.y1 < 0.15) continue;
    const i0 = Math.max(0, Math.floor((c.x0 - NR - NMIN) / CELL)), i1 = Math.min(NG - 1, Math.ceil((c.x1 + NR - NMIN) / CELL));
    const j0 = Math.max(0, Math.floor((c.z0 - NR - NMIN) / CELL)), j1 = Math.min(NG - 1, Math.ceil((c.z1 + NR - NMIN) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = NMIN + (i + 0.5) * CELL, z = NMIN + (j + 0.5) * CELL;
      if (x > c.x0 - NR && x < c.x1 + NR && z > c.z0 - NR && z < c.z1 + NR) blocked[j * NG + i] = 1;
    }
  }
}
const cellOf = (v) => clamp(Math.floor((v - NMIN) / CELL), 0, NG - 1);
const isBlocked = (x, z) => blocked[cellOf(z) * NG + cellOf(x)] === 1;
function nearestFree(x, z) {
  const ci = cellOf(x), cj = cellOf(z);
  if (!blocked[cj * NG + ci]) return [ci, cj];
  let best = null, bd = 1e9;
  for (let r = 1; r < 10 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= NG || j >= NG || blocked[j * NG + i]) continue;
    const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j]; }
  }
  return best || [ci, cj];
}
const lineFree = (ax, az, bx, bz) => {
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
  for (let k = 1; k < n; k++) { const t = k / n; if (isBlocked(lerp(ax, bx, t), lerp(az, bz, t))) return false; }
  return true;
};
const NEI = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function findPath(sx, sz, gx, gz) {
  const [si, sj] = nearestFree(sx, sz), [gi, gj] = nearestFree(gx, gz);
  const prev = new Int32Array(NG * NG).fill(-2), q = new Int32Array(NG * NG);
  const s = sj * NG + si, g = gj * NG + gi;
  let qh = 0, qt = 0; q[qt++] = s; prev[s] = -1;
  while (qh < qt && prev[g] === -2) {
    const cur = q[qh++], ci = cur % NG, cj = (cur / NG) | 0;
    for (const [di, dj] of NEI) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= NG || j >= NG) continue;
      const n = j * NG + i;
      if (prev[n] !== -2 || blocked[n]) continue;
      if (di && dj && (blocked[cj * NG + i] || blocked[j * NG + ci])) continue;
      prev[n] = cur; q[qt++] = n;
    }
  }
  const pts = [];
  if (prev[g] !== -2) for (let n = g; n !== -1; n = prev[n]) pts.push({ x: NMIN + ((n % NG) + 0.5) * CELL, z: NMIN + (((n / NG) | 0) + 0.5) * CELL });
  pts.reverse();
  pts.unshift({ x: sx, z: sz });
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineFree(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
    out.push(pts[j]); i = j;
  }
  out.push({ x: gx, z: gz });
  return out;
}
// AI hiding spots of the map, minus any the nav grid cannot reach from the seeker start (inside a lorry, behind a sealed gap...):
// findPath would otherwise send a hider straight through the wall.
function setSpots(map) {
  const { x, z } = map.meta.seekerStart, [si, sj] = nearestFree(x, z);
  const seen = new Uint8Array(NG * NG), q = [sj * NG + si]; seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const ci = q[h] % NG, cj = (q[h] / NG) | 0;
    for (const [di, dj] of NEI.slice(0, 4)) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= NG || j >= NG || seen[j * NG + i] || blocked[j * NG + i]) continue;
      seen[j * NG + i] = 1; q.push(j * NG + i);
    }
  }
  SPOTS = map.spots.filter((s) => { const [i, j] = nearestFree(s.x, s.z); return seen[j * NG + i] && Math.hypot(NMIN + (i + 0.5) * CELL - s.x, NMIN + (j + 0.5) * CELL - s.z) < 0.8; }).map((s) => ({ ...s, owner: null }));
  if (SPOTS.length < map.spots.length) console.warn(`${map.meta.id}: ${map.spots.length - SPOTS.length} hiding spots unreachable, skipped`);
  for (const s of SPOTS) for (const c of colliders) {
    if (s.x > c.x0 - 0.2 && s.x < c.x1 + 0.2 && s.z > c.z0 - 0.2 && s.z < c.z1 + 0.2 && c.y0 < 0.4 && c.y1 > 0.4) console.warn('hiding spot overlaps collider', s.name ?? `${s.kind} ${s.x},${s.z}`);
  }
}
function follow(a, speed, dt) { // a: {x,z,path,pi,heading} -> true when done
  if (!a.path || a.pi >= a.path.length) return true;
  let rem = speed * dt;
  while (rem > 0 && a.pi < a.path.length) {
    const t = a.path[a.pi], dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
    if (d > 0.01) a.heading = turnTo(a.heading, Math.atan2(dx, dz), dt * 10);
    if (d <= rem) { a.x = t.x; a.z = t.z; rem -= d; a.pi++; } else { a.x += (dx / d) * rem; a.z += (dz / d) * rem; rem = 0; }
  }
  return a.pi >= a.path.length;
}
function losClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  for (const c of colliders) {
    let t0 = 0, t1 = 1, hit = true;
    for (let k = 0; k < 3 && hit; k++) {
      const o = k === 0 ? ax : k === 1 ? ay : az, d = k === 0 ? dx : k === 1 ? dy : dz;
      const lo = k === 0 ? c.x0 : k === 1 ? c.y0 : c.z0, hi = k === 0 ? c.x1 : k === 1 ? c.y1 : c.z1;
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) hit = false; continue; }
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) hit = false;
    }
    if (hit) return false;
  }
  return true;
}

setWorld('house'); // initial map; the title screen / online rounds switch it

// ======================================================================
// audio (all synthesized)
// ======================================================================
let AC = null, master = null, noiseBuf = null, muted = false;
const setMuted = (m) => { muted = m; if (master) master.gain.value = m ? 0 : 0.8; };
function initAudio() {
  if (AC) { AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, AC.sampleRate * 1.5, AC.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // ambient wind + drone + crickets
    const wind = AC.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const wf = AC.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 350; wf.Q.value = 0.6;
    const wg = AC.createGain(); wg.gain.value = 0.05;
    const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.12; lg.gain.value = 0.03; lfo.connect(lg); lg.connect(wg.gain); lfo.start();
    wind.connect(wf); wf.connect(wg); wg.connect(master); wind.start();
    for (const f of [55, 55.4, 82.5]) {
      const o = AC.createOscillator(), g = AC.createGain(), lp = AC.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 180; g.gain.value = 0.012;
      o.connect(lp); lp.connect(g); g.connect(master); o.start();
    }
    setInterval(() => { if (AC.state === 'running' && Math.random() < 0.7) for (let i = 0; i < 3; i++) tone(4300 + rnd(-80, 80), 0.04, { vol: 0.012, delay: i * 0.07 }); }, 380);
  } catch (e) { console.warn('audio unavailable', e); AC = null; }
}
function spat(pos) {
  if (!pos) return { vol: 1, pan: 0 };
  const dx = pos.x - P.x, dz = pos.z - P.z, d = Math.hypot(dx, dz);
  const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  return { vol: 1 / (1 + d * 0.45), pan: clamp((dx * rx + dz * rz) / Math.max(d, 1), -1, 1) * Math.min(1, d / 2) };
}
function route(node, pan) {
  if (AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; node.connect(p); p.connect(master); } else node.connect(master);
}
function tone(f, dur = 0.15, o = {}) {
  if (!AC) return;
  const { type = 'sine', vol = 0.15, slide = 0, delay = 0, pos } = o, sp = spat(pos);
  if (sp.vol < 0.02) return;
  const t = AC.currentTime + delay, osc = AC.createOscillator(), g = AC.createGain();
  osc.type = type; osc.frequency.setValueAtTime(f, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * sp.vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); route(g, sp.pan); osc.start(t); osc.stop(t + dur + 0.05);
}
function hit(dur, o = {}) {
  if (!AC) return;
  const { freq = 400, q = 1, type = 'lowpass', vol = 0.2, pos, rate = 1 } = o, sp = spat(pos);
  if (sp.vol < 0.02) return;
  const t = AC.currentTime, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  src.buffer = noiseBuf; src.playbackRate.value = rate; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol * sp.vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); route(g, sp.pan); src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
const sfx = {
  step: (vol = 0.25, pos, f = 380) => hit(0.09, { freq: f + rnd(-60, 60), vol, pos }),
  rustle: (pos) => { hit(0.35, { freq: 3200, q: 0.8, type: 'bandpass', vol: 0.18, pos }); hit(0.2, { freq: 2200, q: 1, type: 'bandpass', vol: 0.12, pos, rate: 1.3 }); },
  tick: (hi) => tone(hi ? 880 : 520, 0.12, { type: 'square', vol: 0.07 }),
  found: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.18, delay: i * 0.07 })),
  go: () => [440, 660, 880].forEach((f, i) => tone(f, 0.3, { type: 'sawtooth', vol: 0.1, delay: i * 0.1 })),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.2, delay: i * 0.13 })),
  lose: () => [440, 370, 311, 220].forEach((f, i) => tone(f, 0.5, { type: 'sawtooth', vol: 0.14, delay: i * 0.18 })),
  alert: () => { tone(900, 0.25, { type: 'square', vol: 0.12, slide: 500 }); },
  hb: (v) => { tone(60, 0.12, { vol: 0.35 }); tone(55, 0.12, { vol: 0.28, delay: 0.14 }); },
  land: () => hit(0.15, { freq: 200, vol: 0.35 }),
  puff: (pos) => { hit(0.35, { freq: 1400, q: 0.6, type: 'bandpass', vol: 0.3, pos, rate: 0.7 }); tone(300, 0.25, { vol: 0.12, slide: 500, pos }); },
  scrape: (pos) => hit(0.22, { freq: 900, q: 1.5, type: 'bandpass', vol: 0.09, pos, rate: 0.5 }),
  taunt: (pos) => [523, 659, 523, 784].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.3, delay: i * 0.12, pos })),
  shoot: (pos) => { tone(720, 0.14, { type: 'square', vol: 0.14, slide: -520, pos }); hit(0.1, { freq: 1800, vol: 0.18, pos }); },
  splat: (pos) => hit(0.14, { freq: 900, q: 0.8, type: 'bandpass', vol: 0.3, pos }),
  thud: (pos) => hit(0.12, { freq: 500, vol: 0.25, pos }),
  empty: () => tone(220, 0.05, { type: 'square', vol: 0.1 }),
  reload: () => { tone(300, 0.06, { type: 'square', vol: 0.1 }); tone(450, 0.06, { type: 'square', vol: 0.1, delay: 0.5 }); tone(700, 0.1, { type: 'square', vol: 0.12, delay: 1.1 }); },
  pickup: () => [600, 800, 1000].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.2, delay: i * 0.06 })),
  hurt: () => tone(180, 0.25, { type: 'sawtooth', vol: 0.2, slide: -80 }),
  jump: () => hit(0.08, { freq: 600, vol: 0.1 }),
};

// ======================================================================
// player
// ======================================================================
// mul: speed multiplier (disguised = 0.6); mute: no footstep sound/noise; fixedPh: collision height override (disguise)
const P = { x: 0, y: 0, z: 12, vy: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, crouch: 0, bob: 0, step: 0, air: false, r: 0.3, ph: 1.7, eyeY: 1.6, dist: 0, mul: 1, mute: false, fixedPh: 0 };
const G = { mode: 'seek', phase: 'menu', paused: false, t: 0, cd: 0, found: 0, lastCd: -1, stats: {}, orbit: 0 };
const keys = {};

function resolvePlayer() {
  for (let it = 0; it < 2; it++) for (const c of colliders) {
    if (P.y >= c.y1 - 0.05 || P.y + P.ph <= c.y0) continue;
    const cx = clamp(P.x, c.x0, c.x1), cz = clamp(P.z, c.z0, c.z1);
    let dx = P.x - cx, dz = P.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= P.r * P.r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (P.r - d) / d; P.x += dx * k; P.z += dz * k; }
    else { // center inside box: push out through nearest face
      const l = P.x - c.x0, r = c.x1 - P.x, t = P.z - c.z0, b = c.z1 - P.z, m = Math.min(l, r, t, b);
      if (m === l) P.x = c.x0 - P.r; else if (m === r) P.x = c.x1 + P.r; else if (m === t) P.z = c.z0 - P.r; else P.z = c.z1 + P.r;
    }
  }
}
function updatePlayer(dt, canMove) {
  const crouching = canMove && keys.KeyC;
  const sprint = canMove && (keys.ShiftLeft || keys.ShiftRight) && !crouching;
  P.crouch = lerp(P.crouch, crouching ? 1 : 0, Math.min(1, dt * 10));
  P.ph = P.fixedPh || lerp(1.7, 1.0, P.crouch); P.eyeY = lerp(1.6, 0.85, P.crouch);
  const ix = canMove ? (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) : 0, iz = canMove ? (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0) : 0;
  const len = Math.hypot(ix, iz) || 1, speed = (crouching ? 2.0 : sprint ? 6.8 : 3.9) * P.mul;
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw);
  const tx = ((ix * c + iz * s) / len) * speed, tz = ((-ix * s + iz * c) / len) * speed;
  const k = Math.min(1, dt * (P.air ? 3 : 12));
  P.vx = lerp(P.vx, tx, k); P.vz = lerp(P.vz, tz, k);
  P.x += P.vx * dt; P.z += P.vz * dt;
  P.x = clamp(P.x, bounds.x0, bounds.x1); P.z = clamp(P.z, bounds.z0, bounds.z1);
  // vertical
  let ground = 0;
  for (const co of colliders) if (P.x > co.x0 - 0.1 && P.x < co.x1 + 0.1 && P.z > co.z0 - 0.1 && P.z < co.z1 + 0.1 && co.y1 <= P.y + 0.3 && co.y1 <= 1.2) ground = Math.max(ground, co.y1);
  if (canMove && keys.Space && !P.air && P.crouch < 0.5) { P.vy = 6.3; P.air = true; sfx.jump(); }
  P.vy -= 22 * dt; P.y += P.vy * dt;
  if (P.y <= ground) { if (P.air && P.vy < -3 && !P.mute) { sfx.land(); noise(P.x, P.z, 8); } P.y = ground; P.vy = 0; P.air = false; } else if (P.y > ground + 0.05) P.air = true;
  resolvePlayer();
  // footsteps + noise
  const sp = Math.hypot(P.vx, P.vz);
  if (sp > 0.6 && !P.air) {
    P.step += sp * dt; P.bob += sp * dt * 2.4; P.dist += sp * dt;
    const stride = crouching ? 1.1 : sprint ? 1.9 : 1.5;
    if (P.step > stride && !P.mute) {
      P.step = 0;
      sfx.step(crouching ? 0.06 : sprint ? 0.3 : 0.18, null, sprint ? 450 : 340);
      noise(P.x, P.z, crouching ? 1.5 : sprint ? 14 : 5.5);
      if (sprint) G.stats.loud = (G.stats.loud || 0) + 1;
    }
  }
  camera.fov = lerp(camera.fov, sprint && sp > 3 ? 79 : 72, Math.min(1, dt * 6)); camera.updateProjectionMatrix();
  camera.position.set(P.x, P.y + P.eyeY + Math.sin(P.bob) * 0.035 * Math.min(1, sp / 3), P.z);
  camera.rotation.set(P.pitch, P.yaw, 0);
  return { crouching, sprint };
}
const noises = [];
function noise(x, z, r) {
  if (G.mode === 'hide' && G.phase === 'play') noises.push({ x, z, r });
  hooks.noise?.(x, z, r);
}

// ======================================================================
// characters
// ======================================================================
const hiders = [];
function makeIcon(txt, col) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(txt, 32, 34); g.fillStyle = col; g.fillText(txt, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const iconTex = { q: makeIcon('?', '#ffd166'), x: makeIcon('!', '#ff4d5e') };

// seeker
const S = { x: 0, z: 7.8, heading: Math.PI, state: 'count', path: null, pi: 0, timer: 0, detect: 0, visited: new Set(), lastSeen: null, repath: 0, lostT: 0, stepT: 0, spot: null };
const seekerGroup = new THREE.Group();
{
  const body = makeChar(0xb3202e, { seeker: true }); seekerGroup.add(body); S.body = body;
  const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), M(0x222222)); fl.rotation.x = Math.PI / 2; fl.position.set(0.32, 0.9, 0.35); seekerGroup.add(fl);
  const coneH = 12, coneR = coneH * Math.tan(THREE.MathUtils.degToRad(35));
  const cg = new THREE.ConeGeometry(coneR, coneH, 28, 1, true); cg.translate(0, -coneH / 2, 0); cg.rotateX(-Math.PI / 2);
  S.coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
  S.cone = new THREE.Mesh(cg, S.coneMat); S.cone.position.y = 1.5; S.cone.scale.y = 0.35; S.cone.frustumCulled = false; seekerGroup.add(S.cone);
  const sl = new THREE.SpotLight(0xffe2a8, 60, 16, 0.62, 0.5, 1.6); sl.position.set(0.3, 1.3, 0.3); sl.target.position.set(0.3, 0.8, 8);
  seekerGroup.add(sl, sl.target); S.light = sl;
  S.icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex.q, transparent: true, depthWrite: false })); S.icon.scale.set(0.6, 0.6, 1); S.icon.position.y = 2.5; S.icon.visible = false; seekerGroup.add(S.icon);
  seekerGroup.visible = false; scene.add(seekerGroup);
}

const fx = [];
function burst(x, y, z, color, n = 28, life = 0.8, spread = 2, size = 0.12) {
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { pos.set([x, y, z], i * 3); vel.push(rnd(-spread, spread), rnd(0.5, 2) * spread, rnd(-spread, spread)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false }));
  p.frustumCulled = false; scene.add(p); fx.push({ p, vel, life, l0: life });
}

// ======================================================================
// game flow
// ======================================================================
const hud = $('hud');
function toast(msg, color) { const t = $('toast'); t.textContent = msg; t.style.color = color || '#fff'; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
function show(id, on) { $(id).classList.toggle('hidden', !on); }
function requestLock() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* headless / no gesture */ } }

function freeSpot(avoid) {
  const f = SPOTS.filter((s) => !s.owner && (!avoid || Math.hypot(s.x - avoid.x, s.z - avoid.z) > 10));
  return pick(f.length ? f : SPOTS.filter((s) => !s.owner));
}
function sendHider(h, spot, speed) {
  if (h.spot) h.spot.owner = null;
  h.spot = spot; spot.owner = h;
  h.path = findPath(h.x, h.z, spot.x, spot.z); h.pi = 0; h.speed = speed;
}
function reset(mode) {
  G.mode = mode; G.t = 0; G.found = 0; G.stats = { bolts: 0, spotted: 0, loud: 0 }; G.paused = false;
  G.phase = 'countdown'; G.cd = mode === 'seek' ? SEEK_COUNT : HIDE_COUNT; G.lastCd = -1;
  const map = MAPS[worldKey], ss = meta.seekerStart, away = (r) => { const f = map.spawns.filter((s) => Math.hypot(s[0] - ss.x, s[1] - ss.z) > r); return pick(f.length ? f : map.spawns); };
  const [hx, hz] = away(6); // hide mode: you start at a spawn point, the seeker at the map's seeker start
  Object.assign(P, { x: mode === 'seek' ? ss.x : hx, y: 0, z: mode === 'seek' ? ss.z : hz, vx: 0, vz: 0, vy: 0, yaw: mode === 'seek' ? ss.yaw : 0, pitch: 0, crouch: 0, dist: 0 });
  noises.length = 0; P.dist = 0;
  for (const h of hiders) scene.remove(h.mesh);
  hiders.length = 0; SPOTS.forEach((s) => { s.owner = null; });
  seekerGroup.visible = false;
  if (mode === 'seek') {
    const chosen = map.mix.flatMap(([kind, n]) => shuffle(SPOTS.filter((s) => s.kind === kind)).slice(0, n)); // e.g. 3 house + 2 garden
    if (chosen.length < N_HIDERS) chosen.push(...shuffle(SPOTS.filter((s) => !chosen.includes(s))).slice(0, N_HIDERS - chosen.length));
    shuffle(chosen).forEach((spot, i) => {
      const mesh = makeChar(HIDER_COLORS[i], { hat: pick(HATS), pattern: pick(OUTFITS) }); scene.add(mesh);
      const [sx, sz] = away(4);
      const h = { mesh, x: sx, z: sz, heading: Math.PI, state: 'run', s: 1, found: false, nextPeek: 0, peekT: 0, fleeCd: 4, spot: null, path: null, pi: 0, speed: 5.5, color: HIDER_COLORS[i] };
      sendHider(h, spot, 5.5); hiders.push(h);
    });
  } else {
    Object.assign(S, { x: ss.x, z: ss.z, heading: Math.PI, state: 'count', path: null, pi: 0, timer: 0, detect: 0, lastSeen: null, lostT: 0 });
    S.visited.clear(); seekerGroup.visible = true;
  }
  $('blackout').classList.toggle('on', mode === 'seek');
  setText('modeLabel', mode === 'seek' ? 'SEEK' : 'HIDE');
  $('found').style.display = mode === 'seek' ? '' : 'none'; $('seekerState').style.display = mode === 'hide' ? '' : 'none';
  $('detectWrap').classList.remove('show'); $('crosshair').classList.remove('hot'); $('prompt').classList.remove('show');
  $('timer').classList.remove('low');
  $('blackmsg').textContent = mode === 'seek' ? 'THE HIDERS ARE RUNNING...' : '';
  setText('timer', fmt(mode === 'seek' ? SEEK_TIME : HIDE_TIME)); cache.found = null; cache.banner = null;
}
function startGame(mode) {
  initAudio(); enterFull();
  setWorld(spMap);
  reset(mode);
  show('title', false); show('end', false); show('hud', true);
  requestLock();
}
function endGame(win, title, sub) {
  G.phase = 'end';
  document.exitPointerLock?.();
  (win ? sfx.win : sfx.lose)();
  $('blackout').classList.remove('on'); $('detectWrap').classList.remove('show');
  $('endTitle').textContent = title; $('endTitle').style.color = win ? '#80ed99' : '#ff4d5e'; $('endSub').textContent = sub;
  const st = G.mode === 'seek'
    ? [['TIME', fmt(G.t)], ['FOUND', `${G.found}/${N_HIDERS}`], ['BOLTS', G.stats.bolts]]
    : [['SURVIVED', `${Math.floor(G.t)}s`], ['SPOTTED', G.stats.spotted], ['LOUD STEPS', G.stats.loud]];
  $('endStats').innerHTML = st.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  show('hud', false); show('end', true);
}
function toMenu() { setWorld(spMap); G.phase = 'menu'; G.paused = false; leaveFull(); show('end', false); show('hud', false); show('title', true); $('blackout').classList.remove('on'); document.exitPointerLock?.(); seekerGroup.visible = false; hiders.forEach((h) => { h.mesh.visible = false; }); }
const inGame = () => G.phase === 'countdown' || G.phase === 'play';
// Fullscreen + keyboard lock so Ctrl+W / Ctrl+T etc. reach the game instead of the browser (needs a user gesture)
function enterFull() {
  try { document.documentElement.requestFullscreen?.()?.then(() => navigator.keyboard?.lock?.()).catch(() => {}); } catch { /* unsupported */ }
}
function leaveFull() {
  try { navigator.keyboard?.unlock?.(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { /* ignore */ }
}
// pause = the fake "work" screen. Single-player freezes; online keeps running in the background.
function openBoss() {
  for (const k in keys) keys[k] = false;
  setMuted(true); document.exitPointerLock?.();
  showBoss({
    onResume: closeBoss,
    onQuit: () => { hideBoss(); setMuted(false); G.paused = false; toMenu(); },
    onLeave: G.mode === 'online' && hooks.leave ? () => { hideBoss(); setMuted(false); hooks.leave(); } : null,
  });
}
function closeBoss() { hideBoss(); setMuted(false); G.paused = false; if (inGame()) requestLock(); }
function pause() { if (G.mode === 'online' || bossOn()) return; if (inGame() && !G.paused) { G.paused = true; openBoss(); } }
// block leaving the tab by accident while a round or room is live
addEventListener('beforeunload', (e) => { if (inGame() || hooks.inRoom?.()) { e.preventDefault(); e.returnValue = ''; } });

// ----- input
addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') { // instant boss key, from anywhere (also while typing)
    e.preventDefault();
    if (bossOn()) return closeBoss();
    if (G.mode !== 'online' && inGame()) G.paused = true;
    return openBoss();
  }
  if (bossOn()) { if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Tab') { e.preventDefault(); closeBoss(); } return; }
  if (e.target.tagName === 'INPUT') return; // typing in the online name / room-code fields
  if (e.ctrlKey || e.metaKey || e.altKey) { if (inGame()) e.preventDefault(); return; } // game keys never double as browser shortcuts
  if (inGame() && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'KeyE', 'KeyF', 'KeyG', 'KeyR', 'KeyT', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(e.code)) e.preventDefault();
  if ((e.code === 'KeyP' || e.code === 'Tab') && !e.repeat && inGame()) { if (G.mode === 'online') openBoss(); else pause(); return; }
  keys[e.code] = true;
  if (!e.repeat && G.mode === 'online') hooks.key?.(e.code);
  if (e.code === 'KeyE' && !e.repeat) tryTag();
  if (e.code === 'Escape') pause();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; pause(); });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || G.paused) return;
  P.yaw -= e.movementX * 0.0022; P.pitch = clamp(P.pitch - e.movementY * 0.0022, -1.5, 1.5);
});
addEventListener('mousedown', () => {
  if (bossOn()) return;
  if (G.phase !== 'play' && G.phase !== 'countdown') return;
  if (G.paused) return;
  if (document.pointerLockElement !== canvas) requestLock(); else if (G.mode === 'online') hooks.fire?.(); else tryTag();
});
addEventListener('wheel', (e) => { if (G.mode === 'online' && !G.paused) hooks.wheel?.(Math.sign(e.deltaY)); }, { passive: true });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas) pause(); });
// single-player map choice on the title screen (the lobby has its own picker in online.js)
let spMap = 'house';
function renderMapPick() {
  const box = $('spMap'); box.textContent = '';
  for (const [id, m] of Object.entries(MAPS)) {
    const b = document.createElement('button'); b.className = 'chip' + (id === spMap ? ' on' : ''); b.textContent = m.meta.name.toUpperCase();
    b.onclick = () => { spMap = id; setWorld(id); $('titleSub').textContent = m.meta.blurb; renderMapPick(); };
    box.append(b);
  }
}
renderMapPick();
$('btnSeek').onclick = () => startGame('seek'); $('btnHide').onclick = () => startGame('hide');
$('btnAgain').onclick = () => startGame(G.mode); $('btnMenu').onclick = toMenu;

// ----- tagging
function chest(h) { return h.s * 0.62; }
function tagTarget() {
  if (G.mode !== 'seek' || G.phase !== 'play') return null;
  const cp = Math.cos(P.pitch), fx_ = -Math.sin(P.yaw) * cp, fy = Math.sin(P.pitch), fz = -Math.cos(P.yaw) * cp;
  const ex = camera.position.x, ey = camera.position.y, ez = camera.position.z;
  let best = null, bd = 0.87;
  for (const h of hiders) {
    if (h.found) continue;
    for (const yy of [chest(h), h.s * 1.0]) {
      const dx = h.x - ex, dy = yy - ey, dz = h.z - ez, d = Math.hypot(dx, dy, dz);
      if (d > 3.2) continue;
      const dot = (dx * fx_ + dy * fy + dz * fz) / d;
      if (dot > bd && losClear(ex, ey, ez, h.x, yy, h.z)) { bd = dot; best = h; }
    }
  }
  return best;
}
function tryTag() {
  if (G.mode === 'online') return hooks.tag?.();
  const h = tagTarget(); if (!h) return;
  h.found = true; h.state = 'found'; h.popT = 0.3; G.found++;
  if (h.spot) { h.spot.owner = null; h.spot = null; }
  sfx.found(); burst(h.x, 0.8, h.z, h.color);
  toast(G.found === N_HIDERS ? 'ALL FOUND!' : `FOUND ${G.found}/${N_HIDERS}`, '#ffb44d');
  if (G.found === N_HIDERS) setTimeout(() => G.phase === 'play' && endGame(true, 'YOU FOUND THEM ALL', `Cleared in ${fmt(G.t)}`), 700);
}

// ----- hiders
function updateHiders(dt) {
  for (const h of hiders) {
    if (h.found) { // pop out
      h.popT -= dt; h.mesh.scale.setScalar(1 + (0.3 - Math.max(h.popT, 0)) * 3); if (h.popT <= 0) h.mesh.visible = false; continue;
    }
    const dP = Math.hypot(P.x - h.x, P.z - h.z);
    switch (h.state) {
      case 'run': case 'flee':
        h.s = lerp(h.s, 1, dt * 8);
        if (follow(h, h.speed, dt)) { h.state = 'hide'; h.nextPeek = rnd(5, 12); h.fleeCd = 3; }
        else if (Math.random() < dt * 8) sfx.step(0.1, h, 420);
        break;
      case 'hide':
        h.s = lerp(h.s, 0.55, dt * 8);
        if (G.phase !== 'play') break;
        h.nextPeek -= dt; h.fleeCd -= dt;
        if (h.nextPeek <= 0) { h.state = 'peek'; h.peekT = 1.4; sfx.rustle(h); }
        else if (dP < 2.6 && h.fleeCd <= 0 && Math.random() < dt * 0.9 && losClear(camera.position.x, 1.0, camera.position.z, h.x, 0.5, h.z)) {
          sendHider(h, freeSpot({ x: P.x, z: P.z }), 6.2); h.state = 'flee'; G.stats.bolts++; sfx.rustle(h);
        }
        break;
      case 'peek':
        h.s = lerp(h.s, 1, dt * 10); h.heading = turnTo(h.heading, Math.atan2(P.x - h.x, P.z - h.z), dt * 4);
        h.peekT -= dt; if (h.peekT < 0) { h.state = 'hide'; h.nextPeek = rnd(6, 14); }
        break;
    }
    h.mesh.position.set(h.x, 0, h.z); h.mesh.rotation.y = h.heading;
    animate(h.mesh, dt, { speed: h.state === 'run' || h.state === 'flee' ? h.speed : 0, crouch: clamp((1 - h.s) / 0.45, 0, 1) });
  }
}

// ----- seeker AI
function seekerGo(x, z, state, speed) { S.path = findPath(S.x, S.z, x, z); S.pi = 0; S.state = state; S.speed = speed; }
function nextSearch() {
  let c = SPOTS.filter((s) => !S.visited.has(s));
  if (!c.length) { S.visited.clear(); c = SPOTS.slice(); }
  c.sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z));
  const s = pick(c.slice(0, 3)); S.visited.add(s); S.spot = s;
  const d = Math.hypot(s.x - S.x, s.z - S.z);
  // stop short of the spot so he looks at it rather than standing on it
  const k = d > 1.8 ? (d - 1.5) / d : 0;
  seekerGo(lerp(S.x, s.x, k), lerp(S.z, s.z, k), 'patrol', 2.7);
}
function seekerEyeSees(tx, ty, tz) { return losClear(S.x, 1.5, S.z, tx, ty, tz); }
function updateSeeker(dt) {
  if (G.phase === 'countdown') { S.heading = Math.PI; }
  else {
    // vision
    const fx_ = Math.sin(S.heading), fz = Math.cos(S.heading), dx = P.x - S.x, dz = P.z - S.z, d = Math.hypot(dx, dz);
    let vis = false;
    if (d < 12 && (d < 1.1 || (dx * fx_ + dz * fz) / d > Math.cos(THREE.MathUtils.degToRad(35)))) {
      vis = seekerEyeSees(P.x, P.y + P.eyeY, P.z) || seekerEyeSees(P.x, P.y + P.ph * 0.5, P.z) || seekerEyeSees(P.x, P.y + 0.25, P.z);
    }
    if (vis) {
      S.detect = Math.min(1.05, S.detect + dt / 0.6); S.lastSeen = { x: P.x, z: P.z }; S.lostT = 0;
      if (S.state !== 'chase') { S.state = 'chase'; S.repath = 0; G.stats.spotted++; sfx.alert(); toast('HE SPOTTED YOU - RUN!', '#ff4d5e'); }
      if (d < 1.0) S.detect = 1.05;
    } else S.detect = Math.max(0, S.detect - dt * 0.9);
    if (S.detect >= 1) { endGame(false, 'CAUGHT!', 'The seeker got you.'); return; }
    // hearing
    for (const n of noises) {
      if (S.state === 'chase') break;
      if (Math.hypot(n.x - S.x, n.z - S.z) < n.r) { seekerGo(n.x + rnd(-1.5, 1.5), n.z + rnd(-1.5, 1.5), 'investigate', 3.6); S.heardT = 0; }
    }
    noises.length = 0;
    // state machine
    switch (S.state) {
      case 'chase':
        S.repath -= dt;
        if (vis) { if (S.repath <= 0) { S.path = findPath(S.x, S.z, P.x, P.z); S.pi = 0; S.repath = 0.3; } follow(S, 5.1, dt); }
        else { S.lostT += dt; follow(S, 5.1, dt); if (S.lostT > 2.5 || S.pi >= S.path.length) { if (S.lastSeen) seekerGo(S.lastSeen.x, S.lastSeen.z, 'investigate', 3.6); else nextSearch(); S.lostT = 0; } }
        break;
      case 'patrol': case 'investigate':
        if (follow(S, S.speed, dt)) { const patrol = S.state === 'patrol'; S.state = 'look'; S.timer = 2.2; S.base = patrol && S.spot ? Math.atan2(S.spot.x - S.x, S.spot.z - S.z) : S.heading; }
        break;
      case 'look':
        S.timer -= dt; S.heading = S.base + Math.sin((2.2 - S.timer) * 3) * 0.9;
        if (S.timer <= 0) nextSearch();
        break;
      case 'count': nextSearch(); break;
    }
    if (S.state === 'patrol' || S.state === 'investigate' || S.state === 'chase') {
      S.stepT -= dt * (S.state === 'chase' ? 5.1 : S.speed);
      if (S.stepT <= 0) { S.stepT = 1.4; sfx.step(0.35, S, 300); }
    }
  }
  seekerGroup.position.set(S.x, 0, S.z); seekerGroup.rotation.y = S.heading;
  animate(S.body, dt, { speed: G.phase === 'countdown' ? 0 : S.state === 'chase' ? 5.1 : S.state === 'patrol' || S.state === 'investigate' ? S.speed : 0 });
  S.coneMat.color.setHex(S.state === 'chase' ? 0xff4d5e : S.detect > 0.05 ? 0xffb44d : 0xffe9a0);
  S.coneMat.opacity = S.state === 'chase' ? 0.12 : 0.07;
  S.light.color.setHex(S.state === 'chase' ? 0xff8a8a : 0xffe2a8);
  S.icon.visible = S.state === 'chase' || S.state === 'investigate' || S.state === 'look';
  S.icon.material.map = S.state === 'chase' ? iconTex.x : iconTex.q;
}

// ======================================================================
// main update
// ======================================================================
let hb = 0;
function update(dt) {
  const seek = G.mode === 'seek';
  // phases
  if (G.phase === 'countdown') {
    G.cd -= dt;
    const n = Math.ceil(G.cd);
    if (n !== G.lastCd) {
      G.lastCd = n;
      if (seek) { const b = $('bigcount'); b.textContent = Math.max(n, 0); b.classList.remove('tick'); void b.offsetWidth; b.classList.add('tick'); }
      if (n > 0) sfx.tick(n <= 3);
    }
    if (G.cd <= 0) {
      G.phase = 'play'; G.t = 0; sfx.go();
      if (seek) { hiders.forEach((h) => { if (h.state === 'run') { h.x = h.spot.x; h.z = h.spot.z; h.state = 'hide'; h.nextPeek = rnd(4, 9); h.s = 0.55; } }); $('blackout').classList.remove('on'); toast('FIND THEM ALL!', '#ffb44d'); }
      else toast('READY OR NOT, HERE HE COMES', '#ffb44d');
      setText('banner', '');
    } else if (!seek) setText('banner', `SEEKER IS COUNTING... ${n}   -   FIND A HIDING SPOT`);
  } else if (G.phase === 'play') {
    G.t += dt;
    const left = (seek ? SEEK_TIME : HIDE_TIME) - G.t;
    setText('timer', fmt(left)); $('timer').classList.toggle('low', left <= 15);
    if (left <= 0) { if (seek) endGame(false, "TIME'S UP", `You found ${G.found} of ${N_HIDERS}.`); else endGame(true, 'YOU SURVIVED', `The seeker never found you in ${HIDE_TIME}s.`); return; }
  }
  const frozen = seek && G.phase === 'countdown';
  const { crouching } = updatePlayer(dt, !frozen);
  if (seek) {
    updateHiders(dt);
    setText('found', `FOUND ${G.found} / ${N_HIDERS}`);
    const t = tagTarget();
    $('crosshair').classList.toggle('hot', !!t); $('prompt').classList.toggle('show', !!t);
  } else {
    updateSeeker(dt);
    const lab = { count: 'COUNTING', patrol: 'SEARCHING', look: 'LOOKING AROUND', investigate: 'INVESTIGATING A NOISE', chase: 'CHASING YOU' }[S.state];
    setText('seekerState', 'SEEKER: ' + lab); $('seekerState').style.color = S.state === 'chase' ? '#ff4d5e' : S.state === 'investigate' ? '#ffd166' : '#fff';
    $('detectWrap').classList.toggle('show', S.detect > 0.02); $('detectFill').style.width = `${Math.min(1, S.detect) * 100}%`;
    setText('detectLabel', crouching ? 'SPOTTED (crouched)' : 'SPOTTED');
    if (S.detect > 0.05) { hb -= dt; if (hb <= 0) { sfx.hb(); hb = lerp(0.8, 0.25, S.detect); } }
  }
}

// fluorescent strips (lights whose colour is the map's `flicker` colour): jitter intensity, with the odd brief dropout
function updateFlicker(dt) {
  for (const f of flickers) {
    f.dip -= dt;
    if (f.dip <= 0 && Math.random() < dt * 0.25) f.dip = 0.05 + Math.random() * 0.12;
    f.l.intensity = f.base * (f.dip > 0 ? 0.15 + Math.random() * 0.3 : 0.92 + Math.random() * 0.08);
  }
}
const clock = new THREE.Clock();
let lastErrToast = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (G.phase === 'menu' || G.phase === 'end') {
    G.orbit += dt * 0.08;
    camera.position.set(Math.cos(G.orbit) * 30, 8 + Math.sin(G.orbit * 2), Math.sin(G.orbit) * 30);
    camera.lookAt(0, 2.5, 0); camera.fov = 60; camera.updateProjectionMatrix();
    if (G.phase === 'end') { for (const h of hiders) if (!h.found) h.mesh.visible = true; }
  } else if (!G.paused) {
    try { (G.mode === 'online' ? hooks.update : update)(dt); } catch (e) {
      console.error('update error', e);
      const t = performance.now(); if (t - lastErrToast > 5000) { lastErrToast = t; toast('Something went wrong', '#ff4d5e'); }
    }
  }
  hooks.tick?.(dt);
  updateFlicker(dt);
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], a = f.p.geometry.attributes.position; f.life -= dt;
    for (let k = 0; k < a.count; k++) { f.vel[k * 3 + 1] -= 9 * dt; a.setXYZ(k, a.getX(k) + f.vel[k * 3] * dt, Math.max(0, a.getY(k) + f.vel[k * 3 + 1] * dt), a.getZ(k) + f.vel[k * 3 + 2] * dt); }
    a.needsUpdate = true; f.p.material.opacity = Math.max(0, f.life / f.l0);
    if (f.life <= 0) { scene.remove(f.p); f.p.geometry.dispose(); f.p.material.dispose(); fx.splice(i, 1); }
  }
  composer.render();
}
frame();
const worldId = () => worldKey;
export { THREE, renderer, setWorld, worldId, scene, camera, canvas, P, G, keys, colliders, props, solids, makePropClone, losClear, makeChar, sfx, burst, toast, show, fmt, setText, requestLock, initAudio, updatePlayer, toMenu, enterFull, $ };
