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
  if (Array.isArray(p)) p = `${p[0]}–${p[1]}`; else if (typeof p === 'object') p = `${p.min}–${p.max}`;
  return `${p} players`;
}
export const randomMapId = () => pick(Object.keys(MAPS));

// onPick(id); `current` is the selected id. Re-render to refresh. disabled: show but do not allow changes (lobby guests).
export function renderMapPicker(box, { current, onPick, disabled = false }) {
  box.textContent = '';
  for (const [id, m] of Object.entries(MAPS)) {
    const meta = m.meta, b = document.createElement('button');
    b.type = 'button'; b.className = 'map'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(id === current)); b.dataset.map = id; b.disabled = disabled;
    const th = document.createElement('span'); th.className = 'th'; th.setAttribute('aria-hidden', 'true');
    if (meta.thumbnail) th.style.backgroundImage = `url(${meta.thumbnail})`;
    else { th.style.backgroundImage = `linear-gradient(155deg, ${hex(meta.ambient?.color)}, ${hex(meta.fog?.color)})`; th.textContent = meta.name.slice(0, 1); }
    const info = document.createElement('span'); info.className = 'meta';
    const nm = document.createElement('b'); nm.textContent = meta.name;
    const sm = document.createElement('small'); sm.textContent = playersLabel(meta);
    info.append(nm, sm); b.append(th, info);
    b.onclick = () => onPick(id);
    box.append(b);
  }
}
