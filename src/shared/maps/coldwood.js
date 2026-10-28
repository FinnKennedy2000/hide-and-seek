// "Coldwood Farm": a derelict farm at dusk, 66x66 m (bounds +-33), the Trial-mode map. Inspired by the layout rules of asymmetric-horror maps:
// objectives spread evenly (8 relics, 2 far-apart gates), a strong central loop (the two-room barn with window vaults), weaker loops (junk yard,
// fenced fields, ruins), tall grass between the structures, no dead zones. North is -z (the seeker starts there), the hider spawns are in the south.
// Same builder API as funfair.js: b.box / mesh / collider / light / prop / model. No THREE, no DOM. Material names are prefixed `cw_` (the client's
// material table is global); `mud`, `dirt`, `dryGrass` are PBR ground sets (src/world/textures.js), `wood`, `wall`, `metal` the shared sets.
// Player radius 0.3, jump 0.9 m (vault walls are 1.2 m), crouch height 1.0, standing 1.7.

// ---------- layout data (module level: `trial` below must be complete at import time, before any build)
const VAULTS = []; // every window sill that build() makes, in trial.vaults format
const win = (x, z, ax) => { VAULTS.push({ x, z, ax }); return { c: ax === 'x' ? x : z, w: 1.8, k: 'win' }; };
const door = (c, w = 2.2) => ({ c, w, k: 'door' });
const gap = (c, w = 2.4) => ({ c, w, k: 'gap' });

const BARN = { x0: -8, x1: 8, z0: -5, z1: 5 };
const FARM = { x0: 15, x1: 27, z0: -25, z1: -14 };
const RUIN = { x0: -30, x1: -17, z0: -29, z1: -17 };
const SHED = { x0: 21, x1: 28, z0: 0, z1: 6 };
const JUNK = { x0: -19, x1: -2, z0: 15, z1: 30 };
const GRASS = [
  { x0: -31.5, x1: -21, z0: -14, z1: 12 },   // west corn
  { x0: 16, x1: 31, z0: 10.5, z1: 21 },      // south-east corn
  { x0: -17, x1: -9, z0: -19, z1: -12 },     // between the stone ruin and the barn
  { x0: 8, x1: 14, z0: -16, z1: -9 },        // between the barn and the farmhouse
  { x0: 5, x1: 13, z0: 12, z1: 19 },         // south of the barn
];
const RELICS = [[-23.5, -23.5], [2, -25], [22, -20], [-18, 2], [-3.5, 2.8], [24.5, 3], [-11, 22.5], [22, 25]];
const GATES = [[-10, -31.6], [10, 31.6]];
const CAGES = [[-13, -10], [15, -5], [-11, 11], [9, 9.5], [26, -9]];
const SEEKER = { x: 13, z: -27.5, yaw: Math.PI };
const SPAWNS = [[-26, 20], [-21, 12], [-4, 13], [0, 27], [16, 28], [27, 29], [29, 14], [-14, 31], [8, 24], [-29, 26], [20, 8], [3, 21]];

const ROADS = [[-10, -26, 2.4, 12], [-6.2, -20.4, 9.6, 2.4], [-2.5, -12.4, 2.4, 14.4], [10, 26, 2.4, 12], [6.2, 20.5, 9.6, 2.4], [2.5, 12, 2.4, 14], [0, 9, 36, 2.4], [23, -10, 2.4, 8], [-17, 2, 5, 2.4]]; // dirt roads [cx, cz, w, d]

const WALLS = {
  barnN: [win(-5.5, -5, 'x'), door(-2.5), win(5.5, -5, 'x')],
  barnS: [win(-5.5, 5, 'x'), door(2.5), win(5.5, 5, 'x')],
  barnW: [win(-8, 0, 'z')],
  barnE: [win(8, 0, 'z')],
  barnMid: [gap(1.4, 2.2)],
  farmS: [win(18, -14, 'x'), door(23)],
  farmN: [gap(19, 3)],
  farmW: [gap(-21, 2)],
  farmE: [gap(-17, 2.4), gap(-22.5, 2)],
  ruinS: [win(-27, -17, 'x'), gap(-20.5, 2.4)],
  ruinE: [gap(-23, 3)],
};

export const meta = {
  id: 'coldwood', name: 'Coldwood Farm', size: 66, blurb: 'A derelict farm at dusk. A barn full of windows, corn to hide in, and eight relics to wake.',
  players: { min: 4, max: 8, recommended: '6-8' }, thumbnail: '/thumbs/coldwood.webp',
  fog: { color: 0x3a2c3c, near: 10, far: 60 }, sky: 'dusk',
  ambient: { color: 0xa8a4d0, ground: 0x6a5a68, intensity: 2.4 }, sun: { color: 0xe8a888, intensity: 1.1 },
  seekerStart: SEEKER,
  bounds: { x0: -33, x1: 33, z0: -33, z1: 33 },
  outdoor: { reverb: 'outdoor', surface: 'grass' },
  zones: [
    { name: 'barn', ...BARN, box: BARN, reverb: 'room', surface: 'wood' },
    { name: 'farmhouse', ...FARM, box: FARM, reverb: 'room', surface: 'wood' },
    { name: 'stone ruin', ...RUIN, box: RUIN, reverb: 'hall', surface: 'concrete' },
    { name: 'shed', ...SHED, box: SHED, reverb: 'room', surface: 'wood' },
    { name: 'junk yard', ...JUNK, box: JUNK, reverb: 'outdoor', surface: 'concrete' },
    ...GRASS.map((g, i) => ({ name: `grass ${i + 1}`, ...g, box: g, reverb: 'outdoor', surface: 'grass' })),
  ],
};

export const materials = {
  mud: { color: 0xffffff, roughness: 1 }, dirt: { color: 0xffffff, roughness: 1 }, dryGrass: { color: 0xffffff, roughness: 1 },
  cw_stone: { color: 0x6f6b66, roughness: 0.95, flatShading: true }, cw_stone2: { color: 0x4f4c4a, roughness: 1, flatShading: true },
  cw_rust: { color: 0x6e4430, roughness: 0.7, metalness: 0.35 }, cw_cont1: { color: 0x2f4a52, roughness: 0.7, metalness: 0.3 }, cw_cont2: { color: 0x6a2a22, roughness: 0.7, metalness: 0.3 },
  cw_roof: { color: 0x4a3a34, roughness: 0.8, metalness: 0.2 }, cw_dark: { color: 0x1c1816, roughness: 0.9 }, cw_straw: { color: 0xb89a46, roughness: 1 },
  cw_post: { color: 0x3e2e22, roughness: 0.9 }, cw_barrel: { color: 0x5a3a28, roughness: 0.8 }, cw_cloth: { color: 0x6a5a48, roughness: 1 },
  cw_glow: { color: 0x2a1a08, roughness: 0.5, emissive: 0xffa040, emissiveIntensity: 3.2 },
  cw_gateGlow: { color: 0x0a1a10, roughness: 0.5, emissive: 0x70ffb0, emissiveIntensity: 3.0 },
};

export const mix = [['grass', 2], ['barn', 1], ['ruin', 1], ['junk', 1]];
export const spots = [
  // west corn
  ...[[-27, -10], [-25, -4], [-29, 2], [-24, 8], [-28, 10], [-23, -12], [-26, 5], [-22, 0], [-30, -6]].map(([x, z]) => ({ x, z, kind: 'grass', crouch: true })),
  // south-east corn
  ...[[20, 12], [26, 12], [22, 16], [28, 18], [18, 19], [25, 20], [30, 12], [17, 14]].map(([x, z]) => ({ x, z, kind: 'grass', crouch: true })),
  // small grass patches
  ...[[-15, -17], [-12, -14], [-10, -18], [10, -14], [12, -10], [7, 14], [11, 17], [9, 18]].map(([x, z]) => ({ x, z, kind: 'grass', crouch: true })),
  { x: -7.2, z: -4.2, kind: 'barn', crouch: false }, { x: 7.2, z: 4.2, kind: 'barn', crouch: false }, { x: 3, z: -4.2, kind: 'barn', crouch: true }, { x: -3, z: 4.2, kind: 'barn', crouch: true },
  { x: -28.3, z: -27.7, kind: 'ruin', crouch: true }, { x: -18.6, z: -27.7, kind: 'ruin', crouch: true }, { x: -24, z: -18.2, kind: 'ruin', crouch: false },
  { x: 16.4, z: -24, kind: 'farm', crouch: false }, { x: 26.4, z: -15, kind: 'farm', crouch: true }, { x: 21, z: -23.6, kind: 'farm', crouch: true },
  { x: 27.2, z: 3, kind: 'shed', crouch: true }, { x: 22, z: 5, kind: 'shed', crouch: true },
  { x: -11, z: 20.2, kind: 'junk', crouch: true }, { x: -14, z: 25, kind: 'junk', crouch: true }, { x: -7, z: 23.5, kind: 'junk', crouch: true }, { x: 1, z: 22, kind: 'junk', crouch: false },
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
      b.collider({ x0: s, x1: e, z0: f - 0.06, z1: f + 0.06, y0: 0, y1: h });
      b.box(c, f, l, 0.05, 0.1, 'wood', { y0: h * 0.35, ...d }); b.box(c, f, l, 0.05, 0.1, 'wood', { y0: h * 0.78, ...d });
      for (let k = 0; k <= n; k++) b.box(s + (l * k) / n, f, 0.1, 0.1, h + 0.12, 'wood', d);
    } else {
      b.collider({ x0: f - 0.06, x1: f + 0.06, z0: s, z1: e, y0: 0, y1: h });
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

  // ----- ground: mud base, dirt roads, dry-grass under the tall grass
  b.box(0, 0, 70, 70, 0.02, 'mud', deco);
  for (const [x, z, w, d] of ROADS) b.box(x, z, w, d, 0.03, 'dirt', deco);
  for (const g of GRASS) b.box((g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2, g.x1 - g.x0, g.z1 - g.z0, 0.025, 'dryGrass', deco);

  // ----- central barn: two rooms, 6 window vaults, 2 doors, a doorway between the rooms
  const { x0: bx0, x1: bx1, z0: bz0, z1: bz1 } = BARN;
  b.box(0, 0, 16, 10, 0.05, 'wood', deco);
  wall(b, 'x', bz0, bx0 - 0.15, bx1 + 0.15, WALLS.barnN); wall(b, 'x', bz1, bx0 - 0.15, bx1 + 0.15, WALLS.barnS);
  wall(b, 'z', bx0, bz0, bz1, WALLS.barnW); wall(b, 'z', bx1, bz0, bz1, WALLS.barnE);
  wall(b, 'z', 0, bz0, bz1, WALLS.barnMid, { t: 0.2, h: 3.2 });
  for (let k = 0; k < 4; k++) b.box(0, 0, 17.2 - k * 0.2, 11.2 - k * 2.8, 0.3, 'cw_roof', { y0: 3.5 + k * 0.3, ...deco }); // stepped roof
  for (const x of [-8, -4, 0, 4, 8]) b.box(x, 0, 0.25, 10.4, 0.25, 'cw_post', { y0: 3.25, ...deco }); // beams
  b.light(-4, 2.7, -0.5, 36, 13, 0xffb060); b.light(4, 2.7, 0.5, 36, 13, 0xffb060);
  b.mesh(['sphere', 0.13, 8, 6], 'cw_glow', -4, 2.7, -0.5, { cast: false }); b.mesh(['sphere', 0.13, 8, 6], 'cw_glow', 4, 2.7, 0.5, { cast: false });
  for (const [x, z, r] of [[-7.1, -2.3, 0.3], [-7.1, 2.4, -0.3], [7.0, -2.4, 0.4]]) b.model('hay_bale', x, z, { ry: r, w: 1.2, d: 1.2, h: 1.2 });
    b.prop('crate', () => b.box(-1.0, -4.2, 0.9, 0.9, 0.9, 'wood')); b.prop('crate', () => b.box(-1.0, -3.3, 0.7, 0.7, 0.7, 'wood'));
  b.prop('barrel', () => { b.mesh(['cyl', 0.32, 0.32, 0.9, 10], 'cw_barrel', -2.4, 0.45, 4.1); b.collider({ x0: -2.72, x1: -2.08, z0: 3.78, z1: 4.42, y0: 0, y1: 0.9 }); });
  b.model('tarp_car', 3.4, -0.2, { w: 1.8, d: 4.4, h: 1.4 }); // wreck in the east room
  b.model('barrel_red', 6.8, 3.2, { w: 0.6, d: 0.6, h: 0.9, ry: 1 }); b.model('jerrycan', 5.4, 3.9, { s: 1.3, ry: 0.5, deco: true, collide: false });
  b.model('lantern', -8, 0, { s: 2.2, y0: 1.2, deco: true, collide: false }); // on the west sill

  // ----- farmhouse ruin (north-east)
  wall(b, 'x', FARM.z1, FARM.x0, FARM.x1, WALLS.farmS, { mat: 'wall', h: 3.0 });
  wall(b, 'x', FARM.z0, FARM.x0, FARM.x1, WALLS.farmN, { mat: 'wall', h: 2.4 });
  wall(b, 'z', FARM.x0, FARM.z0, FARM.z1, WALLS.farmW, { mat: 'wall', h: 3.0 });
  wall(b, 'z', FARM.x1, FARM.z0, FARM.z1, WALLS.farmE, { mat: 'wall', h: 2.0 });
  b.box(0 + 21, -19.5, 12, 11, 0.04, 'wood', deco);
  b.box(26.2, -24, 1.2, 1.2, 5.2, 'cw_stone'); b.box(26.2, -23.2, 1.8, 0.4, 1.0, 'cw_stone2'); // chimney + hearth
  for (const [x, z, w, d] of [[17.5, -22.5, 5, 3.6], [22.5, -16.6, 4, 2.4]]) b.box(x, z, w, d, 0.15, 'cw_roof', { y0: 2.9, ...deco }); // roof remnants
  for (const x of [15.2, 19.6, 24.0]) b.box(x, -20, 0.2, 10.4, 0.25, 'cw_post', { y0: 3.0, ...deco }); // bare rafters
  b.prop('table', () => b.box(19.5, -22, 1.8, 0.9, 0.8, 'wood')); b.prop('bed frame', () => b.box(25.4, -16.2, 1.0, 2.0, 0.5, 'wood'));
  b.box(15.7, -18, 0.5, 1.8, 1.0, 'cw_dark'); // dresser against the west wall
  b.light(22, 2.4, -19, 34, 14, 0xffa860); b.mesh(['sphere', 0.12, 8, 6], 'cw_glow', 22, 2.4, -19, { cast: false });

  // ----- stone ruin (north-west)
  wall(b, 'x', RUIN.z1, RUIN.x0, RUIN.x1, WALLS.ruinS, { mat: 'cw_stone', t: 0.3, h: 2.6 });
  wall(b, 'z', RUIN.x1, RUIN.z0, RUIN.z1, WALLS.ruinE, { mat: 'cw_stone', t: 0.3, h: 2.4 });
  wall(b, 'x', RUIN.z0, RUIN.x0, RUIN.x1, [], { mat: 'cw_stone', t: 0.3, h: 2.2 });
  wall(b, 'z', RUIN.x0, RUIN.z0, RUIN.z1, [], { mat: 'cw_stone', t: 0.3, h: 2.8 });
  for (const [x, z, h] of [[-26, -21, 2.8], [-21, -25.5, 2.2], [-27.5, -26, 1.2], [-19.5, -19.5, 1.6]]) b.box(x, z, 0.8, 0.8, h, 'cw_stone2');
  for (let k = 0; k < 7; k++) { const x = -28 + rnd(0, 10), z = -27 + rnd(0, 8); if (Math.hypot(x + 23.5, z + 23.5) > 2.2) b.box(x, z, rnd(0.4, 0.8), rnd(0.4, 0.8), rnd(0.15, 0.4), 'cw_stone', { cast: false, collide: false }); } // rubble
  b.light(-23.5, 2.2, -22.5, 32, 13, 0xffa860);

  // ----- open-front shed (east), relic inside
  wall(b, 'x', SHED.z0, SHED.x0, SHED.x1, [], { t: 0.25, h: 2.8 }); wall(b, 'x', SHED.z1, SHED.x0, SHED.x1, [], { t: 0.25, h: 2.8 }); wall(b, 'z', SHED.x1, SHED.z0, SHED.z1, [], { t: 0.25, h: 2.8 });
  b.box(24.5, 3, 7.6, 6.4, 0.2, 'cw_roof', { y0: 2.8, ...deco }); b.box(24.5, 3, 7, 6, 0.04, 'wood', deco);
  b.light(24.5, 2.4, 3, 30, 12, 0xffa860);
  b.prop('crate', () => b.box(27.0, 0.9, 0.9, 0.9, 0.9, 'wood')); b.prop('crate', () => b.box(27.0, 5.1, 0.9, 0.9, 0.9, 'wood'));

  // ----- junk yard (south-west): three containers + two tarp-covered wrecks make a ring round the yard
  b.box(-12, 17.5, 6, 2.4, 2.6, 'cw_cont1'); b.box(-16.5, 23.5, 2.4, 6, 2.6, 'cw_cont2'); b.box(-9, 28, 6, 2.4, 2.6, 'cw_rust');
  b.box(-12, 17.5, 6.1, 2.5, 0.12, 'cw_dark', { y0: 2.6, ...deco }); b.box(-9, 28, 6.1, 2.5, 0.12, 'cw_dark', { y0: 2.6, ...deco });
  b.model('tarp_car', -3.5, 20.6, { w: 1.8, d: 4.4, h: 1.4 }); b.model('tarp_car', -5.2, 25.8, { ry: 1.2, w: 1.8, d: 4.4, h: 1.4 });
  for (const [x, z] of [[-8.6, 20.2], [-8.1, 21.1]]) b.prop('barrel', () => { b.mesh(['cyl', 0.32, 0.32, 0.9, 10], 'cw_barrel', x, 0.45, z); b.collider({ x0: x - 0.32, x1: x + 0.32, z0: z - 0.32, z1: z + 0.32, y0: 0, y1: 0.9 }); });
  b.model('barrel_blue', -14.2, 20.6, { w: 0.65, d: 0.65, h: 0.93 }); b.model('wheel', -9.5, 24.6, { s: 2.2, ry: 0.4, deco: true, collide: false }); b.model('wheel', -13.4, 26, { s: 2.2, ry: 2, deco: true, collide: false });
  b.model('jerrycan', -7.2, 22.2, { s: 1.4, ry: 1, deco: true, collide: false });
  b.prop('crate', () => b.box(-14.4, 18.5, 0.9, 0.9, 0.9, 'wood')); b.prop('tractor tyre', () => b.mesh(['cyl', 0.5, 0.5, 0.35, 12], 'cw_dark', -6.5, 0.18, 17.8));
  b.light(-11, 2.8, 22.5, 32, 14, 0xffa860);

  // ----- fence lines (gaps keep every field reachable; jump height is 0.9, the fences are 1.0)
  const P = 32.6;
  fence(b, 'x', -P, -P, P, [{ c: GATES[0][0], w: 4.4 }], 1.5); fence(b, 'x', P, -P, P, [{ c: GATES[1][0], w: 4.4 }], 1.5);
  fence(b, 'z', -P, -P, P, [], 1.5); fence(b, 'z', P, -P, P, [], 1.5);
  fence(b, 'z', -20, -15, 13, [{ c: -6, w: 3 }, { c: 2, w: 3 }, { c: 8, w: 3 }]);
  fence(b, 'x', -15, -P, -20, [{ c: -26, w: 3 }]); fence(b, 'x', 13, -P, -20, [{ c: -27, w: 3 }]);
  fence(b, 'x', 8.6, 15, P, [{ c: 19, w: 3 }, { c: 28, w: 3 }]); fence(b, 'z', 15, 8.6, 22.5, [{ c: 17, w: 3 }]);
  fence(b, 'x', 22.5, 15, P, [{ c: 22, w: 3 }, { c: 29, w: 3 }]);
  fence(b, 'x', -21, -4, 9, [{ c: 2, w: 3 }]); fence(b, 'z', -4, -29, -21, [{ c: -25, w: 2.6 }]); // yard round the north relic

  // ----- gates: framed arches with an emissive bar, one on the north and one on the south edge
  for (const [gx, gz] of GATES) {
    const s = Math.sign(gz), z = s * 32.6;
    for (const dx of [-2.4, 2.4]) b.box(gx + dx, z, 0.5, 0.5, 3.8, 'cw_post');
    b.box(gx, z, 5.3, 0.45, 0.4, 'cw_post', { y0: 3.8, ...deco }); b.box(gx, z - s * 0.05, 4.4, 0.2, 0.18, 'cw_gateGlow', { y0: 3.5, ...deco });
    b.box(gx, z, 4.4, 0.1, 0.06, 'cw_gateGlow', { y0: 0.06, ...deco });
    b.light(gx, 3.4, gz, 40, 14, 0x90ffb8);
  }

  // ----- relic pedestals: stone plinth + a lantern glow
  for (const [x, z] of RELICS) {
    b.mesh(['cyl', 0.26, 0.34, 0.7, 8], 'cw_stone', x, 0.35, z, { cast: false }); b.mesh(['sphere', 0.15, 8, 6], 'cw_glow', x, 0.95, z, { cast: false });
  }
  b.light(2, 1.9, -25, 30, 13, 0xffb060); b.light(-18, 1.9, 2, 30, 13, 0xffb060); b.light(22, 1.9, 25, 30, 13, 0xffb060);
  b.light(0, 2.8, -13.5, 22, 12, 0xffb060); // north road lamp
  for (const [x, z] of [[0, -13.5], [-6, 9.4], [8, 9.4]]) { b.box(x, z, 0.14, 0.14, 2.6, 'cw_post', { cast: false }); b.mesh(['sphere', 0.16, 8, 6], 'cw_glow', x, 2.7, z, { cast: false }); }

  // ----- cages
  for (const [x, z] of CAGES) b.model('cage', x, z, { collide: false, s: 1 });

  // ----- scatter: rocks, logs, wagons, hay, wells
  for (const [x, z, s, r] of [[-17, 8, 0.45, 1], [27, -2, 0.4, 2], [6, -30, 0.5, 0.3], [-28, 17, 0.5, 4], [30, 24, 0.4, 5]]) b.model('rocks', x, z, { s, ry: r, w: 7 * s, d: 6 * s, h: 1.1 * s });
  for (const [x, z, r] of [[-16.5, 5.6, 0.5], [12, -22, 1.2], [-7, -29, 2.6], [31.5, 26, 1.5], [3, 30, 0.2]]) b.model('log', x, z, { ry: r, w: 4, d: 1, h: 0.8 });
  for (const [x, z] of [[18, 26.5], [26, 27]]) { b.box(x, z, 3.0, 1.6, 0.9, 'wood'); b.box(x - 0.9, z + 0.9, 0.3, 0.2, 0.7, 'cw_dark', { collide: false }); } // wagons
  b.prop('hay bale', () => b.box(24.5, 23.5, 1.2, 1.0, 0.9, 'cw_straw')); b.prop('hay bale', () => b.box(5, -27.5, 1.2, 1.0, 0.9, 'cw_straw'));
  for (const [x, z, r] of [[-3.5, -27, 0.4], [20, 29.5, 0.1], [-20, -2.5, 1], [-1, 9, 2]]) b.model('hay_bale', x, z, { ry: r, w: 1.4, d: 1.4, h: 1.4 });
  b.box(14, -2.5, 1.4, 1.4, 0.9, 'cw_stone'); b.mesh(['cyl', 0.6, 0.6, 0.4, 10], 'cw_dark', 14, 0.9, -2.5, { cast: false }); // well
  b.box(-21.5, 26, 5, 0.4, 1.1, 'cw_straw', { collide: false, cast: false });

  // ----- trees: a dense ring at the edge (solid trunks), scattered dead trees inside, and a decorative forest beyond the fence
  const keep = [...SPAWNS, ...RELICS, ...GATES, ...CAGES, ...spots.map((s) => [s.x, s.z]), ...VAULTS.map((v) => [v.x, v.z]), [SEEKER.x, SEEKER.z]];
  const free = (x, z, r) => keep.every(([kx, kz]) => Math.hypot(x - kx, z - kz) > r)
    && ![BARN, FARM, RUIN, SHED, JUNK].some((rc) => inR(rc, x, z, 2.5)) && !GRASS.some((g) => inR(g, x, z, 0.5)) && !ROADS.some(([cx, cz, w, d]) => inR({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }, x, z, 1.8));
  const tree = (x, z, kind) => b.model(kind, x, z, { s: 0.85 + rnd(0, 0.5), ry: rnd(0, 6.28), w: 0.7, d: 0.7, h: 3 });
  for (let t = -31.5; t <= 31.5; t += 2.9) {
    for (const [x, z] of [[t, -31.2 + rnd(-0.6, 0.6)], [t, 31.2 + rnd(-0.6, 0.6)], [-31.2 + rnd(-0.6, 0.6), t], [31.2 + rnd(-0.6, 0.6), t]]) {
      const k = rnd(0, 1); // roll once: the build rnd stream must not depend on `free`
      if (free(x, z, 3.2)) tree(x, z, k < 0.18 ? 'dead_tree' : k < 0.6 ? 'pine' : 'pine_small');
    }
  }
  for (let n = 0, tries = 0; n < 16 && tries < 400; tries++) {
    const x = rnd(-29, 29), z = rnd(-29, 29), k = rnd(0, 1);
    if (!free(x, z, 3) || Math.abs(x) < 3 && Math.abs(z) < 12) continue;
    tree(x, z, k < 0.6 ? 'dead_tree' : 'pine_small'); n++;
  }
  for (let t = -44; t <= 44; t += 3.4) for (const [x, z] of [[t, -35 - rnd(0, 6)], [t, 35 + rnd(0, 6)], [-35 - rnd(0, 6), t], [35 + rnd(0, 6), t]]) b.model('pine', x, z, { s: 1 + rnd(0, 0.7), ry: rnd(0, 6.28), collide: false, deco: true });
}
