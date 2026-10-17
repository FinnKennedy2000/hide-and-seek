// Player controller: input -> motion.js (Rapier kinematic character controller, AABB push-out fallback) -> camera feel, sound and noise.
import { P, G, hooks } from '../core/state.js';
import { keys } from '../core/input.js';
import { bus, EV } from '../core/bus.js';
import { colliders, bounds, worldKey } from '../world/build.js';
import { sfx } from '../audio/sfx.js';
import { applyFps, landDip } from '../camera/fps.js';
import { addShake } from '../fx/shake.js';
import '../fx/hud.js';
import { createMotion } from './motion.js';
import { rapierBackend, aabbBackend } from './backends.js';

Object.assign(P, { stamina: 1, airborne: false, sprint: false, sliding: false });
if (typeof window !== 'undefined') { window.__P = P; window.__phys = () => physicsBackend(); } // smoke tests / debugging

// Rapier loads lazily (separate chunk). Until it is ready, or if the WASM fails, the AABB backend drives the player.
let RAPIER = null, rapierFailed = false;
import('@dimforge/rapier3d-compat').then(async (m) => { const R = m.default; await R.init(); RAPIER = R; }).catch((e) => { rapierFailed = true; console.warn('Rapier unavailable, using AABB controller', e); });

let motion = null, sig = null, lastPhase = null, lastStam = -1, lastEx = false;
function getMotion() {
  const s = `${worldKey}:${colliders.length}:${!!RAPIER}`;
  if (motion && s === sig) return motion;
  motion?.backend.dispose();
  let be = null;
  if (RAPIER) { try { be = rapierBackend(RAPIER, colliders); } catch (e) { console.warn('Rapier world failed, using AABB controller', e); RAPIER = null; rapierFailed = true; } }
  motion = createMotion(be || aabbBackend(colliders), bounds); sig = s;
  return motion;
}
export const physicsBackend = () => motion?.backend.name ?? (rapierFailed ? 'aabb' : 'loading');

export const noises = [];
export function noise(x, z, r) {
  if (G.mode === 'hide' && G.phase === 'play') noises.push({ x, z, r });
  hooks.noise?.(x, z, r);
}

// view: false when another module places the camera (third person, spectator)
export function updatePlayer(dt, canMove, view = true) {
  const mo = getMotion();
  if (G.phase !== lastPhase) { if (G.phase === 'countdown') { mo.reset(); P.stamina = 1; } lastPhase = G.phase; }
  const inp = {
    ix: (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz: (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0),
    sprint: !!(keys.ShiftLeft || keys.ShiftRight), crouch: !!keys.KeyC, jump: !!keys.Space, can: canMove,
  };
  const ev = mo.step(P, inp, dt);
  P.sliding = ev.sliding;
  const crouching = canMove && keys.KeyC, sprint = ev.sprinting;
  if (ev.jumped) sfx.jump();
  if (ev.landed && !P.mute) { sfx.land(); noise(P.x, P.z, 8); }
  if (ev.landed) { landDip(ev.landed); addShake(Math.min(0.35, ev.landed * 0.03)); }
  if (ev.slid && !P.mute) { sfx.step(0.3, null, 260); noise(P.x, P.z, 10); }
  // footsteps + noise
  const sp = Math.hypot(P.vx, P.vz);
  if (sp > 0.6 && !P.air) {
    P.step += sp * dt; P.bob += sp * dt * 2.4; P.dist += sp * dt;
    const stride = crouching ? 1.1 : sprint ? 1.9 : 1.5;
    if (P.step > stride && !P.mute && !ev.sliding) {
      P.step = 0;
      sfx.step(crouching ? 0.06 : sprint ? 0.3 : 0.18, null, sprint ? 450 : 340);
      noise(P.x, P.z, crouching ? 1.5 : sprint ? 14 : 5.5);
      if (sprint) G.stats.loud = (G.stats.loud || 0) + 1;
    }
  }
  // stamina for the HUD (only when it changes visibly)
  const ex = P.stamina < 0.001 || (lastEx && P.stamina < 0.25);
  if (Math.abs(P.stamina - lastStam) > 0.01 || ex !== lastEx) { lastStam = P.stamina; lastEx = ex; bus.emit(EV.STAMINA, { value: P.stamina, exhausted: ex, sprinting: sprint }); }
  if (view) {
    const cs = Math.cos(P.yaw), sn = Math.sin(P.yaw);
    applyFps(P, dt, { speed: sp, strafe: Math.max(-1, Math.min(1, (P.vx * cs - P.vz * sn) / 3.9)), sprint });
  }
  return { crouching, sprint };
}
