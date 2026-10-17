// Navigation grid, A*-ish (BFS + string-pulling) pathing and line of sight over a collider list. No DOM, no THREE:
// the client AI (src/ai/nav.js) and the server (bots, interest management) both build one from the shared world colliders.
const NG = 104, CELL = 0.5, NMIN = -26, NR = 0.3;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const turnTo = (cur, target, rate) => cur + clamp(((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -rate, rate);
const NEI = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// colliders: the array is read live, so a caller that refills it in place only needs to call buildNav() again.
export function createNav(colliders) {
  const blocked = new Uint8Array(NG * NG);
  function buildNav() { // rasterise the low colliders into the grid
    blocked.fill(0);
    for (const c of colliders) {
      if (c.y0 > 0.69 || c.y1 < 0.15) continue;
      const i0 = Math.max(0, Math.floor((c.x0 - NR - NMIN) / CELL)), i1 = Math.min(NG - 1, Math.ceil((c.x1 + NR - NMIN) / CELL));
      const j0 = Math.max(0, Math.floor((c.z0 - NR - NMIN) / CELL)), j1 = Math.min(NG - 1, Math.ceil((c.z1 + NR - NMIN) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = NMIN + (i + 0.5) * CELL, z = NMIN + (j + 0.5) * CELL;
        if (x > c.x0 - NR && x < c.x1 + NR && z > c.z0 - NR && z < c.z1 + NR) blocked[j * NG + i] = 1;
      }
    }
  }
  const cellOf = (v) => clamp(Math.floor((v - NMIN) / CELL), 0, NG - 1);
  const isBlocked = (x, z) => blocked[cellOf(z) * NG + cellOf(x)] === 1;
  function nearestFree(x, z) {
    const ci = cellOf(x), cj = cellOf(z);
    if (!blocked[cj * NG + ci]) return [ci, cj];
    let best = null, bd = 1e9;
    for (let r = 1; r < 10 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= NG || j >= NG || blocked[j * NG + i]) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j]; }
    }
    return best || [ci, cj];
  }
  const lineFree = (ax, az, bx, bz) => {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 0.2);
    for (let k = 1; k < n; k++) { const t = k / n; if (isBlocked(lerp(ax, bx, t), lerp(az, bz, t))) return false; }
    return true;
  };
  function findPath(sx, sz, gx, gz) {
    const [si, sj] = nearestFree(sx, sz), [gi, gj] = nearestFree(gx, gz);
    const prev = new Int32Array(NG * NG).fill(-2), q = new Int32Array(NG * NG);
    const s = sj * NG + si, g = gj * NG + gi;
    let qh = 0, qt = 0; q[qt++] = s; prev[s] = -1;
    while (qh < qt && prev[g] === -2) {
      const cur = q[qh++], ci = cur % NG, cj = (cur / NG) | 0;
      for (const [di, dj] of NEI) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= NG || j >= NG) continue;
        const n = j * NG + i;
        if (prev[n] !== -2 || blocked[n]) continue;
        if (di && dj && (blocked[cj * NG + i] || blocked[j * NG + ci])) continue;
        prev[n] = cur; q[qt++] = n;
      }
    }
    const pts = [];
    if (prev[g] !== -2) for (let n = g; n !== -1; n = prev[n]) pts.push({ x: NMIN + ((n % NG) + 0.5) * CELL, z: NMIN + (((n / NG) | 0) + 0.5) * CELL });
    pts.reverse();
    pts.unshift({ x: sx, z: sz });
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !lineFree(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); i = j;
    }
    out.push({ x: gx, z: gz });
    return out;
  }
  // cells reachable (4-connected) from a point: used to drop hiding spots in sealed pockets. Returns (x, z) -> bool.
  function reachableFrom(x, z) {
    const [si, sj] = nearestFree(x, z), seen = new Uint8Array(NG * NG), q = [sj * NG + si]; seen[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const ci = q[h] % NG, cj = (q[h] / NG) | 0;
      for (let k = 0; k < 4; k++) {
        const i = ci + NEI[k][0], j = cj + NEI[k][1];
        if (i < 0 || j < 0 || i >= NG || j >= NG || seen[j * NG + i] || blocked[j * NG + i]) continue;
        seen[j * NG + i] = 1; q.push(j * NG + i);
      }
    }
    return (px, pz) => { const [i, j] = nearestFree(px, pz); return !!seen[j * NG + i]; };
  }
  function follow(a, speed, dt) { // a: {x,z,path,pi,heading} -> true when done
    if (!a.path || a.pi >= a.path.length) return true;
    let rem = speed * dt;
    while (rem > 0 && a.pi < a.path.length) {
      const t = a.path[a.pi], dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz);
      if (d > 0.01) a.heading = turnTo(a.heading, Math.atan2(dx, dz), dt * 10);
      if (d <= rem) { a.x = t.x; a.z = t.z; rem -= d; a.pi++; } else { a.x += (dx / d) * rem; a.z += (dz / d) * rem; rem = 0; }
    }
    return a.pi >= a.path.length;
  }
  function losClear(ax, ay, az, bx, by, bz) { // segment vs every collider box; false when something is in the way
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    for (const c of colliders) {
      let t0 = 0, t1 = 1, hit = true;
      for (let k = 0; k < 3 && hit; k++) {
        const o = k === 0 ? ax : k === 1 ? ay : az, d = k === 0 ? dx : k === 1 ? dy : dz;
        const lo = k === 0 ? c.x0 : k === 1 ? c.y0 : c.z0, hi = k === 0 ? c.x1 : k === 1 ? c.y1 : c.z1;
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) hit = false; continue; }
        let a = (lo - o) / d, b = (hi - o) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) hit = false;
      }
      if (hit) return false;
    }
    return true;
  }
  return { buildNav, findPath, follow, losClear, nearestFree, reachableFrom };
}
