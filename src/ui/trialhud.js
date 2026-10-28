// Trial mode HUD: relic slots, survivor panel, seeker power button, prompt + channel bar, big toasts, gate banner,
// terror vignette, hidden indicator, edge-of-screen alert arrows and the results card.
// Every export is safe to call at any time (the DOM is built lazily, nothing throws) and idempotent; resetTrialHud() clears all state.
// Markup is built here (appended to #hud); styling is the "TRIAL HUD" block in src/styles/ui.css.
import * as THREE from 'three';
import { $ } from '../core/util.js';
import { settings } from '../core/settings.js';
import { guarded } from '../shared/trial.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (inner, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${inner}</svg>`;
// 24x24 line icons, drawn with currentColor
const IC = {
  relic: svg('<rect x="7.5" y="3" width="9" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M7.5 6.5h9M7.5 17.5h9" stroke="currentColor" stroke-width="1.8"/><path class="fl" d="M13 8.5l-3 4h2.500l-1 3.500 3.500-4.500h-2.500z" fill="currentColor"/>'),
  free: svg('<circle cx="12" cy="12" r="6.5" fill="currentColor"/>'),
  injured: svg('<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 5.5a6.5 6.5 0 0 0 0 13z" fill="currentColor"/>'),
  caged: svg('<path d="M5 9a7 7 0 0 1 14 0v11H5z M9 9v11M15 9v11M12 9v11M5 20h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 2v3" stroke="currentColor" stroke-width="1.8"/>'),
  out: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>'),
  escaped: svg('<path d="M10 4H5v16h5M9 12h11M16 8l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" fill="currentColor"/>'),
  eyeOff: svg('<path d="M2 12s4-7 10-7c2 0 3.8.8 5.3 1.8M22 12s-4 7-10 7c-2 0-3.800-.8-5.300-1.800" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>'),
  tracker: svg('<path d="M12 3c-1.5 3-5 4-5 8a5 5 0 0 0 10 0c0-4-3.500-5-5-8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="1.800" fill="currentColor"/><path d="M12 18v3M8 20h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
  phantom: svg('<path d="M5 21V11a7 7 0 0 1 14 0v10l-2.500-2-2 2-2.500-2-2.500 2-2-2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="9.500" cy="11" r="1.300" fill="currentColor"/><circle cx="14.500" cy="11" r="1.300" fill="currentColor"/>'),
  trapper: svg('<path d="M3 15a9 9 0 0 1 18 0zM3 15l2 4h14l2-4M6 15l1.500-3 1.500 3 1.500-3 1.500 3 1.500-3 1.500 3 1.500-3 1.500 3" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"/>'),
  charger: svg('<path d="M3 8c2 0 3 2 5 2h8c2 0 3-2 5-2-.5 4-2 6-4 7v4h-3v-3h-4v3H7v-4C5 14 3.500 12 3 8z" fill="none" stroke="currentColor" stroke-width="1.800" stroke-linejoin="round"/>'),
  arrow: svg('<path d="M12 3l8 16-8-4-8 4z" fill="currentColor" stroke="#000" stroke-width="1.200" stroke-linejoin="round"/>'),
};
const CLS = { tracker: ['The Tracker', 'Scent Burst'], phantom: ['The Phantom', 'Cloak'], trapper: ['The Trapper', 'Bear Trap'], charger: ['The Brute', 'Rush'] };
const ST = { free: 'Free', injured: 'Injured', caged: 'Caged', out: 'Eliminated', escaped: 'Escaped' };
const ALERT_COL = { relic: '--lamp', scream: '--bad', gate: '--hide', trap: '--seek', cage: '--bad', hit: '--chalk' }; // css vars; trialfx colours match
const ALERT_LABEL = { relic: 'Fuse', scream: 'Scream', gate: 'Gate', trap: 'Trap', cage: 'Cage', hit: 'Hit' };
const ALERT_LIFE = 6, MAX_ALERTS = 8;

const T = { role: null, cls: null, need: 3, done: 0, prog: new Map(), doneSet: new Set(), players: new Map(), alerts: [], cd: 0, cdMax: 0, powerOn: false, nodes: [], built: false };
const el = {};
let toastT = 0, bannerT = 0, expT = 0;

function mk(tag, cls, html, parent) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; parent?.append(e); return e; }
const safe = guarded('trialhud');

function build() {
  if (T.built) return true;
  const hud = $('hud'); if (!hud) return false;
  const root = el.root = mk('div', 'hidden', null, hud); root.id = 'trial';
  el.shade = mk('div', null, null, root); el.shade.id = 'trShade';
  el.terror = mk('div', null, null, root); el.terror.id = 'trTerror';
  el.slots = mk('div', null, null, root); el.slots.id = 'trRelics'; el.slots.setAttribute('role', 'img');
  el.hint = mk('div', null, null, root); el.hint.id = 'trHint';
  el.panel = mk('ul', null, null, root); el.panel.id = 'trPlayers'; el.panel.setAttribute('aria-label', 'Survivors');
  el.power = mk('div', null, `<span class="ring"></span><span class="ico"></span><kbd>Q</kbd><span class="cdn"></span><span class="cnt"></span><span class="nm"></span>`, root); el.power.id = 'trPower'; el.power.classList.add('hidden');
  el.prompt = mk('div', null, `<span class="pt"></span><span class="bar"><i></i></span>`, root); el.prompt.id = 'trPrompt';
  el.toast = mk('div', null, null, root); el.toast.id = 'trToast';
  el.banner = mk('div', null, null, root); el.banner.id = 'trBanner';
  el.strike = mk('div', null, `<i></i><i></i><i></i><i></i><b></b>`, root); el.strike.id = 'trStrike';
  el.edges = mk('div', null, null, root); el.edges.id = 'trEdges';
  el.chip = mk('div', 'hidden', `${IC.eyeOff}<span>HIDDEN</span>`, root); el.chip.id = 'trHidden';
  el.exp = mk('div', 'hidden', `${IC.eye}<span>THE KILLER KNOWS WHERE YOU ARE</span>`, root); el.exp.id = 'trExposed';
  el.beat = mk('div', 'hidden', `<span>HEARTBEAT - THE KILLER IS NEAR</span>`, root); el.beat.id = 'trBeat';
  el.live = mk('div', 'sr', null, root); el.live.id = 'trLive'; el.live.setAttribute('role', 'status'); el.live.setAttribute('aria-live', 'polite');
  T.built = true; return true;
}
const say = (s) => { if (el.live) el.live.textContent = s; };

export const initTrialHud = safe(() => { build(); });

function drawSlots() {
  const need = T.need, n = Math.min(T.done, need);
  let best = 0; for (const [i, p] of T.prog) if (!T.doneSet.has(i)) best = Math.max(best, p);
  el.slots.innerHTML = '';
  for (let k = 0; k < need; k++) {
    const s = mk('span', 'slot' + (k < n ? ' on' : ''), IC.relic, el.slots);
    if (k === n && best > 0) { s.classList.add('act'); s.style.setProperty('--p', best.toFixed(3)); }
  }
  mk('b', null, `${n}/${need}`, el.slots);
  el.slots.setAttribute('aria-label', `Fuses installed ${n} of ${need}`);
}

export const resetTrialHud = safe((o) => {
  if (!build()) return;
  clearTimeout(toastT); clearTimeout(bannerT);
  Object.assign(T, { role: o?.role ?? null, cls: o?.cls ?? null, need: o?.need ?? 3, done: 0, cd: 0, cdMax: 0, powerOn: false });
  T.prog.clear(); T.doneSet.clear(); T.players.clear(); T.alerts.length = 0; clearTimeout(expT); lastTerror = -1;
  for (const n of o?.relics || []) if (n?.p > 0) T.prog.set(n.i, n.p); // resume
  for (const n of o?.relics || []) if (n?.done) { T.doneSet.add(n.i); T.done++; }
  el.root.classList.toggle('hidden', !o?.role);
  el.root.dataset.role = o?.role || '';
  el.panel.innerHTML = ''; el.edges.innerHTML = ''; T.nodes.length = 0;
  el.toast.className = ''; el.toast.textContent = ''; el.banner.className = ''; el.banner.textContent = '';
  el.power.classList.add('hidden'); el.power.classList.remove('on', 'cool'); el.prompt.classList.remove('show');
  el.terror.style.opacity = '0'; el.terror.classList.remove('beat'); el.chip.classList.add('hidden'); el.exp.classList.add('hidden'); el.beat.classList.add('hidden'); el.shade.classList.remove('on');
  drawSlots();
  el.hint.textContent = o?.role === 'hider' ? 'Power the gate: install 3 fuses (hold E), then reach a gate. Hide in tall grass. Free caged friends.' : o?.role === 'seeker' ? 'Hunt them down. Hit twice to cage. Watch the edge arrows.' : '';
  el.hint.classList.toggle('hidden', !o?.role);
  if (o?.role === 'seeker') setPower({ cls: o.cls, cd: 0, on: false, n: 0 });
});

export const setRelicProgress = safe((i, p) => {
  if (!build() || T.doneSet.has(i)) return;
  p = Math.min(1, Math.max(0, +p || 0)); if (T.prog.get(i) === p) return;
  T.prog.set(i, p); drawSlots();
});

function toast(msg, cls, ms = 2600) {
  const t = el.toast; t.textContent = msg; t.className = '';
  void t.offsetWidth; t.className = `show ${cls || ''}`; // restart the css animation
  clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, ms);
}

export const relicDone = safe((n, need, byName) => {
  if (!build()) return;
  need = need || T.need; T.need = need; T.done = Math.max(T.done, n);
  // the finished relic is whichever one had the most progress
  let top = -1, tp = -1; for (const [i, p] of T.prog) if (!T.doneSet.has(i) && p > tp) { top = i; tp = p; }
  if (top >= 0) { T.doneSet.add(top); T.prog.delete(top); }
  drawSlots();
  const msg = `FUSE ${n}/${need} INSTALLED`;
  toast(msg, 'relic'); say(byName ? `${msg} by ${byName}` : msg);
  if (byName) { el.toast.dataset.by = byName; } else delete el.toast.dataset.by;
});

export const gatesOpen = safe(() => {
  if (!build()) return;
  const b = el.banner; b.textContent = 'EXIT POWER RESTORED - REACH A GATE'; b.className = ''; void b.offsetWidth; b.className = 'show';
  clearTimeout(bannerT); bannerT = setTimeout(() => { b.classList.add('rest'); }, 4500); // shrinks to a quiet strip, stays up
  say('Exit power restored. Reach a gate.'); toast('EXIT POWERED', 'gate', 2400);
});

export const setPlayerState = safe((id, name, st) => {
  if (!build()) return;
  let r = T.players.get(id);
  if (!r) {
    const li = mk('li', null, `<span class="ic"></span><span class="nm"></span><span class="st"></span>`, el.panel);
    r = { li, ic: li.children[0], nm: li.children[1], st: li.children[2], cur: null };
    T.players.set(id, r);
  }
  if (name != null) r.nm.textContent = name;
  const s = ST[st] ? st : 'free';
  if (r.cur === s) return;
  const prev = r.cur; r.cur = s;
  r.li.dataset.st = s; r.ic.innerHTML = IC[s]; r.st.textContent = ST[s];
  if (prev) say(`${r.nm.textContent} is ${ST[s].toLowerCase()}`);
});

export const setPower = safe((p) => {
  if (!build() || !p) return;
  const cls = p.cls || T.cls; T.cls = cls;
  const [cn, pn] = CLS[cls] || ['Power', 'Power'];
  const b = el.power; b.classList.toggle('hidden', T.role === 'hider' || !T.role);
  if (b.dataset.cls !== cls) { b.dataset.cls = cls || ''; b.querySelector('.ico').innerHTML = IC[cls] || IC.eye; b.querySelector('.nm').textContent = pn; b.title = `${cn}: ${pn}`; }
  const cd = Math.max(0, +p.cd || 0);
  if (cd > T.cd + 0.3 || T.cdMax === 0) T.cdMax = Math.max(cd, T.cdMax * 0); // new cooldown started
  T.cd = cd; T.powerOn = !!p.on;
  b.classList.toggle('on', T.powerOn);
  const cnt = b.querySelector('.cnt'); cnt.textContent = cls === 'trapper' ? `x${p.n | 0}` : ''; b.classList.toggle('empty', cls === 'trapper' && !(p.n > 0));
  paintCd();
});
function paintCd() {
  const b = el.power; if (!b) return;
  const f = T.cdMax > 0 ? Math.min(1, T.cd / T.cdMax) : 0;
  b.style.setProperty('--cd', f.toFixed(3)); b.classList.toggle('cool', T.cd > 0.05);
  b.querySelector('.cdn').textContent = T.cd > 0.05 ? String(Math.ceil(T.cd)) : '';
}

export const setPrompt = safe((text, progress) => {
  if (!build()) return;
  const p = el.prompt, has = text != null && text !== '';
  p.classList.toggle('show', has);
  if (!has) return;
  const t = p.firstChild; if (t.textContent !== text) t.textContent = text;
  const bar = p.lastChild, on = progress != null;
  bar.classList.toggle('on', on);
  if (on) bar.style.setProperty('--p', Math.min(1, Math.max(0, progress)).toFixed(3));
});

let lastTerror = -1;
export const terror = safe((k) => {
  if (!build()) return;
  k = Math.min(1, Math.max(0, +k || 0)); if (k === lastTerror) return; lastTerror = k;
  const t = el.terror; t.style.opacity = (k * 0.9).toFixed(2);
  t.style.setProperty('--beat', `${(1.15 - 0.65 * k).toFixed(2)}s`);
  t.classList.toggle('beat', k > 0);
  el.beat.classList.toggle('hidden', !(k > 0 && settings.cues));
});

// seeker swing result at the crosshair: red X + HIT (hit), grey ring + MISS (miss); re-triggerable
export const strike = safe((hit) => {
  if (!build()) return;
  const e = el.strike; e.className = ''; void e.offsetWidth; e.className = hit ? 'hit' : 'miss';
  e.querySelector('b').textContent = hit ? 'HIT' : 'MISS';
  say(hit ? 'Hit' : 'Missed');
});
export const exposed = safe((secs) => {
  if (!build()) return;
  el.exp.classList.remove('hidden'); clearTimeout(expT); expT = setTimeout(() => el.exp.classList.add('hidden'), Math.max(1, secs || 6) * 1000);
  say('You alerted the killer');
});

export const concealed = safe((on) => {
  if (!build()) return;
  on = !!on; if (el.chip.classList.contains('hidden') !== on) return;
  el.chip.classList.toggle('hidden', !on); el.shade.classList.toggle('on', on);
  say(on ? 'Hidden in the grass' : 'No longer hidden');
});

export const edgeAlert = safe((kind, x, z, left) => {
  if (!build() || !Number.isFinite(x) || !Number.isFinite(z)) return;
  const now = performance.now();
  T.alerts = T.alerts.filter((a) => now - a.t0 < ALERT_LIFE * 1000);
  const dup = T.alerts.find((a) => a.kind === kind && Math.hypot(a.x - x, a.z - z) < 1.5);
  if (dup) { dup.t0 = now; dup.left = left; return; }
  T.alerts.push({ kind, x, z, t0: now, left, node: null });
  if (T.alerts.length > MAX_ALERTS) { const o = T.alerts.shift(); o.node?.remove(); }
});

const v3 = new THREE.Vector3();
export const tickTrialHud = safe((dt, camera) => {
  if (!T.built || el.root.classList.contains('hidden')) return;
  if (T.cd > 0) { T.cd = Math.max(0, T.cd - dt); paintCd(); }
  if (!T.alerts.length) return;
  const now = performance.now(), W = window.innerWidth, H = window.innerHeight, m = 38;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
  for (let i = T.alerts.length - 1; i >= 0; i--) {
    const a = T.alerts[i], age = (now - a.t0) / 1000;
    if (age >= (a.left !== undefined ? 0.35 : ALERT_LIFE)) { a.node?.remove(); T.alerts.splice(i, 1); continue; }
    if (!a.node) { a.node = mk('div', 'edge', `<span class="rg"></span><span class="ch">${IC.arrow}<em>${ALERT_LABEL[a.kind] || ''}</em></span>`, el.edges); a.node.style.setProperty('--c', `var(${ALERT_COL[a.kind] || '--chalk'})`); a.node.dataset.kind = a.kind; }
    v3.set(a.x, 1.4, a.z).applyMatrix4(camera.matrixWorldInverse); // camera space: +x right, +y up, -z forward
    let nx = 0, ny = 0, on = false;
    if (v3.z < 0) { nx = v3.x / -v3.z / tanH; ny = v3.y / -v3.z / tanV; on = Math.abs(nx) < 0.9 && Math.abs(ny) < 0.9; }
    let px, py, rot = 0;
    if (on) { px = W / 2 + (nx * W) / 2; py = H / 2 - (ny * H) / 2; }
    else {
      let dx = v3.x, dy = v3.y; if (v3.z < 0 && Math.abs(nx) + Math.abs(ny) > 0) { dx = nx; dy = ny * (H / W) * 1; }
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const s = Math.min((W / 2 - m) / (Math.abs(dx) || 1e-6), (H / 2 - m) / (Math.abs(dy) || 1e-6));
      px = W / 2 + dx * s; py = H / 2 - dy * s; rot = Math.atan2(dx, dy); // 0 = up
    }
    const fade = Math.min(1, a.left ?? (ALERT_LIFE - age)); // the caller passes the seconds left; fades over the last one
    a.node.className = on ? 'edge ring' : 'edge';
    a.node.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px)`;
    a.node.style.opacity = fade.toFixed(2);
    const ar = a.node.querySelector('.ch svg'); if (ar) ar.style.transform = `rotate(${rot.toFixed(3)}rad)`;
  }
});

const esc = (s) => String(s ?? '');
export const showResults = safe((m) => {
  const title = $('resTitle'), sub = $('resSub'), tbl = $('resTable'); if (!title || !tbl || !m) return;
  const hw = m.winner !== 'seekers', mine = m.me ?? m.you;
  const my = m.players?.find((p) => p.id === mine), won = my ? (my.role === 'seeker') !== hw : null;
  // per-viewer headline: a survivor sees ESCAPED / ELIMINATED, the killer KILLER WINS or the survivors' win
  title.textContent = my?.role === 'seeker' ? (hw ? 'SURVIVORS ESCAPED' : 'KILLER WINS') : my?.st === 'escaped' ? 'ESCAPED' : my?.st === 'out' ? 'ELIMINATED' : hw ? 'SURVIVORS ESCAPED' : 'KILLER WINS';
  title.style.color = won == null ? (hw ? 'var(--hide)' : 'var(--seek)') : won ? 'var(--good)' : 'var(--bad)';
  const esc_ = m.escaped ?? m.players.filter((p) => p.st === 'escaped').length, out = m.out ?? m.players.filter((p) => p.st === 'out').length;
  sub.textContent = `${esc_} escaped, ${out} eliminated. ${hw ? 'Enough of them made it through the gates.' : 'Too few made it out alive.'}`;
  tbl.textContent = '';
  const relics = m.players.some((p) => p.relics != null);
  const head = ['PLAYER', 'ROLE', 'STATUS', 'ROUND', 'TOTAL', ...(relics ? ['FUSES'] : []), 'TAGS'];
  const row = (cells, tag = 'td', p) => {
    const tr = tbl.insertRow();
    cells.forEach((v, i) => { const c = document.createElement(tag); c.textContent = v; if (p && i === 0) { const d = document.createElement('i'); d.className = 'dot'; d.style.background = typeof p.color === 'number' ? `#${p.color.toString(16).padStart(6, '0')}` : esc(p.color); c.prepend(d); } if (p && i === 2 && p.st) c.dataset.st = p.st; tr.append(c); });
    if (p && p.id === mine) tr.className = 'me';
  };
  row(head, 'th');
  const order = { escaped: 0, free: 1, caged: 2, out: 3 };
  for (const p of [...m.players].sort((a, b) => (a.role === 'seeker') - (b.role === 'seeker') || (order[a.st] ?? 1) - (order[b.st] ?? 1) || b.total - a.total)) {
    const status = p.role === 'seeker' ? '-' : p.st === 'escaped' ? 'ESCAPED' : p.st === 'out' ? 'ELIMINATED' : p.st === 'caged' ? 'CAGED' : 'SURVIVED';
    row([esc(p.name) + (p.id === mine ? ' (you)' : ''), p.role === 'seeker' ? 'SEEKER' : 'SURVIVOR', status, `+${p.score ?? 0}`, p.total ?? 0, ...(relics ? [p.role === 'seeker' ? '-' : p.relics ?? 0] : []), p.tags ?? 0], 'td', p);
  }
  say(`${title.textContent}. ${sub.textContent}`);
});

export const hideTrialHud = safe(() => { if (T.built) resetTrialHud(null); });
