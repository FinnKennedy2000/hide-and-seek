// Acoustic zones: where you stand decides the reverb (room / hall / outdoor) and the footstep surface.
// A map may declare meta.zones = [{x0,x1,z0,z1,reverb,surface}] (first match wins; outside = meta.outdoor);
// maps that do not get the defaults below, unknown maps are treated as grass + outdoor.
import { meta } from '../world/build.js';

const DEFAULTS = {
  house: { zones: [{ x0: -8, x1: 8, z0: -6, z1: 6, reverb: 'room', surface: 'wood' }], outdoor: { reverb: 'outdoor', surface: 'grass' } },
  lateshop: { zones: [{ x0: -20, x1: 20, z0: -16, z1: 8, reverb: 'hall', surface: 'tile' }], outdoor: { reverb: 'outdoor', surface: 'concrete' } },
};
const FALLBACK = { zones: [], outdoor: { reverb: 'outdoor', surface: 'grass' } };

const cfg = () => (meta?.zones ? { zones: meta.zones, outdoor: meta.outdoor || FALLBACK.outdoor } : DEFAULTS[meta?.id] || FALLBACK);
export function zoneAt(x, z) {
  const c = cfg();
  for (const q of c.zones) if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return q;
  return c.outdoor;
}
export const surfacesOf = () => { const c = cfg(); return [...new Set([...c.zones, c.outdoor].map((q) => q.surface))]; };
