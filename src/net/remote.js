// Avatars (character or disguised prop) for the local hider and for remote players, plus snapshot interpolation.
import { THREE, scene, makePropClone } from './game.js';
import { makeChar, setSeeker as charSeeker, tintChar, animate, taunt as charTaunt, flinch as charFlinch, paintChar, clearPaint } from './char.js';

const INTERP = 0.1; // render remote players 100ms in the past
export const remotes = new Map(); // id -> avatar
export const opts = { cone: true, hideHiders: false }; // set per round by online.js
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
  s.scale.set(1.6, 0.4, 1); s.position.y = 2.2;
  return s;
}

// an avatar is a character that can be swapped for a clone of a world prop (disguise) and tinted (camouflage)
export function makeAvatar(name, color, seeker, hat, pattern) {
  const root = new THREE.Group();
  const body = makeChar(color, { hat, pattern, seeker }); root.add(body);
  const light = new THREE.Group();
  const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.rotation.x = Math.PI / 2; lamp.position.set(0.4, 1.0, 0.4);
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.set(0.4, 1.0, 0.55); cone.frustumCulled = false;
  light.add(lamp, cone); root.add(light);
  const tag = name ? nameTag(name) : null; if (tag) root.add(tag);
  scene.add(root);
  const a = { root, body, light, tag, seeker: false, prop: null, propId: null, tintHex: null, anim: { speed: 0, crouch: 0, air: false, vy: 0, lat: 0 }, wobT: rnd(20, 40), wob: 0, bounce: 0 };
  a.setSeeker = (on) => setSeekerLook(a, on);
  setSeekerLook(a, seeker);
  return a;
}
function setSeekerLook(a, on) {
  a.seeker = on; charSeeker(a.body, on); a.light.visible = on && opts.cone;
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

export function addRemote(id, name, color, seeker, hat, pattern) {
  removeRemote(id);
  const a = makeAvatar(name, color, seeker, hat, pattern);
  Object.assign(a, { id, buf: [], x: 0, y: 0, z: 0, c: 0, px: null, py: 0, pz: 0 });
  remotes.set(id, a);
  return a;
}
export const setSeeker = (id, on) => { const a = remotes.get(id); if (a) setSeekerLook(a, on); };
export function removeRemote(id) {
  const a = remotes.get(id); if (!a) return;
  disposeAvatar(a); remotes.delete(id);
}
export function clearRemotes() { for (const id of [...remotes.keys()]) removeRemote(id); }

export function pushSnap(id, t, x, y, z, yaw, pitch, c) {
  const a = remotes.get(id); if (!a) return;
  a.buf.push({ t, x, y, z, yaw, c });
  if (a.buf.length > 30) a.buf.shift();
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerpAngle = (a, b, k) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k;

// localSeeker: seekers never see hiders' name tags (and a disguised hider never has one)
export function updateRemotes(now, localSeeker = false, dt = 0) {
  const rt = now - INTERP;
  for (const a of remotes.values()) {
    const b = a.buf;
    while (b.length >= 2 && b[1].t <= rt) b.shift();
    if (!b.length) continue;
    let s = b[0];
    if (b.length >= 2) {
      const k = Math.min(1, Math.max(0, (rt - b[0].t) / (b[1].t - b[0].t || 1)));
      s = { x: lerp(b[0].x, b[1].x, k), y: lerp(b[0].y, b[1].y, k), z: lerp(b[0].z, b[1].z, k), yaw: lerpAngle(b[0].yaw, b[1].yaw, k), c: lerp(b[0].c, b[1].c, k) };
    }
    a.x = s.x; a.y = s.y; a.z = s.z; a.c = s.c;
    a.root.position.set(s.x, s.y, s.z);
    a.root.rotation.y = s.yaw + Math.PI; // avatar faces +z, player forward is (-sin yaw, -cos yaw)
    if (dt > 0 && a.px !== null) { // derive the animation inputs from motion
      const vx = (s.x - a.px) / dt, vz = (s.z - a.pz) / dt, sp = Math.hypot(vx, vz), vy = (s.y - a.py) / dt, ry = a.root.rotation.y;
      const n = a.anim;
      n.speed = lerp(n.speed, sp, Math.min(1, dt * 8)); n.vy = lerp(n.vy, vy, Math.min(1, dt * 8)); n.air = Math.abs(n.vy) > 1.5;
      n.lat = sp > 0.3 ? (vx * Math.cos(ry) - vz * Math.sin(ry)) / sp : 0; n.crouch = s.c;
    }
    a.px = s.x; a.py = s.y; a.pz = s.z;
    animAvatar(a, dt);
    // prop hunt: hiders can't see other hiders, so nobody hides next to a teammate or gives them away
    a.root.visible = !(opts.hideHiders && !localSeeker && !a.seeker);
    if (a.tag) { a.tag.position.y = 2.2 - 0.6 * s.c; a.tag.visible = !a.prop && (a.seeker || !localSeeker); }
  }
}
