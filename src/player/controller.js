import { clamp, lerp } from '../core/util.js';
import { P, G, hooks } from '../core/state.js';
import { keys } from '../core/input.js';
import { camera } from '../render/renderer.js';
import { colliders, bounds } from '../world/build.js';
import { sfx } from '../audio/sfx.js';

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
export function updatePlayer(dt, canMove) {
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
export const noises = [];
export function noise(x, z, r) {
  if (G.mode === 'hide' && G.phase === 'play') noises.push({ x, z, r });
  hooks.noise?.(x, z, r);
}
