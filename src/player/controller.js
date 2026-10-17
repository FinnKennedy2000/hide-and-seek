// Player controller: input -> motion.js (Rapier kinematic character controller, AABB push-out fallback) -> camera feel, sound and noise.
import { P, G, hooks, DEBUG } from '../core/state.js';
import { settings } from '../core/settings.js';
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
if (DEBUG) { window.__P = P; window.__phys = () => physicsBackend(); } // smoke tests only (?debug=1 or dev build)

// Rapier loads lazily (separate 4 MB chunk). Until it is ready, or if the WASM fails, the AABB backend drives the player.
// potato: never loaded. low: loaded when the first round starts (first updatePlayer), not at boot. med and up: at boot.
let RAPIER = null, rapierFailed = false, rapierLoading = false;
function loadRapier() {
  if (rapierLoading || settings.quality === 'potato') return;
  rapierLoading = true;
  import('@dimforge/rapier3d-compat').then(async (m) => { const R = m.default; await R.init(); RAPIER = R; }).catch((e) => { rapierFailed = true; console.warn('Rapier unavailable, using AABB controller', e); });
}
if (settings.quality !== 'low') loadRapier();
bus.on(EV.SETTINGS, (e) => { if (e.key === 'quality' && e.value !== 'low') loadRapier(); });

// backend wrapper: if Rapier ever throws mid-game, swap to AABB in place and keep the player moving
function safeBackend(inner, colliders) {
  return {
    get name() { return inner.name; },
    canStand: (s) => inner.canStand(s),
    move(s, dx, dy, dz) {
      try { return inner.move(s, dx, dy, dz); } catch (e) {
        console.warn('Rapier failed mid-game, falling back to the AABB controller', e);
        RAPIER = null; rapierFailed = true; try { inner.dispose(); } catch { /* already broken */ }
        inner = aabbBackend(colliders); return inner.move(s, dx, dy, dz);
      }
    },
    dispose() { inner.dispose(); },
  };
}

let motion = null, sig = null, lastPhase = null, lastStam = -1, lastEx = false;
function getMotion() {
  const useRapier = !!RAPIER && settings.quality !== 'potato';
  const s = `${worldKey}:${colliders.length}:${useRapier}`;
  if (motion && s === sig) return motion;
  motion?.backend.dispose();
  let be = null;
  if (useRapier) { try { be = rapierBackend(RAPIER, colliders); } catch (e) { console.warn('Rapier world failed, using AABB controller', e); RAPIER = null; rapierFailed = true; } }
  motion = createMotion(safeBackend(be || aabbBackend(colliders), colliders), bounds); sig = s;
  return motion;
}
export const physicsBackend = () => motion?.backend.name ?? (rapierFailed ? 'aabb' : 'loading');

export const noises = [];
export function noise(x, z, r) {
  if (G.mode === 'hide' && G.phase === 'play') noises.push({ x, z, r });
  hooks.noise?.(x, z, r);
}

// view: false when another module places the camera (third person, spectator)
const inp = { ix: 0, iz: 0, sprint: false, crouch: false, jump: false, can: false }; // scratch, reused every frame
export function updatePlayer(dt, canMove, view = true) {
  if (settings.quality === 'low') loadRapier(); // low: first round start
  const mo = getMotion();
  if (G.phase !== lastPhase) { if (G.phase === 'countdown') { mo.reset(); P.stamina = 1; } lastPhase = G.phase; }
  inp.ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); inp.iz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0);
  inp.sprint = !!(keys.ShiftLeft || keys.ShiftRight); inp.crouch = !!keys.KeyC; inp.jump = !!keys.Space; inp.can = canMove;
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
