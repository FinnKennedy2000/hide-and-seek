// Navigation grid, A*-ish (BFS + string-pulling) pathing and line of sight over a collider list. No DOM, no THREE:
// the client AI (src/ai/nav.js) and the server (bots, interest management) both build one from the shared world colliders.
// Grid: 0.5 m cells. Maps inside +-35 m use the original fixed 140 x 140 grid; a bigger map (Coldwood estate, +-66 m) gets a square grid
// over its bounds + 1 m (268 x 268 = 72k cells). Search buffers are allocated once per grid, not per path.
const CELL = 0.5, NR = 0.3, PULL = 48; // big grids: string-pulling looks at most PULL path cells ahead (keeps a 130 m path O(n * PULL))
export function gridFor(b) {
  if (!b || (b.x0 >= -35 && b.z0 >= -35 && b.x1 <= 35 && b.z1 <= 35)) return { NG: 140, NMIN: -35 };
  const NMIN = Math.floor(Math.min(b.x0, b.z0)) - 1, NG = Math.ceil((Math.max(b.x1, b.z1) + 1 - NMIN) / CELL);
  return { NG, NMIN };
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const turnTo = (cur, target, rate) => cur + clamp(((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -rate, rate);
const NEI = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DI = NEI.map((n) => n[0]), DJ = NEI.map((n) => n[1]);

// colliders: the array is read live, so a caller that refills it in place only needs to call buildNav() again.
// bounds: the map's meta.bounds (sizes the grid); buildNav(bounds) may pass new bounds when the same colliders array now holds another map.
// Colliders flagged `ns` (see-through: cage bars, the invisible fence line, the pond edge) block walking but not losClear.
export function createNav(colliders, bounds) {
  let NG = 0, NMIN = 0, blocked = null, prev = null, q = null, gs = null, hf = null;
  function size(b) {
    const g = gridFor(b); if (g.NG === NG && g.NMIN === NMIN) return;
    ({ NG, NMIN } = g); blocked = new Uint8Array(NG * NG); prev = new Int32Array(NG * NG); q = new Int32Array(NG * NG * (NG > 140 ? 8 : 1)); // (A*: a cell can be in the heap once per improving neighbour, at most 8)
    if (NG > 140) { gs = new Float32Array(NG * NG); hf = new Float32Array(NG * NG * 8); } // A* g-scores and heap keys
  }
  size(bounds);
  function buildNav(b) { // rasterise the low colliders into the grid
    if (b) size(b);
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
  function bfs(s, g) { // the original search (maps inside +-35 m): BFS, every step costs the same
    let qh = 0, qt = 0; q[qt++] = s; prev[s] = -1;
    while (qh < qt && prev[g] === -2) {
      const cur = q[qh++], ci = cur % NG, cj = (cur / NG) | 0;
      for (let k = 0; k < 8; k++) { // (indexed, not `for of NEI`: this loop runs ~70k times per path on the estate grid)
        const di = DI[k], dj = DJ[k], i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= NG || j >= NG) continue;
        const n = j * NG + i;
        if (prev[n] !== -2 || blocked[n]) continue;
        if (k >= 4 && (blocked[cj * NG + i] || blocked[j * NG + ci])) continue;
        prev[n] = cur; q[qt++] = n;
      }
    }
  }
  // big grids: A* with the octile heuristic (diagonal = sqrt 2) over a binary heap; expands a corridor instead of the whole 72k-cell grid
  function astar(s, g, gi, gj) {
    gs.fill(Infinity); gs[s] = 0; prev[s] = -1;
    let hn = 0;
    const h = (n) => { const dx = Math.abs((n % NG) - gi), dz = Math.abs(((n / NG) | 0) - gj); return Math.max(dx, dz) + 0.41421356 * Math.min(dx, dz); };
    const push = (n, f) => { let k = hn++; while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= f) break; q[k] = q[p]; hf[k] = hf[p]; k = p; } q[k] = n; hf[k] = f; };
    const pop = () => { const top = q[0], n = q[--hn], f = hf[hn]; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && hf[c + 1] < hf[c]) c++; if (hf[c] >= f) break; q[k] = q[c]; hf[k] = hf[c]; k = c; } q[k] = n; hf[k] = f; return top; };
    push(s, h(s));
    while (hn) {
      const f = hf[0], cur = pop(); if (cur === g) return;
      const ci = cur % NG, cj = (cur / NG) | 0, g0 = gs[cur];
      if (f > g0 + h(cur) + 1e-4) continue; // stale heap entry (the cell was reached more cheaply since)
      for (let k = 0; k < 8; k++) {
        const i = ci + DI[k], j = cj + DJ[k];
        if (i < 0 || j < 0 || i >= NG || j >= NG) continue;
        const n = j * NG + i; if (blocked[n]) continue;
        if (k >= 4 && (blocked[cj * NG + i] || blocked[j * NG + ci])) continue;
        const ng = g0 + (k >= 4 ? 1.41421356 : 1);
        if (ng >= gs[n]) continue;
        gs[n] = ng; prev[n] = cur; push(n, ng + h(n));
      }
    }
  }
  function findPath(sx, sz, gx, gz) {
    const [si, sj] = nearestFree(sx, sz), [gi, gj] = nearestFree(gx, gz);
    prev.fill(-2);
    const s = sj * NG + si, g = gj * NG + gi;
    if (NG > 140) astar(s, g, gi, gj); else bfs(s, g);
    const pts = [];
    if (prev[g] !== -2) for (let n = g; n !== -1; n = prev[n]) pts.push({ x: NMIN + ((n % NG) + 0.5) * CELL, z: NMIN + (((n / NG) | 0) + 0.5) * CELL });
    pts.reverse();
    pts.unshift({ x: sx, z: sz });
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = NG > 140 ? Math.min(pts.length - 1, i + PULL) : pts.length - 1;
      while (j > i + 1 && !lineFree(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); i = j;
    }
    out.push({ x: gx, z: gz });
    return out;
  }
  // path length in metres from a fixed point to every cell (8-connected BFS steps, diagonal = sqrt 2 x cell, no string pulling: an
  // over-estimate of the walking distance by at most ~8 %). Returns (x, z) -> metres, Infinity when unreachable. Used for spawn picks.
  function distField(x, z) {
    const [si, sj] = nearestFree(x, z), dist = new Float32Array(NG * NG).fill(Infinity);
    const qq = []; dist[sj * NG + si] = 0; qq.push(sj * NG + si);
    for (let h = 0; h < qq.length; h++) { // label-correcting BFS: a cell is re-queued whenever it gets shorter, so the result is exact
      const cur = qq[h], ci = cur % NG, cj = (cur / NG) | 0, d0 = dist[cur];
      for (const [di, dj] of NEI) {
        const i = ci + di, j = cj + dj;
        if (i < 0 || j < 0 || i >= NG || j >= NG) continue;
        const n = j * NG + i; if (blocked[n] || (di && dj && (blocked[cj * NG + i] || blocked[j * NG + ci]))) continue;
        const nd = d0 + (di && dj ? Math.SQRT2 : 1) * CELL;
        if (nd < dist[n] - 1e-6) { dist[n] = nd; qq.push(n); }
      }
    }
    return (px, pz) => { const [i, j] = nearestFree(px, pz); return dist[j * NG + i]; };
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
      if (c.ns) continue;
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
  return { buildNav, findPath, follow, losClear, nearestFree, reachableFrom, distField, grid: () => ({ NG, NMIN, CELL }) };
}
