import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Build-time geometry work for the world (owned by the world workstream): world-space UVs, baked vertex-colour AO and box geometry
// (bevelled for disguisable props, subdivided for big flat surfaces so the AO has vertices to land on).

// metres of world per texture repeat; anything not listed maps 1:1
export const TILE = { wall: 2.2, floor: 2.4, wood: 1.2, metal: 1.5, tile: 3.2, asphalt: 3, grass: 3, trim: 1.2, ceiling: 2.2 };

// Box-project the UVs from world position: the dominant normal axis picks the plane. Texture seams between boxes never show
// because every box samples the same world-space grid. Geometry must already be in world space and non-indexed.
export function worldUV(g, matName) {
  const k = 1 / (TILE[matName] ?? 1), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, p.getX(i) * k, p.getZ(i) * k);
    else if (ax >= az) uv.setXY(i, p.getZ(i) * k, p.getY(i) * k);
    else uv.setXY(i, p.getX(i) * k, p.getY(i) * k);
  }
  uv.needsUpdate = true;
}

// ----- ambient occlusion baked into vertex colours.
// For each vertex: sample point q just off the surface, and darken by the distance from q to every solid box (collider) nearby.
// A vertex on a box's own face is skipped for that box (it touches it but q moves away). Cheap: a 2 m bucket grid, a few boxes each.
const R = 0.8, STRENGTH = 0.6, FLOOR = 0.32, OFF = 0.05, BUCKET = 2;
const dist = (x, y, z, c) => {
  const dx = Math.max(c.x0 - x, 0, x - c.x1), dy = Math.max(c.y0 - y, 0, y - c.y1), dz = Math.max(c.z0 - z, 0, z - c.z1);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};
export function bakeAO(geos, colliders) {
  const grid = new Map(), key = (i, j) => i * 4096 + j;
  for (const c of colliders) {
    if (c.y1 - c.y0 < 0.25 || c.y0 > 2.2) continue; // floors, rugs, ceilings, high beams do not occlude
    for (let i = Math.floor((c.x0 - R) / BUCKET); i <= Math.floor((c.x1 + R) / BUCKET); i++) {
      for (let j = Math.floor((c.z0 - R) / BUCKET); j <= Math.floor((c.z1 + R) / BUCKET); j++) {
        const k = key(i, j); (grid.get(k) ?? grid.set(k, []).get(k)).push(c);
      }
    }
  }
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) {
      const x = p.getX(v), y = p.getY(v), z = p.getZ(v), qx = x + n.getX(v) * OFF, qy = y + n.getY(v) * OFF, qz = z + n.getZ(v) * OFF;
      let ao = 1;
      for (const c of grid.get(key(Math.floor(qx / BUCKET), Math.floor(qz / BUCKET))) ?? []) {
        const d = dist(qx, qy, qz, c);
        if (d >= R || (d > 0.04 && dist(x, y, z, c) < 0.004)) continue; // out of range, or this vertex sits on c's own face
        const t = 1 - d / R; ao *= 1 - STRENGTH * t * t;
      }
      ao = Math.max(FLOOR, ao);
      col[v * 3] = col[v * 3 + 1] = col[v * 3 + 2] = ao;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
}

// ----- box geometry
const cache = new Map();
const cached = (k, make) => { let g = cache.get(k); if (!g) { g = make(); cache.set(k, g); } return g; };
const seg = (len) => (len > 2.4 ? Math.min(16, Math.ceil(len / 1.5)) : 1);
// Returns { geo, scaled }: a unit box that the caller scales (scaled: true), or a bevelled box already at its real size.
// bevel: 0 = no bevel; 1 or 2 = RoundedBoxGeometry segments (props only, where the silhouette is read up close).
export function boxGeometry(w, h, d, bevel) {
  if (bevel && Math.min(w, h, d) >= 0.08 && Math.max(w, h, d) <= 3) {
    const r = Math.min(0.035, Math.min(w, h, d) * 0.25), k = [w, h, d, bevel].map((v) => v.toFixed(3)).join();
    return { geo: cached('r' + k, () => new RoundedBoxGeometry(w, h, d, bevel, r)), scaled: false };
  }
  const sx = seg(w), sy = h > 2.4 ? seg(h) : 1, sz = seg(d);
  return { geo: cached(`u${sx},${sy},${sz}`, () => new THREE.BoxGeometry(1, 1, 1, sx, sy, sz)), scaled: true };
}
export const disposeBoxCache = () => { for (const g of cache.values()) g.dispose(); cache.clear(); };
