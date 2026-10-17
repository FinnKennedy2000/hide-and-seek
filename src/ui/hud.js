import { $, clamp } from '../core/util.js';
import { P } from '../core/state.js';
import { settings } from '../core/settings.js';

export function toast(msg, color) { const t = $('toast'); t.textContent = msg; t.style.color = color || '#fff'; t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
export function show(id, on) { $(id).classList.toggle('hidden', !on); }

// ----- visual sound cues: every positional sfx below also shows where it came from (ring around the crosshair + caption),
// using the same falloff as spat() so you never see a cue for something you could not hear. Own sounds (no position) get none.
export const CUE = { // type -> [caption, colour, glyph]
  step: ['Footsteps', '#cbd5e1', '\u2022'], sprint: ['Running', '#fbbf24', '\u00bb'], land: ['Landing', '#fb923c', '\u25bc'], scrape: ['Scraping', '#a78bfa', '\u2248'],
  taunt: ['Taunt', '#f472b6', '\u266a'], shot: ['Shot', '#ef4444', '\u2738'], rustle: ['Rustling', '#4ade80', '~'], puff: ['Disguise poof', '#67e8f9', '\u25cb'], splat: ['Paint splat', '#f87171', '\u25cf'],
};
const cues = [], caps = [];
const CUE_LIFE = 1.5, CUE_MIN = 0.012; // seconds on screen; smallest (volume x falloff) loudness that is still audible
const relAngle = (x, z) => { const dx = x - P.x, dz = z - P.z; return Math.atan2(dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw), -dx * Math.sin(P.yaw) - dz * Math.cos(P.yaw)); }; // 0 ahead, + right
const dirWord = (a) => (Math.abs(a) < Math.PI / 4 ? 'ahead' : Math.abs(a) > Math.PI * 0.75 ? 'behind' : a > 0 ? 'right' : 'left');
export function cueAt(type, pos, vol) {
  if (!pos || !settings.cues || $('hud').classList.contains('hidden')) return;
  const d = Math.hypot(pos.x - P.x, pos.z - P.z);
  if (d < 1) return;
  const loud = vol / (1 + d * 0.45);
  if (loud < CUE_MIN) return;
  const [label, color, glyph] = CUE[type], k = clamp(Math.sqrt(loud / 0.25), 0.3, 1);
  let c = cues.find((q) => q.type === type && q.age < 0.3 && Math.hypot(q.x - pos.x, q.z - pos.z) < 2);
  if (c) { c.age = 0; c.x = pos.x; c.z = pos.z; c.k = Math.max(c.k, k); } else {
    const el = document.createElement('div'); el.className = 'cue'; el.style.color = color;
    const arrow = document.createElement('div'); arrow.textContent = '\u25b2'; const g = document.createElement('div'); g.textContent = glyph; g.className = 'cg';
    el.append(arrow, g); $('cues').append(el);
    c = { el, type, x: pos.x, z: pos.z, age: 0, k }; cues.push(c);
    if (cues.length > 10) cues.shift().el.remove();
  }
  const text = `${label} \u2014 ${dirWord(relAngle(pos.x, pos.z))}`, old = caps.find((q) => q.text === text);
  if (old) old.age = 0; else {
    const el = document.createElement('div'); el.textContent = text; el.style.borderLeftColor = color; $('caps').append(el);
    caps.push({ el, text, age: 0 }); if (caps.length > 4) caps.shift().el.remove();
  }
}
export function updateCues(dt) {
  for (let i = cues.length - 1; i >= 0; i--) {
    const c = cues[i]; c.age += dt;
    if (c.age >= CUE_LIFE) { c.el.remove(); cues.splice(i, 1); continue; }
    c.el.style.transform = `rotate(${relAngle(c.x, c.z)}rad) translate(-50%, calc(-50% - ${96}px))`;
    c.el.style.opacity = ((0.3 + 0.7 * c.k) * (1 - c.age / CUE_LIFE)).toFixed(2); c.el.style.fontSize = `${14 + 20 * c.k}px`;
  }
  for (let i = caps.length - 1; i >= 0; i--) { const c = caps[i]; c.age += dt; if (c.age >= 2.5) { c.el.remove(); caps.splice(i, 1); } else c.el.style.opacity = Math.min(1, (2.5 - c.age) * 2); }
}
