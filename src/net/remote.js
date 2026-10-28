// Avatars (character or disguised prop) for the local hider and for remote players, plus snapshot interpolation.
import * as THREE from 'three';
import { scene, camera as cam } from '../render/renderer.js';
import { burst } from '../render/fx.js';
import { makePropClone } from '../world/build.js';
import { makeChar, setSeeker as charSeeker, tintChar, animate, taunt as charTaunt, flinch as charFlinch, paintChar, clearPaint, playChar, setConcealed } from '../characters/index.js';

// Remote players are drawn in the past on the SERVER's clock: every snapshot carries the server time, `clock` maps it to local time
// (tracking the fastest packets) and the delay grows with measured jitter, so a late packet is absorbed instead of rubber-banding.
const INTERP_MIN = 0.1, INTERP_MAX = 0.3;
const clock = { st0: null, off: 0, jit: 0, delay: INTERP_MIN };
export const interpDelay = () => clock.delay;
export const resetClock = () => { clock.st0 = null; clock.jit = 0; clock.delay = INTERP_MIN; };
// call once per snapshot with its server ms and the local arrival time (s); returns the snapshot's time in server seconds
export function syncClock(stMs, local) {
  if (clock.st0 === null) { clock.st0 = stMs; clock.off = local; clock.jit = 0; }
  const s = ((stMs - clock.st0) | 0) / 1000, d = local - s;
  clock.off = Math.min(d, clock.off + 0.001);                 // fastest packet = best estimate; creeps up to follow drift and route changes
  clock.jit += (d - clock.off - clock.jit) * 0.1;             // smoothed lateness vs the fastest packet
  clock.delay += (Math.min(INTERP_MAX, INTERP_MIN + 2 * clock.jit) - clock.delay) * 0.05;
  return s;
}
export const remotes = new Map(); // id -> avatar
if (typeof window !== "undefined" && new URLSearchParams(location.search).has("debug")) window.__remotes = remotes; // debug hook (playtests)
export const opts = { cone: true, hideHiders: false, grass: [] }; // set per round by online.js (grass: trial concealment rects, set by modes/trial.js)
const rnd = (a, b) => a + Math.random() * (b - a);

const coneH = 5;
const coneGeo = new THREE.ConeGeometry(coneH * Math.tan(THREE.MathUtils.degToRad(30)), coneH, 20, 1, true);
coneGeo.translate(0, -coneH / 2, 0); coneGeo.rotateX(-Math.PI / 2); // apex at origin, opens toward +z
const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
const lampGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), lampMat = new THREE.MeshStandardMaterial({ color: 0x222222 });

function nameTag(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(name, 128, 34); g.fillStyle = '#fff'; g.fillText(name, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  // depthTest stays on, so walls hide tags (a hider must not be visible through a wall)
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(1, 0.25, 1); s.position.y = 2.0;
  return s;
}

// an avatar is a character that can be swapped for a clone of a world prop (disguise) and tinted (camouflage)
export function makeAvatar(name, color, seeker, hat, pattern, cls = null) {
  const root = new THREE.Group();
  const body = makeChar(color, { hat, pattern, seeker, cls }); root.add(body);
  const light = new THREE.Group();
  const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.rotation.x = Math.PI / 2; lamp.position.set(0.4, 1.0, 0.4);
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.set(0.4, 1.0, 0.55); cone.frustumCulled = false;
  light.add(lamp, cone); root.add(light);
  const tag = name ? nameTag(name) : null; if (tag) root.add(tag);
  scene.add(root);
  const a = { root, body, light, tag, seeker: false, prop: null, propId: null, tintHex: null, anim: { speed: 0, crouch: 0, air: false, vy: 0, lat: 0 }, wobT: rnd(20, 40), wob: 0, bounce: 0 };
  a.setSeeker = (on, c) => setSeekerLook(a, on, c);
  setSeekerLook(a, seeker);
  return a;
}
function setSeekerLook(a, on, cls) {
  a.seeker = on; charSeeker(a.body, on, cls); a.light.visible = on && opts.cone;
}
export function disposeAvatar(a) {
  a.body.ch.dispose();
  scene.remove(a.root); setDisguise(a, null);
  if (a.tag) { a.tag.material.map.dispose(); a.tag.material.dispose(); }
}

function freeProp(a) {
  if (!a.prop) return;
  a.prop.traverse((m) => { if (m.userData.own) m.material.dispose(); });
  a.root.remove(a.prop); a.prop = null;
}
// propId null: back to the character
export function setDisguise(a, propId) {
  freeProp(a);
  a.propId = propId; a.body.visible = propId == null;
  tintAvatar(a, null);
  if (propId != null) { a.prop = makePropClone(propId); a.root.add(a.prop); a.wobT = rnd(20, 40); a.wob = 0; }
}
// hex null restores the original colours
export function tintAvatar(a, hex) {
  a.tintHex = hex;
  if (!a.prop) return tintChar(a.body, hex);
  const c = hex == null ? null : new THREE.Color(hex);
  a.prop.traverse((m) => {
    if (!m.isMesh) return;
    if (!c) { if (m.userData.own) { m.material.dispose(); m.material = m.userData.orig; m.userData.own = false; } return; }
    if (!m.userData.own) { m.userData.orig = m.material; m.material = m.material.clone(); m.userData.own = true; }
    m.material.map = null; m.material.color.copy(m.userData.orig.color).lerp(c, 0.9); m.material.needsUpdate = true;
  });
}
export const tauntAvatar = (a) => { if (a.prop) a.bounce = 0.6; else charTaunt(a.body); };
export const flinchAvatar = (a) => charFlinch(a.body);
export function paintAvatar(a, color) { paintChar(a.body, color); }
export function reveal(a) { setDisguise(a, null); }
export const resetLook = (a) => { clearPaint(a.body); };

// per-frame animation of the character, or the tiny "settle" wobble / taunt bounce of a prop
export function animAvatar(a, dt) {
  if (!a.prop) { animate(a.body, dt, a.anim); return; }
  a.wobT -= dt;
  if (a.wobT <= 0) { a.wobT = rnd(20, 40); a.wob = 0.7; } // idle disguised props settle now and then: a tell
  if (a.wob > 0) { a.wob -= dt; const k = Math.max(0, a.wob) / 0.7; a.prop.rotation.z = Math.sin(a.wob * 30) * 0.05 * k; a.prop.rotation.x = Math.sin(a.wob * 23) * 0.03 * k; }
  if (a.bounce > 0) { a.bounce -= dt; a.prop.position.y = Math.abs(Math.sin(Math.max(0, a.bounce) * 10)) * 0.25; }
}

export function addRemote(id, name, color, seeker, hat, pattern, cls = null) {
  removeRemote(id);
  const a = makeAvatar(name, color, seeker, hat, pattern, cls);
  Object.assign(a, { id, buf: [], x: 0, y: 0, z: 0, c: 0, px: null, py: 0, pz: 0, gone: true }); // hidden until the server first sends it (interest management)
  a.root.visible = false;
  remotes.set(id, a);
  return a;
}
// tagged: topples briefly (the tagged player becomes a seeker), victory: results-screen dance for the winners
export function tagPose(id) {
  const a = remotes.get(id); if (!a || a.prop) return;
  playChar(a.body, 'tagged'); setTimeout(() => { if (remotes.get(id) === a) playChar(a.body, 'reset'); }, 1500);
}
export const victoryPose = (id) => { const a = remotes.get(id); if (a && !a.prop) playChar(a.body, 'victory'); };
export const setSeeker = (id, on) => { const a = remotes.get(id); if (a) setSeekerLook(a, on); };
export function removeRemote(id) {
  const a = remotes.get(id); if (!a) return;
  disposeAvatar(a); remotes.delete(id);
}
export function clearRemotes() { for (const id of [...remotes.keys()]) removeRemote(id); }

// t: server seconds (syncClock). The server only sends a player when its state changed, so after a quiet spell hold the last pose
// until just before the new sample instead of gliding across the whole gap.
export function pushSnap(id, t, x, y, z, yaw, pitch, c) {
  const a = remotes.get(id); if (!a) return;
  a.gone = false;
  const last = a.buf[a.buf.length - 1];
  if (last && t - last.t > 0.15) a.buf.push({ ...last, t: t - 0.067 });
  a.buf.push({ t, x, y, z, yaw, c });
  if (a.buf.length > 30) a.buf.shift();
}

// the server stopped sending this player (out of sight and earshot): hide the avatar and forget its track
export function hideRemote(id) { const a = remotes.get(id); if (a) { a.gone = true; a.buf.length = 0; a.px = null; a.root.visible = false; } }

const lerp = (a, b, k) => a + (b - a) * k;
const lerpAngle = (a, b, k) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k;

// localSeeker: seekers never see hiders' name tags (and a disguised hider never has one)
export function updateRemotes(now, localSeeker = false, dt = 0) {
  const rt = now - clock.off - clock.delay; // server seconds
  for (const a of remotes.values()) {
    if (a.gone) continue;
    const b = a.buf;
    while (b.length >= 2 && b[1].t <= rt) b.shift();
    if (!b.length) continue;
    let s = b[0];
    if (b.length >= 2) {
      const k = Math.min(1, Math.max(0, (rt - b[0].t) / (b[1].t - b[0].t || 1)));
      s = { x: lerp(b[0].x, b[1].x, k), y: lerp(b[0].y, b[1].y, k), z: lerp(b[0].z, b[1].z, k), yaw: lerpAngle(b[0].yaw, b[1].yaw, k), c: lerp(b[0].c, b[1].c, k) };
    }
    a.x = s.x; a.y = s.y; a.z = s.z; a.c = s.c; a.dist = Math.hypot(s.x - cam.position.x, s.z - cam.position.z);
    a.root.position.set(s.x, s.y, s.z);
    a.root.rotation.y = s.yaw + Math.PI; // avatar faces +z, player forward is (-sin yaw, -cos yaw)
    if (dt > 0 && a.px !== null) { // derive the animation inputs from motion
      const vx = (s.x - a.px) / dt, vz = (s.z - a.pz) / dt, sp = Math.hypot(vx, vz), vy = (s.y - a.py) / dt, ry = a.root.rotation.y;
      const n = a.anim;
      n.speed = lerp(n.speed, sp, Math.min(1, dt * 8)); n.vy = lerp(n.vy, vy, Math.min(1, dt * 8)); n.air = Math.abs(n.vy) > 1.5;
      n.lat = sp > 0.3 ? (vx * Math.cos(ry) - vz * Math.sin(ry)) / sp : 0; n.crouch = s.c;
    }
    a.px = s.x; a.py = s.y; a.pz = s.z;
    const sp0 = a.anim.speed; if (a.limp) a.anim.speed = sp0 * 0.6; // injured: limp
    animAvatar(a, dt); a.anim.speed = sp0;
    if (a.limp && dt > 0 && (a.bloodT = (a.bloodT ?? 0.8) - dt) <= 0) { a.bloodT = 0.8; burst(s.x, 0.9, s.z, 0xb00000, 5, 0.5, 0.6, 0.07); }
    // prop hunt: hiders can't see other hiders, so nobody hides next to a teammate or gives them away
    a.root.visible = !a.hidden && !(opts.hideHiders && !localSeeker && !a.seeker);
    // name tags are a teammate aid only: hiders see other hiders' tags within 10 m, never while crouched or disguised; seekers see none
    if (a.tag) { a.tag.position.y = 2.0 - 0.6 * s.c; a.tag.visible = !a.prop && !a.seeker && !localSeeker && s.c < 0.3 && (a.dist ?? 99) < 10; }
    if (!a.prop) setConcealed(a.body, s.c > 0.5 && opts.grass.some((g) => s.x >= g.x0 && s.x <= g.x1 && s.z >= g.z0 && s.z <= g.z1)); // trial grass rects; no shadow shape out of the grass
  }
}

// trial mode: st = free | injured | trapped | caged | out | escaped. Injured / trapped limp (pose) and bleed; caged / out / escaped are not drawn (the cage prop shows the occupant).
export function setRemoteState(id, st) {
  const a = remotes.get(id); if (!a) return;
  a.limp = st === 'injured' || st === 'trapped'; a.hidden = st === 'caged' || st === 'out' || st === 'escaped';
  if (!a.prop) playChar(a.body, a.limp ? 'injured' : 'reset'); // hunched, one hand to the side (no red tint)
  if (a.hidden) a.root.visible = false;
}
