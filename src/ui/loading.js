// Loading screen driven by real asset progress. assets.loadGroup emits 'progress' {group, done, total}; the overlay shows while any
// group is in flight, aggregates all groups, never moves backwards, and hands focus back to the menu when everything has landed.
import { $ } from '../core/util.js';
import { bus } from '../core/bus.js';
import { loadGroup } from '../core/assets.js';

const groups = new Map(); // name -> {done,total}
let shown = 0, hideT = 0, label = 'Loading';

export function loading(progress, text) { // progress 0..1 shows / updates; null|false hides
  const el = $('loading');
  if (progress == null || progress === false) { clearTimeout(hideT); el.classList.add('hidden'); shown = 0; return; }
  if (el.classList.contains('hidden')) {
    el.classList.remove('hidden'); shown = 0; // (the overlay covers the pointer; nav.js ignores keys while it shows)
  }
  clearTimeout(hideT);
  shown = Math.max(shown, Math.min(1, progress)); // monotonic
  if (text) label = text;
  $('loadFill').style.transform = `scaleX(${shown.toFixed(3)})`;
  const pct = Math.round(shown * 100);
  $('loadBar').setAttribute('aria-valuenow', String(pct));
  $('loadPct').textContent = `${pct}%`; $('loadLabel').textContent = label;
  if (progress >= 1) hideT = setTimeout(() => { loading(null); focusMenu(); }, 120); // short debounce: back-to-back groups do not flicker the overlay
}
const focusMenu = () => { const t = document.querySelector('.panelwrap:not(.hidden) button:not(:disabled), .panelwrap:not(.hidden) input'); t?.focus({ preventScroll: true }); };

bus.on('progress', ({ group, done, total }) => {
  groups.set(group, { done, total });
  let d = 0, t = 0;
  for (const g of groups.values()) { d += g.done; t += g.total; }
  if (t) loading(d / t, `Loading ${group}`);
  if (d >= t) groups.clear();
});

// preload(name, entries): convenience for boot code, loadGroup + overlay. Returns the loaded Map.
export const preload = (name, entries) => loadGroup(name, entries);
