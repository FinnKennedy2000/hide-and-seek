// Keyboard + controller navigation for every menu screen: focus lands on the right control when a screen opens, arrows / d-pad move
// focus spatially, Enter / A activates, Esc / B goes back (each screen names its back button with data-back). Disabled while a round is live.
import { $ } from '../core/util.js';
import { inGame } from '../core/state.js';
import { bossOn } from './bossscreen.js';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';
const screens = () => [...document.querySelectorAll('.panelwrap:not(.hidden)')];
const active = () => { const s = screens(); return s[s.length - 1] || null; }; // last in DOM order = topmost
const visible = (el) => el.getClientRects().length > 0 && !el.closest('[inert]');
const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(visible);

function focusFirst(panel) {
  if (panel.contains(document.activeElement) && visible(document.activeElement)) return;
  const t = panel.querySelector('[data-focus]') || panel.querySelector('.menu button') || panel.querySelector('input:not([readonly])') || panel.querySelector('button.primary:not(:disabled)') || focusables(panel)[0];
  t?.focus({ preventScroll: true });
}
// when a screen becomes visible, move focus into it
const obs = new MutationObserver((list) => {
  for (const m of list) {
    const el = m.target;
    if (!el.classList.contains('panelwrap') || el.classList.contains('hidden') || inGame()) continue;
    if (m.oldValue && !/\bhidden\b/.test(m.oldValue)) continue; // was already visible
    requestAnimationFrame(() => { if (!el.classList.contains('hidden') && el === active()) focusFirst(el); });
  }
});
export function initNav() {
  document.querySelectorAll('.panelwrap').forEach((p) => obs.observe(p, { attributes: true, attributeFilter: ['class'], attributeOldValue: true }));
  const t = $('title'); if (t && !t.classList.contains('hidden')) focusFirst(t);
}

// Esc / B. Lobby and connection screens ask before leaving: a stray key press must not drop you out of a room.
// While the connection screen is only waiting for a round to end, Esc does nothing (the Cancel button is still there).
let confirmFrom = null;
export function ask(panel) {
  confirmFrom = document.activeElement; $('cfTitle').textContent = panel.dataset.confirm;
  $('cfYes').onclick = () => { closeConfirm(false); panel.querySelector(panel.dataset.back)?.click(); };
  $('cfNo').onclick = () => closeConfirm(true);
  $('confirm').classList.remove('hidden');
}
function closeConfirm(restore) { $('confirm').classList.add('hidden'); if (restore && confirmFrom?.isConnected) confirmFrom.focus(); confirmFrom = null; }
// the room can change under the dialog (round starts, connection drops): close it if its screen is gone
export function syncConfirm() { if (!$('confirm').classList.contains('hidden') && $('olLobby').classList.contains('hidden') && $('olConn').classList.contains('hidden')) closeConfirm(false); }
export function back() {
  const p = active(); if (!p) return false;
  if (p.id === 'olConn' && $('connRetry').classList.contains('hidden')) return true; // waiting for the round to finish
  if (p.dataset.confirm) { ask(p); return true; }
  const sel = p.dataset.back; if (!sel) return false;
  const b = p.querySelector(sel); if (!b || b.disabled) return false;
  b.click(); return true;
}

export function move(dir) {
  const root = active(); if (!root) return;
  const cur = document.activeElement, list = focusables(root);
  if (!list.length) return;
  if (!list.includes(cur)) return void list[0].focus();
  const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const dx = dir === 'right' ? 1 : dir === 'left' ? -1 : 0, dy = dir === 'down' ? 1 : dir === 'up' ? -1 : 0;
  let best = null, bs = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const q = el.getBoundingClientRect(), ex = q.left + q.width / 2 - cx, ey = q.top + q.height / 2 - cy;
    const along = ex * dx + ey * dy; // distance in the travel direction
    if (along <= 1) continue;
    const across = Math.abs(dx ? ey : ex);
    const s = along + across * 2.2; // prefer aligned neighbours
    if (s < bs) { bs = s; best = el; }
  }
  if (best) { best.focus({ preventScroll: false }); best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }
}

const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
addEventListener('keydown', (e) => {
  if (inGame() || bossOn() || e.defaultPrevented || !active() || $('loading') && !$('loading').classList.contains('hidden')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const t = e.target;
  if (e.key === 'Escape') { e.preventDefault(); if (t.tagName === 'INPUT' && t.type !== 'range') t.blur(); back(); return; }
  const dir = DIRS[e.key]; if (!dir) return;
  if (t.tagName === 'INPUT' && t.type !== 'range') return;        // caret movement
  if (t.type === 'range' && (dir === 'left' || dir === 'right')) return; // value change
  if (t.getAttribute?.('role') === 'tab' && (dir === 'left' || dir === 'right')) return; // tabs own their arrows
  e.preventDefault(); move(dir);
});

// ----- controller: d-pad / left stick, A activates, B goes back. Polled only while a pad is connected and a menu is open.
let pad = 0, last = '', held = 0;
addEventListener('gamepadconnected', () => { if (!pad) pad = setInterval(poll, 90); });
addEventListener('gamepaddisconnected', () => { if (!(navigator.getGamepads?.() || []).some(Boolean)) { clearInterval(pad); pad = 0; } });
function poll() {
  if (inGame() || bossOn() || !active()) { last = ''; return; }
  const g = [...(navigator.getGamepads?.() || [])].find(Boolean); if (!g) return;
  const b = (i) => g.buttons[i]?.pressed, ax = g.axes[0] || 0, ay = g.axes[1] || 0;
  const state = [b(12) || ay < -0.6 ? 'up' : b(13) || ay > 0.6 ? 'down' : b(14) || ax < -0.6 ? 'left' : b(15) || ax > 0.6 ? 'right' : '', b(0) ? 'a' : '', b(1) ? 'b' : ''].join('|');
  if (state === last) { if (++held < 4 || !/^(up|down|left|right)/.test(state)) return; } else held = 0; // auto-repeat directions after ~360 ms
  const [d, a, bb] = state.split('|');
  if (d) move(d);
  if (a && last.split('|')[1] !== 'a') document.activeElement?.click?.();
  if (bb && last.split('|')[2] !== 'b') back();
  last = state;
}
