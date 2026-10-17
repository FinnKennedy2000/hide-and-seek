// Results podium: the top three characters stand on a stage high above the map (camera is moved there by backdrop.setStage), cheering with
// the `victory` animation when the character rig has one (falls back to the taunt wave). The podium blocks are DOM, positioned from the
// projected feet of each character so they always line up. Listens for EV.END: {players:[...]} (online) or {single:true, win} (single player).
import * as THREE from 'three';
import { scene, camera } from '../render/renderer.js';
import { createCharacter } from '../characters/index.js';
import { bus, EV } from '../core/bus.js';
import { $ } from '../core/util.js';
import { setStage, backdropCam, stageActive } from './backdrop.js';

// Stage height above the map. The camera looks from -z (the sun is behind -z, so faces are lit) and aims right of the figures, which
// puts them left of the results card. Screen-right is -x from this side, hence rank 2 at +x.
const BASE_Y = 90, SHIFT = -1.3, CAM_Z = -8.5;
const SLOTS = [{ x: 0, y: 0.9 }, { x: 1.6, y: 0.6 }, { x: -1.6, y: 0.3 }]; // rank 1, 2, 3
let group = null, chars = [], steps = [], host = null, tauntT = 0;

const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);
const savedLook = () => { try { return JSON.parse(localStorage.getItem('hs-cos') || '{}'); } catch { return {}; } };

function layout() {
  if (!group) return;
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  const w = innerWidth, h = innerHeight, v = new THREE.Vector3();
  steps.forEach((el, i) => {
    v.set(SLOTS[i].x, BASE_Y + SLOTS[i].y, 0).project(camera);
    const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
    el.style.left = `${sx}px`; el.style.top = `${sy}px`; el.style.height = `${Math.max(40, h - sy)}px`;
  });
}

export function hidePodium() {
  if (!group) return;
  scene.remove(group); chars.forEach((c) => c.dispose?.()); group = null; chars = []; steps = [];
  if (host) host.textContent = '';
  setStage(null); host = null;
}

export function showPodium(hostEl, entries) {
  hidePodium();
  const top = entries.slice(0, 3);
  if (!top.length) return;
  host = hostEl; host.textContent = '';
  group = new THREE.Group(); group.position.set(0, BASE_Y, 0); scene.add(group);
  setStage({ pos: new THREE.Vector3(SHIFT, BASE_Y + 1.6, CAM_Z), look: new THREE.Vector3(SHIFT, BASE_Y + 1.15, 0) });
  backdropCam(0);
  top.forEach((e, i) => {
    const c = createCharacter({ color: e.color ?? 0x4cc9f0, hat: e.hat, outfit: e.outfit });
    c.root.position.set(SLOTS[i].x, SLOTS[i].y, 0); c.root.rotation.y = 0; group.add(c.root); chars.push(c);
    c.play('victory'); // no-op until the rig has the clip
    const el = document.createElement('div'); el.className = 'step';
    el.innerHTML = '<span class="rk"></span><b></b><small></small>';
    el.children[0].textContent = i + 1; el.children[1].textContent = e.name; el.children[2].textContent = e.sub || '';
    el.style.borderTopColor = e.color != null ? hex(e.color) : ''; el.style.borderTopWidth = '4px';
    host.append(el); steps.push(el);
  });
  layout();
}

// per frame (system order 45): animate the cheering figures
export function updatePodium(dt) {
  if (!group) return;
  tauntT -= dt;
  for (const c of chars) { c.update(dt, {}); if (tauntT <= 0) c.play('victory'), c.play('taunt'); }
  if (tauntT <= 0) tauntT = 2.4;
  const open = !$('olResults').classList.contains('hidden') || !$('end').classList.contains('hidden');
  if (!open || !stageActive()) hidePodium();
}
addEventListener('resize', layout);

bus.on(EV.END, (m = {}) => {
  if (m.single) {
    if (!m.win) return hidePodium();
    const l = savedLook();
    return showPodium($('endPodium'), [{ name: 'You', sub: m.sub || 'Winner', color: Number.isFinite(l.color) ? l.color : 0xffb44d, hat: l.hat, outfit: l.outfit }]);
  }
  const ps = [...(m.players || [])].sort((a, b) => (b.total ?? b.score ?? 0) - (a.total ?? a.score ?? 0));
  showPodium($('resPodium'), ps.map((p) => ({ name: p.name, sub: `${p.total ?? p.score ?? 0} pts`, color: p.color, hat: p.hat, outfit: p.outfit })));
});
