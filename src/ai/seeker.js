import * as THREE from 'three';
import { lerp, pick } from '../core/util.js';
import { P, G } from '../core/state.js';
import { scene } from '../render/renderer.js';
import { M } from '../world/materials.js';
import { sfx } from '../audio/sfx.js';
import { toast } from '../ui/hud.js';
import { makeChar, animate } from '../characters/index.js';
import { SPOTS, findPath, follow, losClear } from './nav.js';
import { endGame } from '../modes/singleplayer.js';

function makeIcon(txt, col) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = '#000'; g.strokeText(txt, 32, 34); g.fillStyle = col; g.fillText(txt, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const iconTex = { q: makeIcon('?', '#ffd166'), x: makeIcon('!', '#ff4d5e') };

// seeker
export const S = { x: 0, z: 7.8, heading: Math.PI, state: 'count', path: null, pi: 0, timer: 0, detect: 0, visited: new Set(), lastSeen: null, repath: 0, lostT: 0, stepT: 0, spot: null };
export const seekerGroup = new THREE.Group();
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
export function updateSeeker(dt) {
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
