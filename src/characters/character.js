// Procedural stylised characters: chunky toy look, ~15-25 meshes each, all animation is code.
import * as THREE from 'three';

export const HATS = ['none', 'cap', 'beanie', 'bucket', 'crown'];
export const OUTFITS = ['plain', 'stripes', 'dots', 'overalls'];

// ---------- shared geometry / materials (never disposed) ----------
const sphere = new THREE.SphereGeometry(1, 16, 12);
const pantsGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
const limbGeo = new THREE.CylinderGeometry(0.075, 0.085, 0.4, 10); limbGeo.translate(0, -0.2, 0);
const armGeo = new THREE.CylinderGeometry(0.065, 0.07, 0.38, 10); armGeo.translate(0, -0.19, 0);
const strapGeo = new THREE.BoxGeometry(0.06, 0.3, 0.05);
const mouthGeo = new THREE.TorusGeometry(0.05, 0.009, 6, 10, Math.PI); mouthGeo.rotateZ(Math.PI);
const domeGeo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
const coneGeo = new THREE.ConeGeometry(1, 1, 6);
const bandGeo = new THREE.TorusGeometry(0.255, 0.024, 6, 20); bandGeo.rotateX(Math.PI / 2);
const lensGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12); lensGeo.rotateX(Math.PI / 2);

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0, ...o });
const eyeWhiteMat = std({ color: 0xffffff, roughness: 0.3 });
const pupilMat = std({ color: 0x14141c, roughness: 0.2 });
const mouthMat = std({ color: 0x3a1620 });
const redMat = std({ color: 0xd62828, emissive: 0x6a0a0a, emissiveIntensity: 0.8 });
const lensMat = std({ color: 0xff4d4d, emissive: 0xff2020, emissiveIntensity: 0.9, roughness: 0.15 });
const HAT_MATS = {
  cap: std({ color: 0xf4722b }), beanie: std({ color: 0x7b2cbf }), bucket: std({ color: 0xe9c46a }),
  crown: std({ color: 0xffd23f, metalness: 0.6, roughness: 0.3, emissive: 0x3a2a00 }),
};
const POM_MAT = std({ color: 0xf1f1f1 });

// Pattern textures are greyscale multipliers (body colour comes from material.color), so one
// texture per outfit is shared by every colour and tinting still works.
const texCache = {};
function patternTex(outfit) {
  if (outfit in texCache) return texCache[outfit];
  let tex = null;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = outfit === 'stripes' ? '#b8b8b8' : '#a8a8a8';
    if (outfit === 'stripes') for (let y = 0; y < 64; y += 16) g.fillRect(0, y, 64, 8);
    else for (let y = 8; y < 64; y += 32) for (let x = 8; x < 64; x += 32) { g.beginPath(); g.arc(x + (y % 64 ? 0 : 0), y, 6, 0, Math.PI * 2); g.fill(); }
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(outfit === 'stripes' ? 1 : 4, outfit === 'stripes' ? 2 : 2);
    tex.colorSpace = THREE.SRGBColorSpace;
  } catch { tex = null; } // no DOM: fall back to plain colour
  return (texCache[outfit] = tex);
}

// ---------- helpers ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));
const mix = (a, b, t) => a + (b - a) * t;

function mesh(geo, mat, parent, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true;
  parent.add(m); return m;
}
function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g;
}

const HIP_Y = 0.53, HEAD_Y = 1.25, HEAD_C = 0.22; // head centre sits HEAD_C above the neck pivot

export function createCharacter({ color = 0x4cc9f0, hat = 'none', outfit = 'plain', seeker = false } = {}) {
  if (!HATS.includes(hat)) hat = 'none';
  if (!OUTFITS.includes(outfit)) outfit = 'plain';

  const base = new THREE.Color(color);
  // per-instance materials: [material, base colour]
  const tintable = [];
  const inst = (c, o = {}) => { const m = std({ color: c, ...o }); tintable.push([m, m.color.clone()]); return m; };
  const bodyMat = inst(base);
  const torsoMat = inst(base);
  const footMat = inst(base.clone().multiplyScalar(0.55));
  const pantsMat = outfit === 'overalls' ? inst(base.clone().multiplyScalar(0.55).lerp(new THREE.Color(0x2b3a67), 0.5)) : null;
  if (outfit === 'stripes' || outfit === 'dots') { const t = patternTex(outfit); if (t) torsoMat.map = t; }

  const root = new THREE.Group();
  const rig = group(root);                       // squash / lean / sway pivot at the feet
  const bodyG = group(rig);                      // everything above the hips (lowers when crouching)

  // legs (hip pivots stay on rig so feet track the ground when the body lowers)
  const legs = [-1, 1].map((s) => {
    const g = group(rig, s * 0.14, HIP_Y, 0);
    mesh(limbGeo, bodyMat, g);
    const foot = mesh(sphere, footMat, g, 0, -0.46, -0.04, 0.1, 0.07, 0.14);
    return { g, foot, s };
  });

  // torso
  const torso = mesh(sphere, torsoMat, bodyG, 0, 0.88, 0, 0.36, 0.4, 0.3);
  if (pantsMat) {
    mesh(pantsGeo, pantsMat, bodyG, 0, 0.88, 0, 0.37, 0.41, 0.31);
    for (const s of [-1, 1]) mesh(strapGeo, pantsMat, bodyG, s * 0.15, 1.0, -0.27);
  }

  // arms
  const arms = [-1, 1].map((s) => {
    const g = group(bodyG, s * 0.37, 1.12, 0);
    mesh(armGeo, bodyMat, g);
    mesh(sphere, bodyMat, g, 0, -0.4, 0, 0.075);
    return { g, s };
  });

  // head
  const headG = group(bodyG, 0, HEAD_Y, 0);
  mesh(sphere, bodyMat, headG, 0, HEAD_C, 0, 0.25);
  const eyes = [-1, 1].map((s) => {
    const g = group(headG, s * 0.09, HEAD_C + 0.05, -0.205);
    mesh(sphere, eyeWhiteMat, g, 0, 0, 0, 0.065, 0.08, 0.04);
    const pupil = mesh(sphere, pupilMat, g, 0, 0, -0.03, 0.033, 0.042, 0.02);
    return { g, pupil };
  });
  mesh(mouthGeo, mouthMat, headG, 0, HEAD_C - 0.085, -0.232);

  // hats (head-local, relative to head centre at y=HEAD_C)
  const hc = HEAD_C;
  if (hat === 'cap') {
    mesh(domeGeo, HAT_MATS.cap, headG, 0, hc + 0.02, 0, 0.27);
    mesh(cylGeo, HAT_MATS.cap, headG, 0, hc + 0.1, -0.26, 0.15, 0.02, 0.14);
  } else if (hat === 'beanie') {
    mesh(domeGeo, HAT_MATS.beanie, headG, 0, hc + 0.02, 0, 0.27);
    mesh(sphere, POM_MAT, headG, 0, hc + 0.3, 0, 0.06);
  } else if (hat === 'bucket') {
    mesh(cylGeo, HAT_MATS.bucket, headG, 0, hc + 0.17, 0, 0.21, 0.16, 0.21);
    mesh(cylGeo, HAT_MATS.bucket, headG, 0, hc + 0.1, 0, 0.34, 0.02, 0.34);
  } else if (hat === 'crown') {
    mesh(cylGeo, HAT_MATS.crown, headG, 0, hc + 0.24, 0, 0.2, 0.09, 0.2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      mesh(coneGeo, HAT_MATS.crown, headG, Math.sin(a) * 0.15, hc + 0.34, Math.cos(a) * 0.15, 0.05, 0.12, 0.05);
    }
  }

  // seeker gear
  const seekerParts = [
    mesh(bandGeo, redMat, headG, 0, hc + 0.08, 0),
    mesh(lensGeo, lensMat, headG, -0.09, hc + 0.17, -0.19),
    mesh(lensGeo, lensMat, headG, 0.09, hc + 0.17, -0.19),
  ];
  const setSeeker = (v) => seekerParts.forEach((m) => { m.visible = !!v; });
  setSeeker(seeker);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // ---------- animation state ----------
  const S = {
    t: Math.random() * 10, phase: 0, move: 0, run: 0, crouch: 0, air: 0, look: 0,
    taunt: -1, hit: -1, mode: null, down: 0, vic: 0, pitch: 0, blinkIn: 2 + Math.random() * 4, blink: -1,
  };
  const TAUNT_T = 1.2, HIT_T = 0.4, BLINK_T = 0.14;

  function update(dt, { speed = 0, crouch = false, airborne = false, lookYaw = 0, aimPitch = 0 } = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    S.t += dt;
    const t = S.t;
    S.move = damp(S.move, speed > 0.15 ? clamp(speed / 1.2, 0, 1) : 0, 10, dt);
    S.run = damp(S.run, clamp((speed - 2.5) / 2.5, 0, 1), 6, dt);
    S.crouch = damp(S.crouch, crouch ? 1 : 0, 12, dt);
    S.air = damp(S.air, airborne ? 1 : 0, 14, dt);
    S.look = damp(S.look, clamp(lookYaw, -1.2, 1.2), 10, dt);
    S.pitch = damp(S.pitch, clamp(aimPitch, -1.2, 1.2), 14, dt);
    S.down = damp(S.down, S.mode === 'tagged' ? 1 : 0, 8, dt); // tagged: topples sideways and stays down
    S.vic = damp(S.vic, S.mode === 'victory' ? 1 : 0, 8, dt);   // victory: hops with arms up

    // one-shot envelopes (smooth in/out, no snapping)
    let tw = 0, hw = 0;
    if (S.taunt >= 0) { S.taunt += dt; const u = S.taunt / TAUNT_T; if (u >= 1) S.taunt = -1; else tw = Math.min(1, u / 0.15, (1 - u) / 0.15); }
    if (S.hit >= 0) { S.hit += dt; const u = S.hit / HIT_T; if (u >= 1) S.hit = -1; else hw = Math.sin(Math.PI * Math.pow(u, 0.6)); }
    tw = tw * tw * (3 - 2 * tw);

    const { move, run, crouch: cr, air } = S;
    const ground = move * (1 - air);
    const freq = (0.6 + 0.28 * speed) * (1 - 0.2 * cr);
    S.phase += dt * Math.PI * 2 * freq * (move > 0.02 ? 1 : 0);
    const sw = Math.sin(S.phase);
    const stride = (0.4 + 0.5 * run) * ground * (1 - 0.5 * cr);

    // body
    const drop = 0.17 * cr;
    const bob = Math.abs(Math.sin(S.phase)) * (0.03 + 0.03 * run) * ground * (1 - cr);
    const breath = Math.sin(t * 2.2) * (1 - move);
    bodyG.position.y = -drop + bob + breath * 0.008;
    torso.scale.set(0.36 * (1 + breath * 0.015), 0.4 * (1 + breath * 0.02), 0.3);
    rig.rotation.x = -(0.1 * run * ground + 0.18 * cr) + 0.35 * hw;
    rig.rotation.z = Math.sin(t * 1.3) * 0.02 * (1 - move) + Math.sin(S.phase) * 0.04 * ground + Math.sin(t * 13) * 0.1 * tw;
    rig.rotation.y = Math.sin(t * 9) * 0.12 * tw;
    rig.position.z = 0.1 * hw;
    rig.scale.set(1 + 0.12 * hw, 1 - 0.15 * hw, 1 + 0.12 * hw);
    rig.rotation.z += 1.45 * S.down; rig.position.y = 0.14 * S.down + Math.abs(Math.sin(t * 9)) * 0.18 * S.vic;

    // legs
    const legScale = clamp(1 - 0.3 * cr - 0.28 * air, 0.5, 1) * (1 - 0.0);
    const hipScale = (HIP_Y - drop) / HIP_Y;
    for (const L of legs) {
      const swing = sw * stride * L.s;
      L.g.rotation.x = mix(swing, 0.85, air);
      L.g.rotation.z = L.s * 0.14 * cr;
      L.g.position.y = HIP_Y - drop * (1 - air);
      const sc = air > 0.01 ? mix(hipScale, legScale, air) : hipScale * (1 - 0.0);
      L.g.scale.y = sc;
      L.foot.scale.y = 0.07 / Math.max(sc, 0.3);
    }

    // arms (opposite to legs), raise when airborne, wave when taunting
    for (const A of arms) {
      const swing = -sw * stride * A.s * 1.1;
      let rx = mix(swing, -0.3, air) + 0.5 * hw;
      let rz = A.s * (0.1 + 0.15 * cr + 0.07 * run * ground);
      rz = mix(rz, A.s * 2.5, air);
      rz = mix(rz, A.s * (0.9 + 0.5 * hw), hw);
      if (A.s > 0) { // waving arm
        rx = mix(rx, 0, tw);
        rz = mix(rz, 2.7 + Math.sin(t * 14) * 0.4, tw);
      }
      A.g.rotation.x = rx; A.g.rotation.z = rz;
    }

    // head: turn toward lookYaw, nod with the gait, tilt on hit
    headG.rotation.y = clamp(S.look, -0.9, 0.9) * 0.7;
    headG.rotation.x = -0.05 * run * ground - 0.25 * hw - S.pitch * 0.5 + Math.sin(S.phase * 2) * 0.02 * ground;
    headG.rotation.z = Math.sin(t * 1.1) * 0.03 * (1 - move);

    // eyes: glance with leftover turn, blink at random
    S.blinkIn -= dt;
    if (S.blinkIn <= 0 && S.blink < 0) S.blink = 0;
    let open = 1;
    if (S.blink >= 0) {
      S.blink += dt;
      if (S.blink >= BLINK_T) { S.blink = -1; S.blinkIn = 2 + Math.random() * 4; }
      else open = 1 - 0.92 * Math.sin(Math.PI * S.blink / BLINK_T);
    }
    if (hw > 0.3) open = Math.min(open, 0.35); // squint on hit
    const px = clamp(S.look - headG.rotation.y, -0.6, 0.6) * 0.04 + Math.sin(t * 0.7) * 0.004;
    for (const E of eyes) { E.g.scale.y = open; E.pupil.position.x = px; }
  }

  function play(name) {
    if (name === 'taunt') S.taunt = 0;
    else if (name === 'hit') S.hit = 0;
    else if (name === 'tagged' || name === 'victory') S.mode = name;
    else if (name === 'reset' || name === 'idle') S.mode = null;
  }

  function setTint(c, amount = 0) {
    const tc = new THREE.Color(c), a = clamp(amount, 0, 1);
    for (const [m, b] of tintable) m.color.copy(b).lerp(tc, a);
  }

  function dispose() { for (const [m] of tintable) m.dispose(); }

  return { kind: 'procedural', root, update, play, setSeeker, setTint, dispose };
}
