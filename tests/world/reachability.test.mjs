// Flood fill from seekerStart, walking the way player/controller.js does (radius 0.3, crouch height 1.0, ground = highest collider top
// within 0.3 of the feet, colliders whose top is within 0.05 of the feet do not block). Every spot and spawn must be reached and
// must not sit inside a collider; builds must be deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorld, MAPS } from '../../src/shared/worlddata.js';

const CELL = 0.1, MIN = -35, N = 700, R = 0.3, CROUCH = 1.0;
const ci = (v) => Math.floor((v - MIN) / CELL);

function fill(map, colliders) {
  const near = new Map(), under = new Map(), EMPTY = []; // colliders within R of a cell centre / within 0.1 (ground)
  const add = (m, margin, c) => {
    for (let j = Math.max(0, ci(c.z0 - margin)); j <= Math.min(N - 1, ci(c.z1 + margin)); j++) {
      for (let i = Math.max(0, ci(c.x0 - margin)); i <= Math.min(N - 1, ci(c.x1 + margin)); i++) {
        const x = MIN + (i + 0.5) * CELL, z = MIN + (j + 0.5) * CELL;
        if (x > c.x0 - margin && x < c.x1 + margin && z > c.z0 - margin && z < c.z1 + margin) { const k = j * N + i; (m.get(k) ?? m.set(k, []).get(k)).push(c); }
      }
    }
  };
  for (const c of colliders) { add(near, R, c); add(under, 0.1, c); }
  const b = map.meta.bounds, seen = new Map(), reached = new Uint8Array(N * N), stack = [];
  const push = (i, j, h) => { const k = `${i},${j},${Math.round(h * 100)}`; if (seen.has(k)) return; seen.set(k, 1); reached[j * N + i] = 1; stack.push([i, j, h]); };
  const { x, z } = map.meta.seekerStart;
  push(ci(x), ci(z), 0);
  while (stack.length) {
    const [i, j, h] = stack.pop();
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const px = MIN + (ni + 0.5) * CELL, pz = MIN + (nj + 0.5) * CELL;
      if (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1) continue;
      const list = near.get(nj * N + ni) ?? EMPTY;
      if (list.some((c) => !(h >= c.y1 - 0.05 || h + CROUCH <= c.y0))) continue;
      let ground = 0;
      for (const c of under.get(nj * N + ni) ?? EMPTY) if (c.y1 <= h + 0.3 && c.y1 <= 1.2) ground = Math.max(ground, c.y1);
      push(ni, nj, ground);
    }
  }
  return reached;
}

// The AI nav grid exactly as src/ai/nav.js builds it (setSpots drops spots it cannot reach, so none may be dropped).
function navReach(map, colliders) {
  const NG = 140, C = 0.5, M = -35, NR = 0.3, blocked = new Uint8Array(NG * NG), cl = (v) => Math.min(NG - 1, Math.max(0, Math.floor((v - M) / C)));
  for (const c of colliders) {
    if (c.y0 > 0.69 || c.y1 < 0.15) continue;
    for (let j = Math.max(0, Math.floor((c.z0 - NR - M) / C)); j <= Math.min(NG - 1, Math.ceil((c.z1 + NR - M) / C)); j++) {
      for (let i = Math.max(0, Math.floor((c.x0 - NR - M) / C)); i <= Math.min(NG - 1, Math.ceil((c.x1 + NR - M) / C)); i++) {
        const x = M + (i + 0.5) * C, z = M + (j + 0.5) * C;
        if (x > c.x0 - NR && x < c.x1 + NR && z > c.z0 - NR && z < c.z1 + NR) blocked[j * NG + i] = 1;
      }
    }
  }
  const nearestFree = (x, z) => {
    const i0 = cl(x), j0 = cl(z);
    if (!blocked[j0 * NG + i0]) return [i0, j0];
    let best = null, bd = 1e9;
    for (let r = 1; r < 10 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= NG || j >= NG || blocked[j * NG + i]) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j]; }
    }
    return best || [i0, j0];
  };
  const { x, z } = map.meta.seekerStart, [si, sj] = nearestFree(x, z), seen = new Uint8Array(NG * NG), q = [sj * NG + si];
  seen[q[0]] = 1;
  for (let h = 0; h < q.length; h++) {
    const i0 = q[h] % NG, j0 = (q[h] / NG) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= NG || j >= NG || seen[j * NG + i] || blocked[j * NG + i]) continue;
      seen[j * NG + i] = 1; q.push(j * NG + i);
    }
  }
  return (p) => { const [i, j] = nearestFree(p.x, p.z); return seen[j * NG + i] === 1; };
}

for (const id of Object.keys(MAPS)) {
  const map = MAPS[id];
  const w = buildWorld(undefined, id);
  const pts = [...map.spots.map((s) => ({ ...s, t: 'spot' })), ...map.spawns.map(([x, z]) => ({ x, z, t: 'spawn' }))];
  test(`${id}: every spot and spawn is reachable from seekerStart`, () => {
    const reached = fill(map, w.colliders);
    const bad = pts.filter((p) => ![-1e-6, 1e-6].some((e) => reached[ci(p.z + e) * N + ci(p.x + e)])).map((p) => `${p.t} ${p.x},${p.z}`);
    assert.deepEqual(bad, []);
  });
  test(`${id}: the AI nav grid reaches every spot (none is skipped at load)`, () => {
    const ok = navReach(map, w.colliders);
    assert.deepEqual(map.spots.filter((p) => !ok(p)).map((p) => `${p.x},${p.z}`), []);
  });
  test(`${id}: no spot or spawn sits inside a collider`, () => {
    const bad = pts.filter((p) => { const m = p.t === 'spot' ? 0.2 : R; return w.colliders.some((c) => p.x > c.x0 - m && p.x < c.x1 + m && p.z > c.z0 - m && p.z < c.z1 + m && (p.t === 'spot' ? c.y0 < 0.4 && c.y1 > 0.4 : c.y0 < 1.7 && c.y1 > 0.2)); }).map((p) => `${p.t} ${p.x},${p.z}`);
    assert.deepEqual(bad, []);
  });
  test(`${id}: build is deterministic`, () => { assert.deepEqual(buildWorld(undefined, id), w); });
  test(`${id}: zones are well formed`, () => {
    assert.ok(Array.isArray(map.meta.zones) && map.meta.zones.length > 0, 'meta.zones');
    for (const z of map.meta.zones) {
      assert.ok(z.name && z.reverb && z.box.x0 < z.box.x1 && z.box.z0 < z.box.z1, JSON.stringify(z));
    }
  });
}
