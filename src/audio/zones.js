// Acoustic zones: where you stand decides the reverb (room / hall / outdoor) and the footstep surface.
// A map may declare meta.zones = [{x0,x1,z0,z1,reverb,surface}] (first match wins; outside = meta.outdoor);
// maps that do not get the defaults below, unknown maps are treated as grass + outdoor.
import { meta } from '../world/build.js';

const DEFAULTS = {
  house: { zones: [{ x0: -8, x1: 8, z0: -6, z1: 6, reverb: 'room', surface: 'wood' }], outdoor: { reverb: 'outdoor', surface: 'grass' } },
  lateshop: { zones: [{ x0: -20, x1: 20, z0: -16, z1: 8, reverb: 'hall', surface: 'tile' }], outdoor: { reverb: 'outdoor', surface: 'concrete' } },
};
const FALLBACK = { zones: [], outdoor: { reverb: 'outdoor', surface: 'grass' } };

// Maps may give zones as {box:{x0..}, reverb:'small'|'hall'|'outdoor'} with no surface (the world remaster's shape):
// flatten the box, map 'small' to 'room', and take the surface from this map's defaults. Cached per meta object.
const REVERB = { small: 'room' };
let cMeta = null, cCfg = FALLBACK;
function cfg() {
  if (meta === cMeta) return cCfg;
  const d = DEFAULTS[meta?.id] || FALLBACK, inSurf = d.zones[0]?.surface || 'wood';
  cMeta = meta;
  cCfg = !meta?.zones ? d : {
    outdoor: meta.outdoor || d.outdoor,
    zones: meta.zones.map((q) => {
      const b = q.box || q, reverb = REVERB[q.reverb] || q.reverb || 'room';
      return { ...q, x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1, reverb, surface: q.surface || (reverb === 'outdoor' ? d.outdoor.surface : inSurf) };
    }),
  };
  return cCfg;
}
export function zoneAt(x, z) {
  const c = cfg();
  for (const q of c.zones) if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return q;
  return c.outdoor;
}
export const surfacesOf = () => { const c = cfg(); return [...new Set([...c.zones, c.outdoor].map((q) => q.surface))]; };
