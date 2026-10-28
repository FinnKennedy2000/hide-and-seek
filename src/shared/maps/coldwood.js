// "Coldwood Yard": an overgrown, abandoned logging compound at dusk, 68x68 m (bounds +-34), the Trial-mode map. North is -z, east is +x.
// Five connected districts, each with its own silhouette (see docs/PLAN-polish.md, "Map"):
//   SAWMILL   (centre-west)  the main building: long hall + saw bench loop, office annex, 6 window vaults, a chimney landmark.
//   YARD      (north-east)   equipment yard: log stacks, wrecked truck, a gantry crane landmark, plank barriers.
//   ROCKS     (north-west)   rocky service route: gravel road between rock banks (exposed), a grass gully behind the west bank (concealed), stone nook.
//   WOODS     (south-west)   dense pines and dead trees, fallen logs, a derelict bunkhouse, undergrowth patches.
//   MARSH     (south-east)   tall reeds, a muddy track, a pump house, the water tower landmark.
// Loop budget (every loop is a single obstacle a seeker can cut across, none longer than ~40 m round):
//   strong  saw bench in the hall (3 entries + 2 windows), log stack LS2 under the gantry (vault barrier on its east side)
//   medium  wrecked truck, boulder pairs on the gravel road, bunkhouse (door + door + window)
//   weak    single log stacks / rock stacks (no vault), reed patches (no wall, so only grass hides you)
// Exits: gate A (north-west, rocky) and gate B (south, marsh) are ~80 m apart. Each has an exposed approach (the open gravel road /
// the open mud track) and a concealed slower one (the grass gully / the reed channel). Collision matches the visuals: every collider is a
// visible box or model, none is smaller than 0.4 m across its long side, and every enclosed room has two or more ways out.
// Same builder API as funfair.js: b.box / mesh / collider / light / prop / model. No THREE, no DOM. Material names are prefixed `cw_` (the
// client's material table is global); `mud`, `dirt`, `dryGrass` are PBR ground sets (src/world/textures.js), `wood`, `wall`, `metal` shared sets.
// Player radius 0.3, jump 0.9 m (vault walls are 1.2 m), crouch height 1.0, standing 1.7.

// ---------- layout data (module level: `trial` below must be complete at import time, before any build)
const VAULTS = []; // every vaultable wall that build() makes, in trial.vaults format
const win = (x, z, ax) => { VAULTS.push({ x, z, ax }); return { c: ax === 'x' ? x : z, w: 1.8, k: 'win' }; };
const door = (c, w = 2.2) => ({ c, w, k: 'door' });
const gap = (c, w = 2.4) => ({ c, w, k: 'gap' });

const SAW = { x0: -17, x1: 3, z0: -9, z1: 7 };
const BUNK = { x0: -28, x1: -20, z0: 21.5, z1: 26.5 };
const PUMP = { x0: 27.5, x1: 31.5, z0: 10, z1: 15 };
const YARD = { x0: 6, x1: 34, z0: -34, z1: -6 };
const ROCKS = { x0: -34, x1: -13, z0: -34, z1: -9 };
const WOODS = { x0: -34, x1: -6, z0: 9, z1: 34 };
const MARSH = { x0: 6, x1: 34, z0: 6, z1: 34 };
// vaultable plank / stone barriers [x, z, length, axis, material?]
const BARRIERS = [[12, -8, 3.2, 'x'], [28, -19, 3.2, 'z'], [14, -23.4, 3.2, 'x'], [-14.2, -14.5, 3.4, 'x', 'cw_stone'], [-18.5, 17, 3.2, 'z'], [18.5, 9.4, 3.2, 'x'], [26.5, 21.5, 3.2, 'z']];
for (const [x, z, , ax] of BARRIERS) VAULTS.push({ x, z, ax });
const OFFICE = { x0: -4, x1: 3, z0: 1.5, z1: 7 };

const GRASS = [
  { x0: 8, x1: 21, z0: 12, z1: 23 },         // marsh, main reed bed
  { x0: -33, x1: -29.6, z0: -28, z1: -8 },   // rock gully behind the west bank (concealed route to gate A)
  { x0: -33, x1: -25.5, z0: -32.6, z1: -27.4 }, // gate A thicket
  { x0: -33, x1: -27, z0: -8, z1: 0 },       // gully mouth, links the rocks to the woods
  { x0: -16, x1: -6, z0: 9.5, z1: 13.4 },    // strip south of the sawmill
  { x0: -18, x1: -9, z0: 14.5, z1: 24 },     // woodland undergrowth
  { x0: -33, x1: -26, z0: 11, z1: 20 },      // west woods thicket
  { x0: -5, x1: 8, z0: 18, z1: 27 },         // links the woods to the marsh
  { x0: 9.5, x1: 15, z0: -1.5, z1: 11.5 },   // reed strip from the yard road down into the marsh
  { x0: 10, x1: 20, z0: 25.5, z1: 32.5 },    // marsh, reed channel to gate B
  { x0: 29, x1: 33, z0: -33, z1: -25 },      // 10 yard corner thicket
];
const RELICS = [[-15, -26], [22, -31], [31, -11], [-8, 2.5], [-24, -4], [-21, 15.5], [1, 30.5], [29.5, 12.5]];
const GATES = [[-23.5, -32.2], [23.5, 32.2]];
const CAGES = [[-16, -16], [15, -7], [-12, 25], [8.5, 8], [27, -23]];
const SEEKER = { x: 2, z: -30, yaw: Math.PI };
const SPAWNS = [[-30.5, 16], [-29, 13], [-13, 18], [-10, 21], [-2, 21], [4, 23], [11, 15], [19, 19], [14, 21], [14, 28], [18, 30], [-12, 11.5]];

// dirt roads and trails [cx, cz, w, d] (decals only; walking is free everywhere)
const ROADS = [
  [-23.5, -16, 4, 36], [-20, 2, 7, 3],             // gravel service road from gate A down to the sawmill west door
  [7, -14, 4, 40], [16, -4, 18, 3],                // yard road (north-south spine) and the cross track
  [23.5, 18, 3.2, 31], [23.5, 4, 3.2, 12],         // mud track to gate B
  [-9, 10, 2, 6], [-12, 14, 1.6, 6], [-18, 21, 1.6, 12], [-22, 28, 1.6, 8], // woodcutters' trail
  [-6, 30, 12, 2], [2, 8.5, 2, 3],
];

const WALLS = {
  sawN: [win(-13, -9, 'x'), door(-6.5, 2.6), win(-1.5, -9, 'x')],
  sawS: [win(-14, 7, 'x'), door(-9, 2.6), win(-3, 7, 'x')],
  sawW: [win(-17, -5, 'z'), door(2, 2.8)],
  sawE: [gap(-3, 3.2), win(3, 4, 'z')],
  offW: [door(5, 2.2)], offN: [door(-1, 2.2)],
  bunkN: [door(-22, 2.4), win(-26, 21.5, 'x')], bunkS: [door(-25.5, 2.2)], bunkE: [win(-20, 24, 'z')],
  pumpN: [win(29.5, 10, 'x')], pumpW: [door(12.5, 2.2)], pumpS: [gap(29.6, 2.6)],
};

export const meta = {
  id: 'coldwood', name: 'Coldwood Yard', size: 68, blurb: 'An abandoned logging compound at dusk. A sawmill, a gantry yard, a rocky road, dark woods and a reed marsh: wake eight relics and get out.',
  players: { min: 4, max: 8, recommended: '6-8' }, thumbnail: '/thumbs/coldwood.webp',
  fog: { color: 0x3a2c3c, near: 10, far: 60 }, sky: 'dusk',
  ambient: { color: 0xa8a4d0, ground: 0x6a5a68, intensity: 2.4 }, sun: { color: 0xe8a888, intensity: 1.1 },
  seekerStart: SEEKER,
  bounds: { x0: -34, x1: 34, z0: -34, z1: 34 },
  outdoor: { reverb: 'outdoor', surface: 'grass' },
  zones: [
    { name: 'sawmill', ...SAW, box: SAW, reverb: 'hall', surface: 'wood' },
    { name: 'office', ...OFFICE, box: OFFICE, reverb: 'room', surface: 'wood' },
    { name: 'bunkhouse', ...BUNK, box: BUNK, reverb: 'room', surface: 'wood' },
    { name: 'pump house', ...PUMP, box: PUMP, reverb: 'room', surface: 'concrete' },
    { name: 'rocky road', ...ROCKS, box: ROCKS, reverb: 'outdoor', surface: 'concrete' },
    ...GRASS.map((g, i) => ({ name: `grass ${i + 1}`, ...g, box: g, reverb: 'outdoor', surface: 'grass' })),
  ],
};

export const materials = {
  mud: { color: 0xffffff, roughness: 1 }, dirt: { color: 0xffffff, roughness: 1 }, dryGrass: { color: 0xffffff, roughness: 1 },
  cw_stone: { color: 0x6f6b66, roughness: 0.95, flatShading: true }, cw_stone2: { color: 0x4f4c4a, roughness: 1, flatShading: true },
  cw_rust: { color: 0x6e4430, roughness: 0.7, metalness: 0.35 }, cw_cont1: { color: 0x2f4a52, roughness: 0.7, metalness: 0.3 }, cw_cont2: { color: 0x6a2a22, roughness: 0.7, metalness: 0.3 },
  cw_roof: { color: 0x4a3a34, roughness: 0.8, metalness: 0.2 }, cw_dark: { color: 0x1c1816, roughness: 0.9 }, cw_straw: { color: 0xb89a46, roughness: 1 },
  cw_post: { color: 0x3e2e22, roughness: 0.9 }, cw_barrel: { color: 0x5a3a28, roughness: 0.8 }, cw_cloth: { color: 0x6a5a48, roughness: 1 },
  cw_log: { color: 0x6b4a30, roughness: 0.95 }, cw_logend: { color: 0xb08a5a, roughness: 0.9 }, cw_steel: { color: 0x7a5a2a, roughness: 0.6, metalness: 0.5 },
  cw_sign: { color: 0xc8a020, roughness: 0.7 }, cw_water: { color: 0x15202a, roughness: 0.15, metalness: 0.2 },
  cw_glow: { color: 0x2a1a08, roughness: 0.5, emissive: 0xffa040, emissiveIntensity: 3.2 },
  cw_gateGlow: { color: 0x0a1a10, roughness: 0.5, emissive: 0x70ffb0, emissiveIntensity: 3.0 },
};

export const mix = [['grass', 2], ['barn', 1], ['ruin', 1], ['junk', 1]];

// hiding spots: reed grids are generated from GRASS; the rest sit at the foot of a feature, never inside a collider
const reeds = (g, n) => { const out = [], c = Math.ceil(Math.sqrt(n * (g.x1 - g.x0) / (g.z1 - g.z0))), r = Math.ceil(n / c); for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) out.push({ x: +(g.x0 + 0.9 + (g.x1 - g.x0 - 1.8) * (i + 0.5 * (j % 2)) / Math.max(1, c - 0.5)).toFixed(1), z: +(g.z0 + 0.9 + (g.z1 - g.z0 - 1.8) * j / Math.max(1, r - 1)).toFixed(1), kind: 'grass', crouch: true }); return out; };
export const spots = [
  ...GRASS.flatMap((g) => reeds(g, Math.min(9, Math.max(4, Math.round((g.x1 - g.x0) * (g.z1 - g.z0) / 14))))),
  // sawmill: behind the bench, boards, office
  { x: -15.6, z: -7.7, kind: 'barn', crouch: true }, { x: -16.3, z: 3.4, kind: 'barn', crouch: true }, { x: 0.5, z: 5.5, kind: 'barn', crouch: true }, { x: -1.5, z: -5.5, kind: 'barn', crouch: false },
  // bunkhouse + stone nook
  { x: -22.8, z: 25.8, kind: 'ruin', crouch: true }, { x: -26.7, z: 22.4, kind: 'ruin', crouch: true }, { x: -16.5, z: -28.5, kind: 'ruin', crouch: true }, { x: -13.8, z: -23, kind: 'ruin', crouch: true },
  // log stacks, truck, tower
  { x: 14, z: -25.6, kind: 'junk', crouch: true }, { x: 20, z: -16.4, kind: 'junk', crouch: true }, { x: 21, z: -10.4, kind: 'junk', crouch: true }, { x: 27, z: -21.5, kind: 'junk', crouch: true },
  // pump house
  { x: 28.4, z: 14, kind: 'shed', crouch: true }, { x: 30.5, z: 10.9, kind: 'shed', crouch: true },
];
export const spawns = SPAWNS;

export const trial = {
  relics: RELICS, gates: GATES, cages: CAGES, grass: GRASS, vaults: VAULTS,
  hiderSpawns: SPAWNS, seekerStart: SEEKER,
};

// ---------- builders
function wall(b, ax, f, a0, a1, ops, { t = 0.3, h = 3.5, mat = 'wood' } = {}) { // wall along `ax` at coordinate f, from a0 to a1, with openings
  const seg = (s, e, y0, hh, collide = true) => {
    if (e - s < 0.01) return;
    const c = (s + e) / 2, l = e - s;
    if (ax === 'x') b.box(c, f, l, t, hh, mat, { y0, collide }); else b.box(f, c, t, l, hh, mat, { y0, collide });
  };
  let p = a0;
  for (const o of [...ops].sort((a, c) => a.c - c.c)) {
    const s = o.c - o.w / 2, e = o.c + o.w / 2;
    seg(p, s, 0, h); p = e;
    if (o.k === 'door') seg(s, e, 2.4, h - 2.4, false);
    if (o.k === 'win') { seg(s, e, 0, 1.2); if (h > 2.3) seg(s, e, 2.2, h - 2.2, false); } // the 1.2 m sill is the vault wall
  }
  seg(p, a1, 0, h);
}

function fence(b, ax, f, a0, a1, gaps = [], h = 1.0) { // post-and-rail fence, solid collider h metres high (jump is 0.9) except in the gaps
  const run = (s, e) => {
    if (e - s < 0.05) return;
    const l = e - s, c = (s + e) / 2, n = Math.max(1, Math.round(l / 2)), d = { collide: false, cast: false };
    if (ax === 'x') {
      b.collider({ x0: s, x1: e, z0: f - 0.1, z1: f + 0.1, y0: 0, y1: h });
      b.box(c, f, l, 0.05, 0.1, 'wood', { y0: h * 0.35, ...d }); b.box(c, f, l, 0.05, 0.1, 'wood', { y0: h * 0.78, ...d });
      for (let k = 0; k <= n; k++) b.box(s + (l * k) / n, f, 0.1, 0.1, h + 0.12, 'wood', d);
    } else {
      b.collider({ x0: f - 0.1, x1: f + 0.1, z0: s, z1: e, y0: 0, y1: h });
      b.box(f, c, 0.05, l, 0.1, 'wood', { y0: h * 0.35, ...d }); b.box(f, c, 0.05, l, 0.1, 'wood', { y0: h * 0.78, ...d });
      for (let k = 0; k <= n; k++) b.box(f, s + (l * k) / n, 0.1, 0.1, h + 0.12, 'wood', d);
    }
  };
  let p = a0;
  for (const g of [...gaps].sort((a, c) => a.c - c.c)) { run(p, g.c - g.w / 2); p = g.c + g.w / 2; }
  run(p, a1);
}

export function build(b, rnd) {
  const deco = { collide: false, cast: false };
  const inR = (r, x, z, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  // a 1.2 m, 0.3 m thick vaultable barrier (plank barrier / low stone wall); `ax` = the axis it runs along
  const barrier = ([x, z, len, ax, mat = 'wood']) => {
    if (ax === 'x') { b.box(x, z, len, 0.3, 1.2, mat); b.box(x, z, len + 0.2, 0.36, 0.12, 'cw_dark', { y0: 1.2, ...deco }); } else { b.box(x, z, 0.3, len, 1.2, mat); b.box(x, z, 0.36, len + 0.2, 0.12, 'cw_dark', { y0: 1.2, ...deco }); }
  };
  BARRIERS.forEach(barrier);
  const lamp = (x, z, h, inten, dist) => { // lamp post: pole (decor), lantern glow, one point light
    b.box(x, z, 0.14, 0.14, h, 'cw_post', deco); b.box(x + 0.25, z, 0.5, 0.1, 0.1, 'cw_post', { y0: h - 0.1, ...deco });
    b.mesh(['sphere', 0.14, 8, 6], 'cw_glow', x + 0.5, h - 0.25, z, { cast: false }); b.light(x + 0.5, h - 0.3, z, inten, dist, 0xffa860);
  };
  const sign = (x, z, ry, mat = 'cw_sign') => { b.box(x, z, 0.1, 0.1, 1.5, 'cw_post', deco); b.box(x, z, 0.9, 0.06, 0.5, mat, { y0: 1.1, ...deco }); b.box(x, z, 0.9, 0.08, 0.08, 'cw_dark', { y0: 1.3, ...deco }); void ry; };

  // ----- ground: mud base, dirt roads, dry-grass under the tall grass
  b.box(0, 0, 76, 76, 0.02, 'mud', deco);
  for (const [x, z, w, d] of ROADS) b.box(x, z, w, d, 0.03, 'dirt', deco);
  for (const g of GRASS) b.box((g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2, g.x1 - g.x0, g.z1 - g.z0, 0.025, 'dryGrass', deco);
  for (const [x, z, w, d] of [[22, 21, 3, 1.6], [25.5, 25, 2.2, 1.2], [26, 6, 2.4, 1.4]]) b.box(x, z, w, d, 0.035, 'cw_water', deco); // puddles on the mud track

  // ===== SAWMILL: long hall with a saw bench, office annex (SE), chimney. Entries: N door, S door, W door, E log-feed gap, office door x2.
  const { x0: sx0, x1: sx1, z0: sz0, z1: sz1 } = SAW;
  b.box(-7, -1, 20, 16, 0.05, 'wood', deco);
  wall(b, 'x', sz0, sx0 - 0.15, sx1 + 0.15, WALLS.sawN); wall(b, 'x', sz1, sx0 - 0.15, sx1 + 0.15, WALLS.sawS);
  wall(b, 'z', sx0, sz0, sz1, WALLS.sawW); wall(b, 'z', sx1, sz0, sz1, WALLS.sawE);
  wall(b, 'x', OFFICE.z0, OFFICE.x0, OFFICE.x1, WALLS.offN, { t: 0.2, h: 3.2 }); wall(b, 'z', OFFICE.x0, OFFICE.z0, OFFICE.z1, WALLS.offW, { t: 0.2, h: 3.2 });
  // roof: two sagging halves with a collapsed middle (sky shows through the gap over the bench)
  for (let k = 0; k < 3; k++) { b.box(-11, 0, 12.4 - k * 0.5, 17.2 - k * 3.4, 0.25, 'cw_roof', { y0: 3.6 + k * 0.28, ...deco }); b.box(0.2, 0, 5.4 - k * 0.5, 17.2 - k * 3.4, 0.25, 'cw_roof', { y0: 3.6 + k * 0.28, ...deco }); }
  for (const x of [-16, -12, -8, -4, 0, 3]) b.box(x, 0, 0.25, 16.4, 0.3, 'cw_post', { y0: 3.3, ...deco }); // trusses
  // the saw bench: carriage (collider), rails, a half-cut log on it
  b.box(-8, -3, 9, 1.6, 1.1, 'cw_steel'); b.box(-8, -3, 11, 0.5, 0.08, 'cw_dark', { y0: 0.05, ...deco }); b.box(-9.5, -3, 3.4, 0.7, 0.55, 'cw_log', { y0: 1.1, ...deco }); b.box(-7.8, -3, 0.1, 2.6, 2.0, 'cw_steel', { y0: 1.1, ...deco }); // blade frame
  b.box(-14.8, 3.4, 1.6, 2.8, 1.4, 'wood'); b.box(-14.8, 3.4, 1.6, 2.8, 0.1, 'cw_dark', { y0: 1.4, ...deco }); // board stack
  b.box(-4.5, -7.6, 1.4, 1.4, 1.2, 'cw_barrel'); // sawdust hopper by the north wall
  b.box(-9.5, 3.6, 4, 2.2, 0.1, 'cw_straw', { y0: 0.05, ...deco }); // sawdust drift
  b.box(1.4, -7.6, 1.8, 1.8, 15, 'cw_stone'); b.box(1.4, -7.6, 2.2, 2.2, 0.35, 'cw_stone2', { y0: 14.4, ...deco }); // brick chimney (landmark)
  b.light(-9, 2.8, -0.5, 36, 14, 0xffb060); b.light(0, 2.8, 4, 28, 10, 0xffa860);
  b.mesh(['sphere', 0.13, 8, 6], 'cw_glow', -9, 2.8, -0.5, { cast: false }); b.mesh(['sphere', 0.13, 8, 6], 'cw_glow', 0, 2.8, 4, { cast: false });
  b.model('barrel_red', -2.2, -6.5, { w: 0.5, d: 0.5, h: 0.9 }); b.model('barrel_blue', 1.2, 5.6, { w: 0.5, d: 0.5, h: 0.9 });
  b.model('jerrycan', -12.5, -0.2, { s: 1.3, ry: 0.5, ...deco }); b.model('lantern', -17, -5, { s: 2.2, y0: 1.2, ...deco }); b.model('lantern', 3, 4, { s: 2.2, y0: 1.2, ...deco });
  b.box(-0.5, 4.3, 1.6, 0.8, 0.8, 'wood'); // office desk
  b.box(-3.7, 3.0, 0.4, 0.8, 0.5, 'cw_cloth', { y0: 0.7, ...deco }); // coat on a hook, workers' lunchbox
  b.box(-0.5, 4.3, 0.3, 0.2, 0.2, 'cw_sign', { y0: 0.8, ...deco });

  // ===== YARD: gantry crane over log stacks, wrecked truck, barriers, signs
  for (const [x, z] of [[11, -24], [11, -14], [29, -24], [29, -14]]) { b.box(x, z, 0.7, 0.7, 9, 'cw_steel'); b.box(x, z, 1.4, 1.4, 0.3, 'cw_dark', { y0: 0, ...deco }); }
  for (const x of [11, 29]) b.box(x, -19, 0.6, 10.8, 0.7, 'cw_rust', { y0: 8.6, ...deco }); // rails over the legs
  b.box(20, -19, 18.6, 0.8, 0.9, 'cw_rust', { y0: 8.2, ...deco }); b.box(16, -19, 1.2, 1.0, 0.7, 'cw_dark', { y0: 7.5, ...deco }); b.box(16, -19, 0.06, 0.06, 4.2, 'cw_dark', { y0: 3.3, ...deco }); // trolley and a dangling chain
  b.box(17.5, -19, 1.6, 0.9, 0.7, 'cw_steel', { y0: 2.6, ...deco }); // hook block hanging low over the stacks
  const stack = (x, z, w, d, h, ax) => { // log stack: a collider block with visible log ends and tiers
    b.box(x, z, w, d, h, 'cw_log');
    const en = ax === 'x' ? [x - w / 2 - 0.03, x + w / 2 + 0.03] : [z - d / 2 - 0.03, z + d / 2 + 0.03];
    for (const e of en) { if (ax === 'x') b.box(e, z, 0.06, d - 0.2, h - 0.2, 'cw_logend', { y0: 0.1, ...deco }); else b.box(x, e, w - 0.2, 0.06, h - 0.2, 'cw_logend', { y0: 0.1, ...deco }); }
    for (const dy of [h * 0.33, h * 0.66]) b.box(x, z, w + 0.1, d + 0.1, 0.06, 'cw_dark', { y0: dy, ...deco }); // binding tiers
  };
  stack(14, -28, 8, 2.2, 2.0, 'x'); stack(20, -19, 9, 2.4, 1.8, 'x'); stack(26.5, -27, 2.4, 7, 2.2, 'z'); stack(31.5, -17, 2.6, 5, 1.6, 'z'); stack(9.5, -20, 2.2, 4, 1.4, 'z');
  // wrecked truck: cab, flatbed (half the logs fell off), tyres
  b.box(26.2, -8.5, 2.2, 2.4, 2.0, 'cw_cont2'); b.box(26.2, -8.5, 2.3, 2.5, 0.1, 'cw_dark', { y0: 2.0, ...deco }); b.box(26.9, -8.5, 0.1, 2.0, 0.7, 'cw_dark', { y0: 1.1, ...deco }); // cab + smashed windscreen
  b.box(21.8, -8.5, 5.2, 2.4, 1.0, 'cw_rust'); b.box(21, -8.5, 3.6, 1.2, 0.5, 'cw_log', { y0: 1.0, ...deco }); b.box(22.6, -7.9, 3.2, 0.5, 0.5, 'cw_log', { y0: 1.0, ...deco });
  for (const [x, z] of [[20, -7.2], [20, -9.8], [24, -7.2], [24, -9.8]]) b.model('wheel', x, z, { s: 2.4, ry: 1.57, y0: 0.15, ...deco });
  b.model('wheel', 17, -12, { s: 2.6, ry: 0.4, ...deco }); b.model('jerrycan', 19, -6.5, { s: 1.4, ry: 2, ...deco });
 
  b.box(9.5, -7, 2.4, 0.5, 0.5, 'wood'); b.box(8.6, -5.4, 0.7, 0.7, 0.7, 'cw_steel'); // pallets and a chain winch
  b.model('barrel_red', 30.4, -7.4, { w: 0.5, d: 0.5, h: 0.9 }); b.model('barrel_red', 31.3, -7.9, { w: 0.5, d: 0.5, h: 0.9, ry: 1 }); b.model('barrel_blue', 30.9, -6.7, { w: 0.5, d: 0.5, h: 0.9 });
  b.box(20, -25.4, 1.2, 0.8, 0.9, 'wood'); b.box(20, -25.4, 0.5, 0.3, 0.3, 'cw_sign', { y0: 0.9, ...deco }); // crate with a thermos
  b.box(7.8, -30.6, 1.4, 0.9, 0.6, 'cw_cloth', { ...deco }); // tarp-covered pile by the seeker start
  lamp(18.5, -24.4, 3.4, 40, 15); sign(8.6, -30.8); sign(31, -6.6);
  b.light(26.5, 2.5, -8.5, 22, 10, 0xff9060); // glow from the truck's busted dashboard
  b.mesh(['sphere', 0.1, 6, 4], 'cw_glow', 26.5, 1.6, -8.5, { cast: false });

  // ===== WATER TOWER (landmark between the yard and the marsh)
  for (const [x, z] of [[17.5, -0.5], [20.5, -0.5], [17.5, 2.5], [20.5, 2.5]]) { b.box(x, z, 0.5, 0.5, 9.5, 'cw_steel'); }
  for (const y of [3, 6]) { b.box(19, -0.5, 3.4, 0.14, 0.14, 'cw_steel', { y0: y, ...deco }); b.box(19, 2.5, 3.4, 0.14, 0.14, 'cw_steel', { y0: y, ...deco }); b.box(17.5, 1, 0.14, 3.4, 0.14, 'cw_steel', { y0: y, ...deco }); b.box(20.5, 1, 0.14, 3.4, 0.14, 'cw_steel', { y0: y, ...deco }); }
  b.mesh(['cyl', 2.3, 2.3, 3.2, 14], 'cw_rust', 19, 11.1, 1, { cast: false }); b.mesh(['cyl', 0.1, 2.4, 1.0, 14], 'cw_roof', 19, 13.2, 1, { cast: false });

  // ===== ROCKY ROUTE: gravel road between two rock banks, boulders breaking the sightline, a nook for a relic, a vaultable stone wall
  const bank = (x, z0, z1) => { b.box(x, (z0 + z1) / 2, 1.2, z1 - z0, 2.4, 'cw_stone'); b.box(x - 0.1, (z0 + z1) / 2, 0.9, z1 - z0 - 0.3, 0.5, 'cw_stone2', { y0: 2.4, ...deco }); };
  bank(-28.5, -27, -19); bank(-28.5, -16.4, -9.5);       // west bank (a 2.6 m gap lets hiders cut into the gully)
  bank(-19, -31, -26); bank(-19, -22.4, -12);            // east bank, gap at z -26..-22.4 leads to the nook
  b.box(-23.8, -15.5, 3.2, 2.6, 2.6, 'cw_stone2'); b.box(-23.8, -15.5, 2.4, 1.8, 0.4, 'cw_stone', { y0: 2.6, ...deco });   // boulders in the road
  b.box(-25.8, -24.5, 2.8, 3.0, 2.4, 'cw_stone2'); b.box(-22.0, -9.2, 2.4, 2.4, 2.0, 'cw_stone2');
  b.box(-13.5, -31, 1.2, 4, 2.4, 'cw_stone'); b.box(-16.2, -20.7, 5.2, 1.2, 2.4, 'cw_stone'); // nook walls (open to the west gap and to the south-east)
  b.box(-14.5, -30, 2.2, 2.0, 1.4, 'cw_stone2', { ...deco }); // fallen blocks in the nook
  // low stone wall south of the nook: a vault between the rocks and the sawmill
  for (let k = 0; k < 14; k++) { const x = -33 + rnd(0, 20), z = -33 + rnd(0, 23); if (!GRASS.some((g) => inR(g, x, z, 0.5)) && Math.abs(x + 23.5) > 3) b.box(x, z, rnd(0.4, 0.9), rnd(0.4, 0.9), rnd(0.15, 0.4), 'cw_stone', { collide: false, cast: false }); } // rubble
  b.model('lantern', -20, -28, { s: 2.2, ...deco }); lamp(-21.2, -27, 3.0, 36, 14);
  b.box(-24.5, -20, 2.2, 1.1, 0.3, 'cw_dark', { collide: false }); b.box(-24.5, -20, 2.2, 0.2, 0.2, 'cw_sign', { y0: 0.3, ...deco }); // fallen road barrier
  sign(-26, -31.4); sign(-21, -6.6);

  // ===== WOODS: bunkhouse, fallen logs, a barricade of planks
  wall(b, 'x', BUNK.z0, BUNK.x0, BUNK.x1, WALLS.bunkN, { h: 3.0 }); wall(b, 'x', BUNK.z1, BUNK.x0, BUNK.x1, WALLS.bunkS, { h: 3.0 });
  wall(b, 'z', BUNK.x0, BUNK.z0, BUNK.z1, [gap(24, 2.4)], { h: 3.0 }); wall(b, 'z', BUNK.x1, BUNK.z0, BUNK.z1, WALLS.bunkE, { h: 3.0 });
  b.box(-24, 24, 8, 5, 0.04, 'wood', deco);
  b.box(-24, 24, 9, 6, 0.25, 'cw_roof', { y0: 3.0, ...deco }); b.box(-24, 22, 9, 2, 0.25, 'cw_roof', { y0: 3.3, ...deco }); // half a roof
  b.box(-26.6, 24.7, 1.0, 2.0, 0.5, 'wood'); b.box(-26.6, 24.7, 1.0, 2.0, 0.1, 'cw_cloth', { y0: 0.5, ...deco }); // bunk with a blanket
  b.box(-21.6, 25.4, 1.0, 0.9, 0.9, 'cw_barrel'); b.model('lantern', -21.6, 25.4, { s: 2.2, y0: 0.9, ...deco });
  b.light(-24, 2.4, 24, 30, 11, 0xffa860); b.mesh(['sphere', 0.12, 8, 6], 'cw_glow', -24, 2.4, 24, { cast: false });
  b.box(-19.2, 14, 1.6, 0.8, 0.8, 'wood'); b.box(-22.6, 14.6, 0.5, 0.5, 0.5, 'cw_cloth', deco); // camp table and a bag at the relic clearing
  for (const [x, z, r] of [[-22, 8.5, 0.3], [-30, 24, 1.4], [-18, 29, 2.8], [-9, 30, 0.2], [-30, 30, 0.9], [-20, 12, 1.3], [-12, 26, 2.1], [-9.5, 17, 1.7]]) b.model('log', x, z, { ry: r > 1 ? Math.PI / 2 : 0, w: 4, d: 1, h: 0.7 });
 

  // ===== MARSH: pump house with a relic inside, wreck of a rowing boat in the reeds, duckboards
  wall(b, 'x', PUMP.z0, PUMP.x0, PUMP.x1, WALLS.pumpN, { mat: 'wall', h: 2.8 }); wall(b, 'x', PUMP.z1, PUMP.x0, PUMP.x1, WALLS.pumpS, { mat: 'wall', h: 2.8 });
  wall(b, 'z', PUMP.x0, PUMP.z0, PUMP.z1, WALLS.pumpW, { mat: 'wall', h: 2.8 }); wall(b, 'z', PUMP.x1, PUMP.z0, PUMP.z1, [], { mat: 'wall', h: 2.8 });
  b.box(29.5, 12.5, 4.6, 5.6, 0.25, 'cw_roof', { y0: 2.8, ...deco }); b.box(29.5, 12.5, 4, 5, 0.04, 'cw_dark', deco);
  b.box(30.6, 14.1, 1.0, 1.0, 1.0, 'cw_cont1'); b.box(28.8, 11.0, 0.8, 0.8, 0.8, 'cw_steel'); // a motor housing and a valve
  b.light(29.5, 2.2, 12.5, 26, 10, 0xffa860); b.mesh(['sphere', 0.12, 8, 6], 'cw_glow', 29.5, 2.2, 12.5, { cast: false });
  for (let k = 0; k < 7; k++) b.box(23.5 + (k % 2) * 0.3, 8 + k * 1.1, 2.2, 0.5, 0.05, 'wood', { y0: 0.03, ...deco }); // duckboards on the track
  b.model('tarp_car', 5.5, 14.5, { w: 1.8, d: 4.4, h: 1.4 }); // a sunk wreck by the reed bed edge
 
  lamp(25.2, 15.2, 3.0, 34, 13); sign(25.4, 30.5);
  b.model('barrel_blue', 31.5, 17.5, { w: 0.5, d: 0.5, h: 0.9 });

  // ----- sparse dead trees and rocks outside the dense woods (colliders: solid trunks)
  for (const [x, z, k] of [[25.5, 2, 1], [27.5, 5, 0], [32, -2, 1], [-4, 14, 1], [24, 29, 0], [-4, -26, 1]]) b.model(k ? 'dead_tree' : 'pine_small', x, z, { s: 0.9, ry: x, w: 0.7, d: 0.7, h: 3 });

  // ----- perimeter fence (gaps at the gates)
  const P = 33.2;
  fence(b, 'x', -P, -P, P, [{ c: GATES[0][0], w: 4.4 }], 1.5); fence(b, 'x', P, -P, P, [{ c: GATES[1][0], w: 4.4 }], 1.5);
  fence(b, 'z', -P, -P, P, [], 1.5); fence(b, 'z', P, -P, P, [], 1.5);

  // ----- gates: framed arches with an emissive bar
  for (const [gx, gz] of GATES) {
    const s = Math.sign(gz), z = s * P;
    for (const dx of [-2.4, 2.4]) b.box(gx + dx, z, 0.5, 0.5, 3.8, 'cw_post');
    b.box(gx, z, 5.3, 0.45, 0.4, 'cw_post', { y0: 3.8, ...deco }); b.box(gx, z - s * 0.05, 4.4, 0.2, 0.18, 'cw_gateGlow', { y0: 3.5, ...deco });
    b.box(gx, z, 4.4, 0.1, 0.06, 'cw_gateGlow', { y0: 0.06, ...deco });
    b.light(gx, 3.4, gz, 40, 14, 0x90ffb8);
  }

  // ----- relic pedestals and cages
  for (const [x, z] of RELICS) { b.mesh(['cyl', 0.26, 0.34, 0.7, 8], 'cw_stone', x, 0.35, z, { cast: false }); b.mesh(['sphere', 0.15, 8, 6], 'cw_glow', x, 0.95, z, { cast: false }); }
  for (const [x, z] of CAGES) b.model('cage', x, z, { collide: false, s: 1 });

  // ----- trees. Dense in the woods, a thin line along the marsh and rocks, a ring beyond the fence. Every candidate rolls the same rnd draws
  //       whether it is placed or not (the build stream must not depend on `free`).
  const keep = [...SPAWNS, ...RELICS, ...CAGES, ...spots.filter((s) => s.kind !== 'grass').map((s) => [s.x, s.z]), ...VAULTS.map((v) => [v.x, v.z]), [SEEKER.x, SEEKER.z], ...GATES.map(([x, z]) => [x, z - Math.sign(z) * 2])];
  const blockers = [SAW, BUNK, PUMP, { x0: 16, x1: 22, z0: -2, z1: 4 }, { x0: 3, x1: 8, z0: 12, z1: 17 }];
  const free = (x, z, r) => keep.every(([kx, kz]) => Math.hypot(x - kx, z - kz) > r + 0.5) && !blockers.some((rc) => inR(rc, x, z, 2.5))
    && !GRASS.some((g) => inR(g, x, z, 0.4)) && !ROADS.some(([cx, cz, w, d]) => inR({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }, x, z, 1.2));
  const tree = (x, z, k) => b.model(k < 0.15 ? 'dead_tree' : k < 0.55 ? 'pine' : 'pine_small', x, z, { s: 0.85 + rnd(0, 0.5), ry: rnd(0, 6.28), w: 0.7, d: 0.7, h: 3 });
  for (let z = WOODS.z0 + 1.2; z < 32.4; z += 2.9) for (let x = WOODS.x0 + 1; x < WOODS.x1 - 0.5; x += 2.9) { // dense woods
    const jx = rnd(-0.5, 0.5), jz = rnd(-0.5, 0.5), k = rnd(0, 1);
    if (free(x + jx, z + jz, 0.9) && x + jx < -6.5) tree(x + jx, z + jz, k);
  }
  for (let z = -30; z <= 30; z += 6) for (let x = -30; x <= 30; x += 6) { // sparse dead trees and pines between the districts
    const jx = rnd(-1.5, 1.5), jz = rnd(-1.5, 1.5), k = rnd(0, 1);
    if (!inR(YARD, x, z) && !inR(ROCKS, x, z) && !inR(WOODS, x, z) && free(x + jx, z + jz, 2.4)) tree(x + jx, z + jz, k);
  }
  for (let t = -31.5; t <= 31.5; t += 3.1) for (const [x, z] of [[t, -32 + rnd(-0.4, 0.4)], [t, 32 + rnd(-0.4, 0.4)], [-32 + rnd(-0.4, 0.4), t], [32 + rnd(-0.4, 0.4), t]]) { // edge ring
    const k = rnd(0, 1);
    if (free(x, z, 2.2) && !inR(WOODS, x, z)) tree(x, z, k);
  }
  for (const s of [-1, 1]) for (let t = -44; t <= 44; t += 3.4) for (const [x, z] of [[t, s * (36 + rnd(0, 6))], [s * (36 + rnd(0, 6)), t]]) b.model('pine', x, z, { s: 1 + rnd(0, 0.7), ry: rnd(0, 6.28), collide: false, deco: true });
}
