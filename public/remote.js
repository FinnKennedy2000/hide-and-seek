// Remote player avatars: same capsule characters as the AI hiders, plus name tag, seeker look and snapshot interpolation.
import { THREE, scene, makeChar } from './game.js';

const INTERP = 0.1; // render remote players 100ms in the past
export const remotes = new Map(); // id -> avatar

const coneH = 5;
const coneGeo = new THREE.ConeGeometry(coneH * Math.tan(THREE.MathUtils.degToRad(30)), coneH, 20, 1, true);
coneGeo.translate(0, -coneH / 2, 0); coneGeo.rotateX(-Math.PI / 2); // apex at origin, opens toward +z
const coneMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
const bandMat = new THREE.MeshBasicMaterial({ color: 0xff2030 });

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

export function addRemote(id, name, color, seeker) {
  removeRemote(id);
  const root = new THREE.Group();
  const body = makeChar(color); body.scale.setScalar(1.3); root.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.04, 6, 20), bandMat); band.rotation.x = Math.PI / 2; band.position.y = 1.12; body.add(band);
  const light = new THREE.Group();
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x222222 })); lamp.rotation.x = Math.PI / 2; lamp.position.set(0.4, 1.0, 0.4);
  const cone = new THREE.Mesh(coneGeo, coneMat); cone.position.set(0.4, 1.0, 0.55); cone.frustumCulled = false;
  light.add(lamp, cone); root.add(light);
  const tag = nameTag(name); root.add(tag);
  scene.add(root);
  const a = { id, root, body, band, light, tag, buf: [], x: 0, y: 0, z: 0, c: 0, seeker: false };
  remotes.set(id, a);
  setSeeker(id, seeker);
  return a;
}

export function setSeeker(id, on) {
  const a = remotes.get(id); if (!a) return;
  a.seeker = on;
  a.band.visible = a.light.visible = on;
  const m = a.body.children[0].material; // the capsule
  m.emissive.setHex(on ? 0xff2030 : m.color.getHex()); m.emissiveIntensity = on ? 0.55 : 0.12;
}

export function removeRemote(id) {
  const a = remotes.get(id); if (!a) return;
  scene.remove(a.root);
  a.tag.material.map.dispose(); a.tag.material.dispose();
  remotes.delete(id);
}
export function clearRemotes() { for (const id of [...remotes.keys()]) removeRemote(id); }

export function pushSnap(id, t, x, y, z, yaw, pitch, c) {
  const a = remotes.get(id); if (!a) return;
  a.buf.push({ t, x, y, z, yaw, c });
  if (a.buf.length > 30) a.buf.shift();
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerpAngle = (a, b, k) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * k;

export function updateRemotes(now) {
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
    a.body.scale.y = 1.3 * (1 - 0.35 * s.c);
    a.tag.position.y = 2.2 - 0.6 * s.c;
  }
}
