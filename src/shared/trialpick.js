// Trial round set-up picks, shared by the server (startTrial) and the node tests. Pure: no THREE, no DOM, seeded.
// pickRelics: which `n` of the map's relic candidates are live this round. Every n-subset is scored by its tightest cluster, the shortest
// walk that visits any three of its relics (three is the unlock count), and the seed picks among the subsets within 95% of the best score.
// So a round never hands the hiders three relics side by side, yet the live set still changes from seed to seed.
// pickSpawns: hider starts, preferring candidates far from the seeker start by walking distance and hidden from it, spread apart.
export const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

function subsets(m, n) { const out = [], cur = []; (function rec(s) { if (cur.length === n) { out.push(cur.slice()); return; } for (let i = s; i < m; i++) { cur.push(i); rec(i + 1); cur.pop(); } })(0); return out; }

// shortest walk visiting all of a, b, c (start anywhere): total minus the longest leg of the triangle
const tri = (D, a, b, c) => { const ab = D[a][b], bc = D[b][c], ac = D[a][c]; return ab + bc + ac - Math.max(ab, bc, ac); };
export function clusterScore(D, set, need = 3) {
  if (set.length < need) return Infinity;
  let best = Infinity;
  for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) for (let k = j + 1; k < set.length; k++) best = Math.min(best, tri(D, set[i], set[j], set[k]));
  return best;
}

// relics: [[x, z]...]; dist(i, j) -> metres (walking); returns candidate indices in a seeded order
export function pickRelics(relics, dist, seed, n = 6, slack = 0.95) {
  const m = relics.length, rand = mulberry32(seed);
  const order = (list) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  if (m <= n) return order([...Array(m).keys()]);
  const D = [...Array(m)].map((_, i) => [...Array(m)].map((__, j) => (i === j ? 0 : dist(i, j))));
  const scored = subsets(m, n).map((s) => ({ s, v: clusterScore(D, s) })), top = Math.max(...scored.map((x) => x.v));
  const ok = scored.filter((x) => x.v >= top * slack);
  return order(ok[Math.floor(rand() * ok.length)].s);
}

// cands: [[x, z]...]; info: { path: metres from the seeker start per candidate, seen: true when the seeker start can see it }
// -> `k` candidate indices. Valid = path >= minPath and not seen; filled up from the rest (farthest first) if there are too few.
export function pickSpawns(cands, k, info, seed, { minPath = 40, spread = 12 } = {}) {
  const rand = mulberry32(seed ^ 0x9e3779b9), idx = [...cands.keys()];
  const good = idx.filter((i) => info.path[i] >= minPath && info.path[i] < Infinity && !info.seen[i]);
  const rest = idx.filter((i) => !good.includes(i)).sort((a, b) => (info.path[b] === Infinity ? -1 : info.path[b]) - (info.path[a] === Infinity ? -1 : info.path[a]));
  const out = [];
  const pool = good.slice();
  while (out.length < k && pool.length) { // first one random, then farthest-point (ties and near-ties broken by the seed)
    let pick = 0;
    if (out.length) {
      const sc = pool.map((i) => Math.min(...out.map((o) => Math.hypot(cands[i][0] - cands[o][0], cands[i][1] - cands[o][1]))));
      const best = Math.max(...sc), near = pool.map((_, j) => j).filter((j) => sc[j] >= Math.min(best, spread) - 1e-9);
      pick = near[Math.floor(rand() * near.length)];
    } else pick = Math.floor(rand() * pool.length);
    out.push(pool.splice(pick, 1)[0]);
  }
  for (const i of rest) { if (out.length >= k) break; out.push(i); }
  while (out.length < k) out.push(out[out.length % Math.max(1, cands.length)] ?? 0); // more hiders than candidates: share (caller offsets)
  return out;
}
