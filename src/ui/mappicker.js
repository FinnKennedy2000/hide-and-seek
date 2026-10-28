// Map picker shared by the title screen and the online lobby. Any number of maps from MAPS: thumbnail via meta.thumbnail when present,
// else a placeholder gradient built from the map's own fog / ambient colours, plus a recommended player count.
import { MAPS } from '../shared/maps/index.js';
import { pick } from '../core/util.js';

const hex = (n, d = '#2b1f4d') => (Number.isFinite(n) ? '#' + n.toString(16).padStart(6, '0') : d);
// meta.players: 4 | [2, 4] | '2-4' | {min, max, recommended}. Fallback: guessed from the map's footprint.
export function playersLabel(meta) {
  let p = meta.players ?? meta.recommended ?? meta.recommendedPlayers;
  if (p == null) {
    const b = meta.bounds, area = b ? (b.x1 - b.x0) * (b.z1 - b.z0) : 2000;
    p = area < 1200 ? [2, 4] : area < 3000 ? [4, 6] : [6, 8];
  }
  if (Array.isArray(p)) p = `${p[0]}–${p[1]}`; else if (typeof p === 'object') p = p.recommended ? String(p.recommended).replace('-', '–') : `${p.min}–${p.max}`;
  return `${p} players`;
}
export const randomMapId = (ids = Object.keys(MAPS)) => pick(ids);

// onPick(id); `current` is the selected id. Re-render to refresh. disabled: show but do not allow changes (lobby guests).
export function renderMapPicker(box, { current, onPick, disabled = false, onRandom = null, ids = Object.keys(MAPS) }) { // ids: subset to show (trial mode: maps that have a trial layout)
  const have = [...box.children].filter((n) => n.dataset.map).map((n) => n.dataset.map);
  if (have.length === ids.length && have.every((id, i) => id === ids[i]) && !!box.querySelector('.rand') === !!onRandom) { // same cards: update state in place so keyboard focus survives
    for (const b of box.children) {
      if (b.dataset.map) { b.setAttribute('aria-checked', String(b.dataset.map === current)); b.disabled = disabled; b.onclick = () => onPick(b.dataset.map); }
      else b.onclick = onRandom;
    }
    return;
  }
  box.textContent = '';
  for (const id of ids) {
    const m = MAPS[id], meta = m.meta, b = document.createElement('button');
    b.type = 'button'; b.className = 'map'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(id === current)); b.dataset.map = id; b.disabled = disabled;
    const th = document.createElement('span'); th.className = 'th'; th.setAttribute('aria-hidden', 'true');
    if (meta.thumbnail) th.style.backgroundImage = `url(${JSON.stringify(meta.thumbnail)})`;
    else { th.style.backgroundImage = `linear-gradient(155deg, ${hex(meta.ambient?.color)}, ${hex(meta.fog?.color)})`; th.textContent = meta.name.slice(0, 1); }
    const info = document.createElement('span'); info.className = 'meta';
    const nm = document.createElement('b'); nm.textContent = meta.name;
    const sm = document.createElement('small'); sm.textContent = playersLabel(meta);
    info.append(nm, sm); b.append(th, info);
    b.onclick = () => onPick(id);
    box.append(b);
  }
  if (onRandom) { // host-only "Random" card, part of the same list so focus handling stays in one place
    const r = document.createElement('button'); r.type = 'button'; r.className = 'map rand ghost';
    r.innerHTML = '<span class="th" aria-hidden="true">?</span><span class="meta"><b>Random</b><small>Pick for me</small></span>'; r.onclick = onRandom; box.append(r);
  }
}
