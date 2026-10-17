// Trauma-based screen shake. addShake(0..1) on events; offset() gives a small rotation + position jitter scaled by settings.shake.
import { settings } from '../core/settings.js';

const PRESET = { off: 0, low: 0.5, med: 1, high: 1.8 };
let trauma = 0, t = 0;
export const addShake = (a) => { trauma = Math.min(1, trauma + a); };
export const clearShake = () => { trauma = 0; };
const out = { rx: 0, ry: 0, rz: 0, py: 0 };
export function shakeOffset(dt) {
  t += dt; trauma = Math.max(0, trauma - dt * 1.6);
  const k = trauma * trauma * (PRESET[settings.shake] ?? 1);
  out.rx = k * 0.025 * Math.sin(t * 53); out.ry = k * 0.025 * Math.sin(t * 47 + 1.3); out.rz = k * 0.03 * Math.sin(t * 41 + 2.1); out.py = k * 0.02 * Math.sin(t * 61 + 0.7);
  return out;
}
