// Central input: raw key state, rebinding, mouse look, ADS, and the "lost focus" release.
// `keys` is keyed by the DEFAULT code of each action (keys.KeyW = forward) so game code never needs to know about rebinds:
// the listeners below translate whatever physical key is bound to an action into that default code (see canon()).
import { canvas } from '../render/renderer.js';
import { P, G } from './state.js';
import { settings } from './settings.js';
import { bus, EV } from './bus.js';
import { bossOn } from '../ui/bossscreen.js';

export const ACTIONS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft', crouch: 'KeyC',
  tag: 'KeyE', disguise: 'KeyF', camo: 'KeyG', rotate: 'KeyR', taunt: 'KeyT', swapShoulder: 'KeyQ',
};
const DEFAULTS = new Set(Object.values(ACTIONS));
let rev = null; // physical code -> default code of its action
const rebuild = () => { rev = new Map(); for (const a in ACTIONS) rev.set(settings.binds[a] || ACTIONS[a], ACTIONS[a]); };
bus.on(EV.SETTINGS, (e) => { if (e.key === 'binds') rev = null; });

// physical code -> canonical code (null: the key is a default of an action that was rebound elsewhere, so it does nothing)
export function canon(code) {
  if (!rev) rebuild();
  if (rev.has(code)) return rev.get(code);
  return DEFAULTS.has(code) ? null : code;
}
// bind `action` to a physical key; if another action already uses that key the two swap
const RESERVED = new Set(['Escape', 'Tab', 'Backquote', 'KeyP']); // pause / boss keys, handled before game input
export function rebind(action, code) {
  if (!(action in ACTIONS)) throw new Error(`unknown action ${action}`);
  if (/^(Control|Meta|Alt)/.test(code)) throw new Error(`${code} cannot be bound: Ctrl, Meta and Alt are browser-shortcut modifiers the game ignores`);
  if (RESERVED.has(code)) throw new Error(`${code} is reserved (Esc / Tab / P pause, \` boss key)`);
  const cur = { ...ACTIONS, ...settings.binds }, old = cur[action], next = { ...settings.binds };
  for (const a in cur) if (a !== action && cur[a] === code) next[a] = old;
  next[action] = code;
  settings.set('binds', next);
}
export const bindOf = (action) => settings.binds[action] || ACTIONS[action];

export const keys = {};
export const look = { dx: 0, dy: 0 }; // mouse movement since the viewmodel last read it (sway)
export const mouse = { ads: false };
export const releaseAll = () => { for (const k in keys) keys[k] = false; mouse.ads = false; };
// focus / pointer lock lost: every held key is released and the player stops (a stuck W is worse than a hard stop)
const lost = () => { releaseAll(); P.vx = 0; P.vz = 0; };
export function requestLock() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* headless / no gesture */ } }

addEventListener('keydown', (e) => { const c = canon(e.code); if (c && !bossOn() && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA/.test(e.target.tagName || '')) keys[c] = true; });
addEventListener('keyup', (e) => { const c = canon(e.code); if (c) keys[c] = false; });
addEventListener('blur', lost);
document.addEventListener('visibilitychange', () => { if (document.hidden) lost(); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas) lost(); });

addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || G.paused) return;
  const s = settings.sens * (mouse.ads ? 0.8 : 1);
  P.yaw -= e.movementX * s; P.pitch = Math.min(1.5, Math.max(-1.5, P.pitch - e.movementY * s * (settings.invertY ? -1 : 1)));
  look.dx += e.movementX; look.dy += e.movementY;
});
addEventListener('mousedown', (e) => { if (e.button === 2 && document.pointerLockElement === canvas) mouse.ads = true; });
addEventListener('mouseup', (e) => { if (e.button === 2) mouse.ads = false; });
addEventListener('contextmenu', (e) => { if (document.pointerLockElement === canvas) e.preventDefault(); });
