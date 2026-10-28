// Deterministic world layout shared by the client (src/world/build.js) and the server (hit detection, prop table).
// No THREE and no DOM in here. `buildWorld(v)` records colliders and disguisable props; the optional visual
// callbacks `v` (client only) turn each call into meshes/lights. Same code + seeded RNG = identical lists everywhere.
// `buildWorld(v, mapId)` builds one of the maps in MAPS (maps/index.js, the append-only registry; one file per map in maps/).
import { MAPS } from './maps/index.js';
export { MAPS };

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

// Ray vs axis-aligned box {x0,x1,y0,y1,z0,z1}: entry distance along the (unit) ray, or -1 on a miss.
export function rayBox(ox, oy, oz, dx, dy, dz, c) {
  let t0 = 0, t1 = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [c.x0, c.y0, c.z0], hi = [c.x1, c.y1, c.z1];
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return -1; continue; }
    let a = (lo[k] - o[k]) / d[k], b = (hi[k] - o[k]) / d[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return -1;
  }
  return t0;
}

const EXT = { // half extents of a mesh spec, only used to size prop bounds
  ico: ([, r]) => [r, r, r], sphere: ([, r]) => [r, r, r],
  cyl: ([, rt, rb, h]) => [Math.max(rt, rb), h / 2, Math.max(rt, rb)], plane: ([, w, h]) => [w / 2, h / 2, 0],
};

export function buildWorld(v = {}, mapId = 'house') {
  if (!Object.hasOwn(MAPS, mapId)) throw new Error(`unknown map ${mapId}`);
  const colliders = [], props = [];
  let cur = -1, bb = null;
  const rand = mulberry32(20240607);
  const rnd = (a, c) => a + rand() * (c - a);
  const T = 0.2, H = 3;
  const grow = (x0, x1, y0, y1, z0, z1) => {
    if (!bb) return;
    bb.x0 = Math.min(bb.x0, x0); bb.x1 = Math.max(bb.x1, x1); bb.y0 = Math.min(bb.y0, y0); bb.y1 = Math.max(bb.y1, y1); bb.z0 = Math.min(bb.z0, z0); bb.z1 = Math.max(bb.z1, z1);
  };
  const b = {
    box(cx, cz, w, d, h, mat, o = {}) {
      const y0 = o.y0 ?? 0;
      if (o.collide !== false) colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, y0, y1: y0 + h });
      grow(cx - w / 2, cx + w / 2, y0, y0 + h, cz - d / 2, cz + d / 2);
      return v.box?.(cx, cz, w, d, h, mat, o, cur);
    },
    mesh(geo, mat, x, y, z, o = {}) {
      const e = EXT[geo[0]](geo).map((q, i) => q * (o.s ? o.s[i] : 1));
      grow(x - e[0], x + e[0], y - e[1], y + e[1], z - e[2], z + e[2]);
      return v.mesh?.(geo, mat, x, y, z, o, cur);
    },
    // Placed GLB model (client: src/world/models.js, instanced). o: {ry=0, s=1, w, d, h, y0=0, collide=true, deco}. w/d/h = collider size before rotation.
    model(name, x, z, o = {}) {
      const { ry = 0, y0 = 0 } = o, c = Math.abs(Math.cos(ry)), sn = Math.abs(Math.sin(ry));
      const hw = ((o.w ?? 1) * c + (o.d ?? 1) * sn) / 2, hd = ((o.w ?? 1) * sn + (o.d ?? 1) * c) / 2; // AABB of the rotated footprint
      if (o.collide !== false && o.w != null && o.d != null && o.h != null) colliders.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, y0, y1: y0 + o.h });
      grow(x - hw, x + hw, y0, y0 + (o.h ?? 1), z - hd, z + hd);
      return v.model?.(name, x, z, o, cur);
    },
    collider(c) { colliders.push(c); grow(c.x0, c.x1, c.y0, c.y1, c.z0, c.z1); },
    light(x, y, z, intensity, dist, color) { v.light?.(x, y, z, intensity, dist, color); },
    books(cx, cz, len) { v.books?.(cx, cz, len, cur); },
    prop(name, fn) { // everything built inside fn is one disguisable prop; its id is its index
      cur = props.length; bb = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
      fn();
      props.push({ id: cur, name, x: (bb.x0 + bb.x1) / 2, z: (bb.z0 + bb.z1) / 2, y0: bb.y0, w: bb.x1 - bb.x0, d: bb.z1 - bb.z0, h: bb.y1 - bb.y0 });
      cur = -1; bb = null;
    },
  };

  MAPS[mapId].build(b, rnd);
  return { colliders, props };
}
