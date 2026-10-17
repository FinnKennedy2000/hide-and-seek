import { rnd, clamp, lerp, pick, turnTo } from '../core/util.js';
import { P, G } from '../core/state.js';
import { camera } from '../render/renderer.js';
import { sfx } from '../audio/sfx.js';
import { animate } from '../characters/index.js';
import { SPOTS, findPath, follow, losClear } from './nav.js';

export const hiders = [];
export function freeSpot(avoid) {
  const f = SPOTS.filter((s) => !s.owner && (!avoid || Math.hypot(s.x - avoid.x, s.z - avoid.z) > 10));
  return pick(f.length ? f : SPOTS.filter((s) => !s.owner));
}
export function sendHider(h, spot, speed) {
  if (h.spot) h.spot.owner = null;
  h.spot = spot; spot.owner = h;
  h.path = findPath(h.x, h.z, spot.x, spot.z); h.pi = 0; h.speed = speed;
}
function chest(h) { return h.s * 0.62; }
export function tagTarget() {
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
// ----- hiders
export function updateHiders(dt) {
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
