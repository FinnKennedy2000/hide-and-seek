// Zones (portal-lite room culling). Pure: no THREE, no DOM.
// meta.zones = [{ id, box: [x0, z0, x1, z1], sees?: [ids] }]. A mesh belongs to the zone containing its centre; the camera's zone shows
// itself plus the zones it `sees` (default: every zone whose box touches or comes within TOUCH metres of it, i.e. through doors and windows).
// Each zone gets `vis`, the Set of zone indices drawn while the camera is inside it. No meta.zones: a coarse grid, but only for maps
// heavy enough (AUTO_MIN_TRIS) that culling pays for the extra meshes; small maps stay one merged mesh per material (fewest calls).
export const AUTO_CELL = 16, AUTO_MIN_TRIS = 120000, TOUCH = 1.5;

export function makeZones(meta, tris = 0) {
  const declared = Array.isArray(meta.zones) && meta.zones.length;
  if (!declared && tris < AUTO_MIN_TRIS) return [];
  let list;
  if (declared) list = meta.zones.map((z) => ({ id: z.id, x0: z.box[0], z0: z.box[1], x1: z.box[2], z1: z.box[3], sees: z.sees }));
  else {
    const b = meta.bounds, nx = Math.ceil((b.x1 - b.x0) / AUTO_CELL), nz = Math.ceil((b.z1 - b.z0) / AUTO_CELL); list = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) list.push({ id: `${i},${j}`, x0: b.x0 + i * AUTO_CELL, z0: b.z0 + j * AUTO_CELL, x1: b.x0 + (i + 1) * AUTO_CELL, z1: b.z0 + (j + 1) * AUTO_CELL });
  }
  list.forEach((z, i) => {
    z.vis = new Set([i]);
    list.forEach((o, k) => { if (z.sees ? z.sees.includes(o.id) : (o.x0 - TOUCH <= z.x1 && o.x1 + TOUCH >= z.x0 && o.z0 - TOUCH <= z.z1 && o.z1 + TOUCH >= z.z0)) z.vis.add(k); });
  });
  return list;
}
export function zoneAt(zones, x, z) { for (let i = 0; i < zones.length; i++) { const q = zones[i]; if (x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1) return i; } return -1; }
