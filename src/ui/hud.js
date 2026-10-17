// HUD: toast, screen visibility, sound-cue ring, and the bus-driven widgets (hit marker, ammo/health, stamina, net chip, perf HUD).
// Per-frame work only touches transform / opacity / text that actually changed: no layout reads, no width/font-size writes.
import { $, clamp } from '../core/util.js';
import { P } from '../core/state.js';
import { settings } from '../core/settings.js';
import { bus, EV } from '../core/bus.js';
import { render } from '../render/index.js';

const TONES = { good: 'var(--good)', bad: 'var(--bad)', info: 'var(--lamp-hot)', warn: 'var(--lamp)' };
// toast(text, tone): tone is 'good' | 'bad' | 'info' | 'warn' or a css colour (legacy callers pass '#ffb44d')
let toastAnim = null;
export function toast(msg, tone) {
  const t = $('toast'); t.textContent = msg; t.style.color = TONES[tone] || tone || 'var(--chalk)';
  toastAnim?.cancel(); // WAAPI restart: no forced reflow
  const rise = settings.reducedMotion ? '' : ' translateY(10px)';
  toastAnim = t.animate([{ opacity: 0, transform: `translateX(-50%)${rise}` }, { opacity: 1, transform: 'translateX(-50%)', offset: 0.1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: 2200, easing: 'ease-out' });
}
export function show(id, on) { $(id).classList.toggle('hidden', !on); }

// ----- visual sound cues: every positional sfx also shows where it came from (ring around the crosshair + caption),
// using the same falloff as spat() so you never see a cue for something you could not hear. Own sounds (no position) get none.
export const CUE = { // type -> [caption, colour, glyph]
  step: ['Footsteps', '#cbd5e1', '•'], sprint: ['Running', '#ffd58a', '»'], land: ['Landing', '#ffb44d', '▼'], scrape: ['Scraping', '#c4b5fd', '≈'],
  taunt: ['Taunt', '#f9a8d4', '♪'], shot: ['Shot', '#ff8a8a', '✸'], rustle: ['Rustling', '#a7f3c0', '~'], puff: ['Disguise poof', '#a5f3fc', '○'], splat: ['Paint splat', '#fdba74', '●'],
};
const cues = [], caps = [];
const CUE_LIFE = 1.5, CUE_MIN = 0.012; // seconds on screen; smallest (volume x falloff) loudness that is still audible
const relAngle = (x, z) => { const dx = x - P.x, dz = z - P.z; return Math.atan2(dx * Math.cos(P.yaw) - dz * Math.sin(P.yaw), -dx * Math.sin(P.yaw) - dz * Math.cos(P.yaw)); }; // 0 ahead, + right
const dirWord = (a) => (Math.abs(a) < Math.PI / 4 ? 'ahead' : Math.abs(a) > Math.PI * 0.75 ? 'behind' : a > 0 ? 'right' : 'left');
export function cueAt(type, pos, vol) {
  if (!pos || !settings.cues || !CUE[type] || $('hud').classList.contains('hidden')) return;
  const d = Math.hypot(pos.x - P.x, pos.z - P.z);
  if (d < 1) return;
  const loud = vol / (1 + d * 0.45);
  if (loud < CUE_MIN) return;
  const [label, color, glyph] = CUE[type], k = clamp(Math.sqrt(loud / 0.25), 0.3, 1);
  let c = cues.find((q) => q.type === type && q.age < 0.3 && Math.hypot(q.x - pos.x, q.z - pos.z) < 2);
  if (c) { c.age = 0; c.x = pos.x; c.z = pos.z; } else {
    const el = document.createElement('div'); el.className = 'cue'; el.style.color = color; el.style.fontSize = `${14 + 20 * k}px`; // size fixed at spawn: never written per frame
    const arrow = document.createElement('div'); arrow.textContent = '▲'; const g = document.createElement('div'); g.textContent = glyph; g.className = 'cg';
    el.append(arrow, g); $('cues').append(el);
    c = { el, type, x: pos.x, z: pos.z, age: 0, k }; cues.push(c);
    if (cues.length > 10) cues.shift().el.remove();
  }
  c.k = Math.max(c.k, k);
  const text = `${label} — ${dirWord(relAngle(pos.x, pos.z))}`, old = caps.find((q) => q.text === text);
  if (old) old.age = 0; else {
    const el = document.createElement('div'); el.textContent = text; el.style.borderLeftColor = color; $('caps').append(el);
    caps.push({ el, text, age: 0 }); if (caps.length > 4) caps.shift().el.remove();
  }
}
export function updateCues(dt) {
  for (let i = cues.length - 1; i >= 0; i--) {
    const c = cues[i]; c.age += dt;
    if (c.age >= CUE_LIFE) { c.el.remove(); cues.splice(i, 1); continue; }
    c.el.style.transform = `rotate(${relAngle(c.x, c.z)}rad) translate(-50%, calc(-50% - 96px))`;
    c.el.style.opacity = ((0.3 + 0.7 * c.k) * (1 - c.age / CUE_LIFE)).toFixed(2);
  }
  for (let i = caps.length - 1; i >= 0; i--) { const c = caps[i]; c.age += dt; if (c.age >= 2.5) { c.el.remove(); caps.splice(i, 1); } else c.el.style.opacity = Math.min(1, (2.5 - c.age) * 2).toFixed(2); }
}

// ----- bus-driven widgets (producers land in other workstreams; until they emit, these simply stay idle)
// hitmarker {kill?: boolean, hit?: boolean}: white tick on hit, role-coloured heavier tick on kill
bus.on(EV.HITMARKER, (m = {}) => {
  const h = $('hitmark'), kill = !!m.kill;
  for (const i of h.children) i.style.background = kill ? 'var(--bad)' : '#fff';
  h.style.opacity = '1';
  h.animate([{ opacity: 1, transform: `scale(${kill ? 1.5 : 1})` }, { opacity: 0, transform: 'scale(1.25)' }], { duration: kill ? 420 : 240, easing: 'ease-out' }).onfinish = () => { h.style.opacity = '0'; };
});
// ammo {mag, reserve, hp, reloading}  (also accepts cur/max and hpMax). Writes text only when it changes.
const last = {};
const put = (id, v) => { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } };
bus.on(EV.AMMO, (m = {}) => {
  const mag = m.mag ?? m.cur, res = m.reserve ?? m.max;
  $('ammoHud').classList.remove('hidden');
  if (mag != null) put('ammoTxt', m.reloading ? 'Reloading' : res != null ? `${mag} / ${res}` : String(mag));
  if (m.hp != null) { const f = clamp(m.hp / (m.hpMax ?? 100), 0, 1); put('hpTxt', `Health ${Math.round(f * (m.hpMax ?? 100))}`); $('hpFill').style.width = `${f * 100}%`; }
});
// stamina {value: 0..1} or {cur, max}. Bar shows only while not full.
bus.on(EV.STAMINA, (m = {}) => {
  const v = clamp(m.value ?? (m.cur != null ? m.cur / (m.max || 1) : 1), 0, 1), el = $('stam');
  el.classList.toggle('hidden', v >= 0.999);
  $('stamFill').style.transform = `scaleX(${v.toFixed(3)})`;
});
bus.on(EV.CUE, (m = {}) => { const p = m.pos || (m.x != null ? { x: m.x, z: m.z } : null); cueAt(m.type, p, m.vol ?? 0.3); });
// net {ping, loss, state: 'ok'|'degraded'|'down'}: chip appears only when the link is not healthy
bus.on(EV.NET, (m = {}) => {
  const chip = $('netChip'), bad = m.state === 'degraded' || m.state === 'down' || m.ping > 150 || m.loss > 0.03;
  chip.classList.toggle('hidden', !bad && !settings.perfHud);
  chip.classList.toggle('bad', bad);
  if (m.ping != null || m.state) chip.textContent = m.state === 'down' ? 'Link down' : `${Math.round(m.ping ?? 0)} ms${m.loss > 0.01 ? `  ${Math.round(m.loss * 100)}% loss` : ''}`;
});
let failToast = 0;
bus.on(EV.ASSET_FAIL, () => { const t = performance.now(); if (t - failToast > 8000) { failToast = t; toast('Some assets failed to load; using fallbacks', 'warn'); } });
bus.on(EV.QUALITY, (m = {}) => { if (m.level && m.auto) toast(`Graphics adjusted: ${m.level}`, 'info'); }); // governor-initiated changes only

// ----- perf HUD (F3 or Settings > Graphics): fps / frame ms / draw calls / triangles, refreshed 4x a second
let phAcc = 0, phFrames = 0, phLast = '';
export function updatePerfHud(dt) {
  if (!settings.perfHud) return;
  phAcc += dt; phFrames++;
  if (phAcc < 0.25) return;
  const s = render.stats(), fps = Math.round(phFrames / phAcc), ms = (phAcc / phFrames * 1000).toFixed(1);
  phAcc = 0; phFrames = 0;
  const txt = `${fps} fps  ${ms} ms\n${s.calls} calls  ${Math.round(s.tris / 1000)}k tris\nq: ${settings.quality}${s.scale ? `  scale ${Math.round(s.scale * 100)}%` : ''}`;
  if (txt !== phLast) { phLast = txt; $('perfHud').textContent = txt; }
}
const applyPerfHud = () => $('perfHud').classList.toggle('hidden', !settings.perfHud);
bus.on(EV.SETTINGS, ({ key }) => { if (key === 'perfHud') applyPerfHud(); });
applyPerfHud();

// role chip + HUD colour role: 'seeker' | 'hider' (set by the mode label text, which every mode already writes)
let roleNow = '';
export function syncRole() {
  const t = $('modeLabel').textContent, r = /^SEEK/i.test(t) ? 'seeker' : /^HIDE/i.test(t) ? 'hider' : '';
  if (r !== roleNow) { roleNow = r; if (r) $('hud').dataset.role = r; else delete $('hud').dataset.role; }
}
