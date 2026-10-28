// First-play onboarding: one short card per role, shown once (stored in settings.onboarded). Dismiss with Enter, or it fades after 12 s.
import { $ } from '../core/util.js';
import { G, inGame } from '../core/state.js';
import { settings } from '../core/settings.js';
import { bus, EV } from '../core/bus.js';

const ROLES = {
  seeker: { title: 'You are the seeker', lead: 'Count is up. Find every hider before time runs out.', keys: [['E / Click', 'Tag a hider within 3 m'], ['Shift', 'Sprint (loud, they will hear you)'], ['C', 'Crouch to sneak']] },
  hider: { title: 'You are a hider', lead: 'Get out of sight before the seeker is released.', keys: [['WASD', 'Move, find a hiding spot'], ['C', 'Crouch: quieter, harder to spot'], ['Shift', 'Sprint only when you must']] },
  trial_hider: { title: 'You are a survivor', lead: 'Install 3 fuses to power the gate, then escape. One hit hurts, two cages you.', keys: [['WASD / Shift', 'Move / sprint (sprinting is loud)'], ['Hold E', 'Install a fuse, open a gate, free a caged friend'], ['C', 'Crouch still in tall grass to hide'], ['Space', 'Vault low walls'], ['Q', 'Swap camera shoulder'], ['H', 'Show this again']] },
  trial_seeker: { title: 'You are the killer', lead: 'Every fuse installed alerts you. Hit a survivor twice to cage them.', keys: [['Click', 'Swing (hit range about 2.4 m)'], ['Q / Right click', 'Class power'], ['Space', 'Vault low walls (slow)'], ['Edge arrows', 'Point to where a fuse was installed'], ['H', 'Show this again']] },
  prophunt_hider: { title: 'You are a prop', lead: 'Blend in with the furniture. Keep still.', keys: [['F', 'Become the prop you are looking at'], ['R', 'Lock in place'], ['G', 'Camouflage'], ['T', 'Taunt for bonus points']] },
  prophunt_seeker: { title: 'Hunt the props', lead: 'Something in this room is not furniture.', keys: [['Click', 'Fire the blaster'], ['R', 'Reload'], ['Wheel', 'Switch blaster']] },
};
let wasIn = false, token = 0, hideTimer = 0;

function roleKey() {
  const t = $('modeLabel').textContent.toUpperCase(), pro = t.includes('PROP HUNT');
  if (G.mode === 'online') return (pro ? 'prophunt_' : t.includes('TRIAL') ? 'trial_' : '') + (t.startsWith('SEEKER') ? 'seeker' : 'hider');
  return G.mode === 'seek' ? 'seeker' : 'hider';
}
export function dismiss() { clearTimeout(hideTimer); $('onboard').classList.add('hidden'); }

export function showRole(key, force = false) {
  const r = ROLES[key]; if (!r || (settings.onboarded[key] && !force)) return;
  if (!settings.onboarded[key]) settings.set('onboarded', { ...settings.onboarded, [key]: true });
  const el = $('onboard'), seeker = key.endsWith('seeker');
  el.style.setProperty('--role', seeker ? 'var(--seek)' : 'var(--hide)');
  $('obGlyph').innerHTML = seeker ? '<svg viewBox="0 0 44 44"><rect x="9" y="9" width="26" height="26" fill="currentColor" transform="rotate(45 22 22)"/></svg>' : '<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="15" fill="currentColor"/></svg>';
  $('obGlyph').style.color = seeker ? 'var(--seek)' : 'var(--hide)';
  $('obTitle').textContent = r.title; $('obLead').textContent = r.lead;
  const ul = $('obList'); ul.textContent = '';
  for (const [k, d] of r.keys) { const li = document.createElement('li'), kb = document.createElement('kbd'); kb.textContent = k; li.append(kb, d); ul.append(li); }
  el.classList.remove('hidden');
  clearTimeout(hideTimer); hideTimer = setTimeout(dismiss, 12000);
}

// round start = inGame() turning true. Online mode label arrives one frame later, so wait for it.
export function updateOnboarding() {
  const now = inGame();
  if (now && !wasIn) token = 3; // frames to wait for the role label
  wasIn = now;
  if (!now) { if (!$('onboard').classList.contains('hidden')) dismiss(); return; }
  if (token > 0 && --token === 0 && $('modeLabel').textContent) showRole(roleKey());
  else if (token === 0 && !$('onboard').classList.contains('hidden') && G.phase === 'play' && G.t > 12) dismiss();
}
// H re-opens the controls card in a trial round
addEventListener('keydown', (e) => { const k = roleKey(); if (e.code === 'KeyH' && inGame() && k.startsWith('trial_')) { if ($('onboard').classList.contains('hidden')) showRole(k, true); else dismiss(); } });
addEventListener('keydown', (e) => { if (e.code === 'Enter' && !$('onboard').classList.contains('hidden')) { e.preventDefault(); dismiss(); } }, true);
bus.on(EV.ROUND, () => { token = 3; });
