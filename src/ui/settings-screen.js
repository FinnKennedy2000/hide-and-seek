// Settings screen: Graphics / Controls / Audio / Accessibility tabs. Every control writes `settings.set(key, value)`; the producers
// (render, perf, audio, player, hud) read `settings` / listen for the 'settings' bus event. Nothing here touches the renderer directly.
import { $ } from '../core/util.js';
import { settings, DEFAULTS, QUALITY } from '../core/settings.js';
import { bus, EV } from '../core/bus.js';
import { render } from '../render/index.js';
import { ACTIONS, rebind, bindOf } from '../core/input.js';
import { toast } from './hud.js';

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
let uid = 0;

// ----- control builders: each returns a row element; `sync` refreshes it from settings when something else changes the value
function row(label, hint, ctl) {
  const id = `st${++uid}`, l = el('label', { htmlFor: id }, el('span', { textContent: label }), hint ? el('small', { textContent: hint }) : '');
  const r = el('div', { className: 'row' }, l, el('div', { className: 'ctl' }, ctl)); ctl.id ||= id; return r;
}
function slider(label, key, { min, max, step, show, hint }) {
  const inp = el('input', { type: 'range', min, max, step, value: settings[key] }), val = el('span', { className: 'val' });
  const paint = () => { val.textContent = show(settings[key]); inp.setAttribute('aria-valuetext', val.textContent); };
  inp.oninput = () => { settings.set(key, Number(inp.value)); paint(); };
  paint();
  const r = row(label, hint, inp); r.querySelector('label span').append(val); return r;
}
function segmented(label, key, options, hint) {
  const g = el('div', { className: 'seg', role: 'radiogroup' }), btns = options.map(([v, t]) => {
    const b = el('button', { type: 'button', textContent: t, role: 'radio' }); b.onclick = () => { settings.set(key, v); paint(); }; g.append(b); return [v, b];
  });
  const paint = () => btns.forEach(([v, b]) => b.setAttribute('aria-checked', String(settings[key] === v)));
  paint(); g.setAttribute('aria-label', label);
  const r = row(label, hint, g); const lab = r.querySelector('label'); lab.removeAttribute('for'); lab.id = `lb${uid}`; g.setAttribute('aria-labelledby', lab.id); return r;
}
function toggle(label, key, hint) {
  const b = el('button', { type: 'button', className: 'sw-switch', role: 'switch' });
  const paint = () => { b.setAttribute('aria-checked', String(!!settings[key])); b.textContent = settings[key] ? 'On' : 'Off'; };
  b.onclick = () => { settings.set(key, !settings[key]); paint(); };
  paint(); return row(label, hint, b);
}
const pct = (v) => `${Math.round(v * 100)}%`;

// ----- tabs
let scaleOut = null, scaleTimer = 0;
const scaleText = () => { const sc = render.stats().scale; return sc ? `${Math.round(sc * 100)}%` : 'Auto'; };
const TABS = {
  graphics: ['Graphics', () => {
    scaleOut = el('output', { className: 'readout', textContent: scaleText() });
    const sr = el('div', { className: 'row' }, el('div', { className: 'rl' }, el('span', { textContent: 'Render scale' }), el('small', { textContent: 'Set automatically to hold your frame rate' })), el('div', { className: 'ctl' }, scaleOut));
    return [
      segmented('Quality', 'quality', QUALITY.map((q) => [q, q[0].toUpperCase() + q.slice(1)]), 'Potato is for integrated graphics. It turns off most effects.'),
      sr,
      segmented('Frame rate cap', 'fpsCap', [[60, '60 fps'], [30, 'Eco 30']], 'Eco halves the work and the heat on laptops.'),
      toggle('Performance overlay', 'perfHud', 'Shows fps, draw calls and triangles. Shortcut: F3.'),
    ];
  }],
  controls: ['Controls', () => [
    slider('Mouse sensitivity', 'sens', { min: 0.0005, max: 0.006, step: 0.0001, show: (v) => (v * 1000).toFixed(1) }),
    slider('Field of view', 'fov', { min: 50, max: 110, step: 1, show: (v) => `${Math.round(v)}°` }),
    toggle('Invert vertical look', 'invertY'),
    ...bindRows(),
  ]],
  audio: ['Audio', () => [
    slider('Master volume', 'volume', { min: 0, max: 1, step: 0.05, show: pct }),
    slider('Music', 'music', { min: 0, max: 1, step: 0.05, show: pct }),
    slider('Sound effects', 'sfx', { min: 0, max: 1, step: 0.05, show: pct }),
    slider('Menu sounds', 'ui', { min: 0, max: 1, step: 0.05, show: pct }),
  ]],
  access: ['Accessibility', () => {
    const sw = (cls, t) => el('span', { className: `dot ${cls}`, style: `background:var(--${cls});${cls === 'seek' ? 'border-radius:2px;transform:rotate(45deg) scale(.8)' : ''}` , title: t });
    const demo = el('div', { className: 'row' }, el('div', { className: 'rl' }, el('span', { textContent: 'Role colours' }), el('small', { textContent: 'Seekers are a diamond, hiders a circle, in every mode' })), el('div', { className: 'ctl' }, sw('seek', 'Seeker'), sw('hide', 'Hider')));
    return [
      toggle('Sound cues', 'cues', 'Shows where footsteps and other sounds come from, with a caption.'),
      toggle('Reduce motion', 'reducedMotion', 'Stops the menu camera and turns off camera shake and head bob.'),
      segmented('Camera shake', 'shake', [['off', 'Off'], ['low', 'Low'], ['med', 'Medium'], ['high', 'High']]),
      slider('Head bob', 'headBob', { min: 0, max: 1, step: 0.1, show: pct }),
      toggle('Colour-blind role colours', 'colorBlind', 'Swaps to a blue and orange pair that stays distinct for every type of colour blindness.'),
      demo,
    ];
  }],
};

// ----- key bindings (input.js owns the translation layer: rebind() swaps keys so no two actions share one)
const LABELS = { forward: 'Move forward', back: 'Move back', left: 'Move left', right: 'Move right', sprint: 'Sprint', jump: 'Jump', crouch: 'Crouch', tag: 'Tag', disguise: 'Disguise (Prop Hunt)', camo: 'Camouflage (Prop Hunt)', rotate: 'Lock / rotate (Prop Hunt)', taunt: 'Taunt (Prop Hunt)', swapShoulder: 'Swap shoulder' };
const keyName = (c) => (c || '').replace(/^Key/, '').replace(/^Digit/, '').replace(/^Shift(Left|Right)$/, 'Shift').replace(/^Arrow/, '') || '-';
let listening = null;
function bindRows() {
  const rows = Object.keys(ACTIONS).map((id) => {
    const btn = el('button', { type: 'button', className: 'bind', textContent: keyName(bindOf(id)) });
    btn.setAttribute('aria-label', `${LABELS[id] || id}: ${keyName(bindOf(id))}. Press to change`);
    btn.onclick = () => startListen(id, btn);
    const r = el('div', { className: 'row' }, el('div', { className: 'rl' }, el('span', { textContent: LABELS[id] || id })), el('div', { className: 'ctl' }, btn)); r.dataset.bind = id; return r;
  });
  const reset = el('button', { type: 'button', className: 'ghost small', textContent: 'Reset keys' });
  reset.onclick = () => { settings.set('binds', {}); build(); };
  return [...rows, el('div', { className: 'row' }, el('span'), el('div', { className: 'ctl' }, reset))];
}
function startListen(id, btn) {
  stopListen();
  btn.classList.add('listening'); btn.textContent = 'Press a key';
  const onKey = (e) => {
    e.preventDefault(); e.stopImmediatePropagation(); // Esc must cancel here, not close the screen
    if (e.code === 'Escape') return stopListen();
    if (e.code === 'F3') return void toast('F3 is the performance overlay', 'warn');
    try { rebind(id, e.code); } catch (err) { return void toast(err.message, 'warn'); } // input.js rejects modifiers and the pause / boss keys
    stopListen(); build();
  };
  listening = { onKey, btn, id };
  addEventListener('keydown', onKey, true);
}
function stopListen() {
  if (!listening) return;
  removeEventListener('keydown', listening.onKey, true);
  const { btn, id } = listening; listening = null;
  btn.classList.remove('listening'); btn.textContent = keyName(bindOf(id));
}

// ----- shell
let tab = 'graphics';
function build() {
  stopListen();
  const body = $('setBody'), keep = body.scrollTop;
  body.textContent = ''; body.append(...TABS[tab][1]());
  body.setAttribute('aria-labelledby', `tab-${tab}`); body.scrollTop = keep;
  for (const b of $('setTabs').children) { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
}
function select(t, focus) { tab = t; build(); if (focus) $('setTabs').querySelector(`[data-tab="${t}"]`).focus(); }

export function initSettingsScreen() {
  const tabs = $('setTabs');
  for (const [id, [name]] of Object.entries(TABS)) tabs.append(el('button', { type: 'button', id: `tab-${id}`, textContent: name, role: 'tab', onclick: () => select(id) }, ));
  [...tabs.children].forEach((b, i) => { b.dataset.tab = Object.keys(TABS)[i]; });
  tabs.addEventListener('keydown', (e) => {
    const ids = Object.keys(TABS), i = ids.indexOf(tab);
    const n = e.key === 'ArrowRight' ? (i + 1) % ids.length : e.key === 'ArrowLeft' ? (i + ids.length - 1) % ids.length : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : -1;
    if (n >= 0) { e.preventDefault(); select(ids[n], true); }
  });
  $('setReset').onclick = () => { for (const k of Object.keys(DEFAULTS)) if (k !== 'onboarded') settings.set(k, DEFAULTS[k]); build(); toast('Settings reset', 'info'); };
  $('setBack').onclick = () => { stopListen(); closeSettings(); };
  $('btnSettings').onclick = openSettings;
  scaleTimer = setInterval(() => { if (scaleOut && scaleOut.isConnected && !$('settings').classList.contains('hidden')) { const t = scaleText(); if (scaleOut.textContent !== t) scaleOut.textContent = t; } }, 500);
  bus.on(EV.QUALITY, () => { if (!$('settings').classList.contains('hidden') && tab === 'graphics') build(); });
  build();
}
export function openSettings() { $('title').classList.add('hidden'); $('settings').classList.remove('hidden'); tab = 'graphics'; build(); $('setTabs').querySelector('[data-tab="graphics"]').focus(); }
export function closeSettings() { $('settings').classList.add('hidden'); $('title').classList.remove('hidden'); $('btnSettings').focus(); }
