// "Funfair": an old fairground at dusk. ~50x50 m, the largest map (6-8 players). Hedge maze (north-west), ghost train (north), teacups (west), carousel (centre),
// ferris wheel (north-east), game stalls (east), hay-bale pen (south-west), food court (south-east), entrance plaza (south). Outdoors: no roof, a fence round the edge.
// The ghost-train interior is dark and lit by emissives only. Same builder API as lateshop.js: b.box / mesh / collider / light / prop. No THREE, no DOM.
// Both mazes are generated from fixed local seeds (not the build rnd), so the AI spots below can sit on cell centres of the very same layout.
// Material names are prefixed `ff_` (the client's material table is global). Gameplay constants: player radius 0.3, crouch height 1.0, standing 1.7.

// ---------- maze generator (recursive backtracker + extra openings so there are loops). cols x rows cells of 2 m; walls: V[r][c] on the left edge of cell (r,c), H[r][c] on its top edge
const lcg = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
function genMaze(cols, rows, seed, extra, openings) {
  const r = lcg(seed), V = Array.from({ length: rows }, () => Array(cols + 1).fill(true)), H = Array.from({ length: rows + 1 }, () => Array(cols).fill(true));
  const seen = Array.from({ length: rows }, () => Array(cols).fill(false)), stack = [[0, 0]];
  seen[0][0] = true;
  while (stack.length) {
    const [cr, cc] = stack[stack.length - 1], nb = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]].filter(([a, c]) => a >= 0 && c >= 0 && a < rows && c < cols && !seen[a][c]);
    if (!nb.length) { stack.pop(); continue; }
    const [nr, nc] = nb[(r() * nb.length) | 0];
    if (nr !== cr) H[Math.max(nr, cr)][cc] = false; else V[cr][Math.max(nc, cc)] = false;
    seen[nr][nc] = true; stack.push([nr, nc]);
  }
  for (let k = 0; k < extra; k++) { const a = 1 + ((r() * (rows - 1)) | 0), c = 1 + ((r() * (cols - 1)) | 0); if (r() < 0.5) V[a][c] = false; else H[a][c] = false; } // interior walls only
  for (const [side, i] of openings) { if (side === 'S') H[rows][i] = false; else if (side === 'N') H[0][i] = false; else if (side === 'E') V[i][cols] = false; else V[i][0] = false; }
  const open = (a, c) => (V[a][c] ? 0 : 1) + (V[a][c + 1] ? 0 : 1) + (H[a][c] ? 0 : 1) + (H[a + 1][c] ? 0 : 1);
  const deadEnds = [];
  for (let a = 0; a < rows; a++) for (let c = 0; c < cols; c++) if (open(a, c) === 1) deadEnds.push([a, c]);
  return { cols, rows, V, H, deadEnds };
}
const HEDGE = { x: -23, z: -23, maze: genMaze(9, 8, 20240611, 9, [['S', 2], ['S', 6], ['E', 3]]) };   // hedge maze: x -23..-5, z -23..-7
const GHOST = { x: -3, z: -23, maze: genMaze(7, 7, 777, 6, [['S', 1], ['E', 5]]) };                    // ghost train interior: x -3..11, z -23..-9
const cellC = (m, a, c) => [+(m.x + 2 * c + 1).toFixed(2), +(m.z + 2 * a + 1).toFixed(2)];

export const meta = {
  id: 'funfair', name: 'Funfair', size: 50, blurb: 'A fairground at dusk. Hedge maze, ghost train, hay bales and a thousand plushies.',
  players: { min: 5, max: 8, recommended: '6-8' }, thumbnail: '/thumbs/funfair.webp',
  fog: { color: 0x2a1c34, near: 22, far: 95 }, sky: 'dusk',
  ambient: { color: 0xa090c8, ground: 0x4a3a5a, intensity: 1.2 },
  seekerStart: { x: 0, z: 21.5, yaw: 0 }, // entrance plaza (server spreads seekers along x by 1.4)
  bounds: { x0: -25, x1: 25, z0: -25, z1: 25 },
  outdoor: { reverb: 'outdoor', surface: 'grass' }, // anywhere outside a zone
  zones: [ // rooms for culling + audio (first match wins, see src/audio/zones.js): flat x0..z1 (audio) and the same rectangle as `box` (culling); reverb room|hall|outdoor; surface wood|tile|grass|concrete
    { name: 'hedge maze', x0: -25, x1: -5, z0: -25, z1: -7, box: { x0: -25, x1: -5, z0: -25, z1: -7 }, reverb: 'outdoor', surface: 'grass' },
    { name: 'ghost train', x0: -3, x1: 11, z0: -23, z1: -9, box: { x0: -3, x1: 11, z0: -23, z1: -9 }, reverb: 'room', surface: 'wood' },
    { name: 'ferris wheel', x0: 12, x1: 25, z0: -25, z1: -8, box: { x0: 12, x1: 25, z0: -25, z1: -8 }, reverb: 'outdoor', surface: 'grass' },
    { name: 'teacups', x0: -25, x1: -8, z0: -6, z1: 7, box: { x0: -25, x1: -8, z0: -6, z1: 7 }, reverb: 'outdoor', surface: 'grass' },
    { name: 'midway', x0: -8, x1: 25, z0: -8, z1: 9, box: { x0: -8, x1: 25, z0: -8, z1: 9 }, reverb: 'outdoor', surface: 'concrete' },
    { name: 'hay pen', x0: -25, x1: -8, z0: 8, z1: 25, box: { x0: -25, x1: -8, z0: 8, z1: 25 }, reverb: 'outdoor', surface: 'grass' },
    { name: 'food court', x0: 8, x1: 25, z0: 9, z1: 25, box: { x0: 8, x1: 25, z0: 9, z1: 25 }, reverb: 'outdoor', surface: 'concrete' },
    { name: 'plaza', x0: -8, x1: 8, z0: 9, z1: 25, box: { x0: -8, x1: 8, z0: 9, z1: 25 }, reverb: 'outdoor', surface: 'concrete' },
  ],
};

export const materials = {
  ff_ground: { color: 0x4a4a40, roughness: 1 },
  ff_path: { color: 0x7a6a52, roughness: 1 },
  ff_grass: { color: 0x34502e, roughness: 1 },
  ff_fence: { color: 0x5a3a28, roughness: 0.9 },
  ff_hedge: { color: 0x234a2a, roughness: 1, flatShading: true },
  ff_ghostWall: { color: 0x2a2236, roughness: 0.8 },
  ff_ghostGlow: { color: 0x0a1a0a, roughness: 0.5, emissive: 0x6aff8a, emissiveIntensity: 2.4 },
  ff_ghostGlow2: { color: 0x1a0a1a, roughness: 0.5, emissive: 0xc060ff, emissiveIntensity: 2.4 },
  ff_ghostRoof: { color: 0x15121c, roughness: 0.9 },
  ff_red: { color: 0xc0302a, roughness: 0.6 }, ff_blue: { color: 0x2c5aa0, roughness: 0.6 }, ff_yellow: { color: 0xe0b030, roughness: 0.6 }, ff_teal: { color: 0x2a9a8a, roughness: 0.6 },
  ff_white: { color: 0xe8e4dc, roughness: 0.7 },
  ff_wood: { color: 0x8a5a36, roughness: 0.8 },
  ff_steel: { color: 0x9aa0aa, roughness: 0.35, metalness: 0.6 },
  ff_dark: { color: 0x25272d, roughness: 0.6 },
  ff_hay: { color: 0xc9a43a, roughness: 1 },
  ff_plush: { color: 0xe07aa0, roughness: 1 }, ff_plush2: { color: 0x7ab0e0, roughness: 1 }, ff_plush3: { color: 0xa0d060, roughness: 1 },
  ff_horse: { color: 0xe8e0d0, roughness: 0.5 },
  ff_cup: { color: 0xd04a8a, roughness: 0.5 }, ff_cup2: { color: 0x3a8ad0, roughness: 0.5 },
  ff_canvas: { color: 0xe0d0b0, roughness: 0.95 },
  ff_pumpkin: { color: 0xd8741c, roughness: 0.8 },
  ff_bulb: { color: 0x3a2a10, roughness: 0.5, emissive: 0xffd070, emissiveIntensity: 3.0 },
  ff_neon: { color: 0x1a0a10, roughness: 0.5, emissive: 0xff4a9a, emissiveIntensity: 2.6 },
  ff_neonBlue: { color: 0x0a1020, roughness: 0.5, emissive: 0x4ab0ff, emissiveIntensity: 2.6 },
  ff_stone: { color: 0x8a8790, roughness: 0.9, flatShading: true },
  ff_leaf: { color: 0x2f6b3a, roughness: 0.9, flatShading: true },
  ff_exit: { color: 0x200000, roughness: 0.5, emissive: 0xff2a1a, emissiveIntensity: 2.2 },
};

export const mix = [['maze', 1], ['ghost', 1], ['hay', 1], ['stall', 1], ['food', 1]];
const mazeSpots = HEDGE.maze.deadEnds.slice(0, 11).map(([a, c]) => ({ x: cellC(HEDGE, a, c)[0], z: cellC(HEDGE, a, c)[1], kind: 'maze', crouch: false }));
const ghostSpots = GHOST.maze.deadEnds.slice(0, 7).map(([a, c]) => ({ x: cellC(GHOST, a, c)[0], z: cellC(GHOST, a, c)[1], kind: 'ghost', crouch: false }));
export const spots = [
  ...mazeSpots, ...ghostSpots,
  // hay pen
  { x: -22.0, z: 12.0, kind: 'hay', crouch: false }, { x: -17.0, z: 14.5, kind: 'hay', crouch: false }, { x: -13.0, z: 11.0, kind: 'hay', crouch: false }, { x: -19.5, z: 18.0, kind: 'hay', crouch: false },
  { x: -14.0, z: 19.5, kind: 'hay', crouch: false }, { x: -22.5, z: 22.5, kind: 'hay', crouch: false }, { x: -10.5, z: 22.5, kind: 'hay', crouch: false },
  // stalls (behind counters, beside plush stacks) and midway
  { x: 15, z: -6.3, kind: 'stall', crouch: false }, { x: 20, z: -6.3, kind: 'stall', crouch: false }, { x: 15, z: 8.05, kind: 'stall', crouch: false }, { x: 20, z: 8.05, kind: 'stall', crouch: false },
  { x: 11.0, z: -1.0, kind: 'stall', crouch: false }, { x: 23.5, z: 1.0, kind: 'stall', crouch: false }, { x: 8.0, z: 5.5, kind: 'stall', crouch: false },
  // rides
  { x: -15.75, z: 0, kind: 'ride', crouch: false }, { x: -11.0, z: -3.5, kind: 'ride', crouch: false }, { x: 1.25, z: 2, kind: 'ride', crouch: false }, { x: -3.0, z: 6.0, kind: 'ride', crouch: false },
  { x: 18.5, z: -13.0, kind: 'ride', crouch: false }, { x: 22.5, z: -18.5, kind: 'ride', crouch: false }, { x: 14.0, z: -20.0, kind: 'ride', crouch: false },
  // food court + plaza + fence line
  { x: 12.0, z: 13.0, kind: 'food', crouch: true }, { x: 17.0, z: 13.0, kind: 'food', crouch: true }, { x: 22, z: 15.75, kind: 'food', crouch: false }, { x: 14.5, z: 19.5, kind: 'food', crouch: false },
  { x: 23.5, z: 23.0, kind: 'food', crouch: false }, { x: 9.5, z: 23.0, kind: 'plaza', crouch: false }, { x: -9.5, z: 14.0, kind: 'plaza', crouch: false }, { x: 6.0, z: 12.0, kind: 'plaza', crouch: false },
  { x: -6.5, z: 18.5, kind: 'plaza', crouch: false }, { x: 24.0, z: -3.0, kind: 'fence', crouch: false }, { x: -24.0, z: 0.5, kind: 'fence', crouch: false }, { x: 8.0, z: -7.5, kind: 'fence', crouch: false },
];
export const spawns = [
  [0, 20], [-4, 18], [4, 18], [-7, 12], [7, 12], [0, 11], [-6.25, 3], [-12, 4], [6, 4], [12, 1], [0, -6], [14, -2.5], [8, -12], [14, -16], [-14, 10], [-18, 7],
  [-8, -9.75], [19, -8.5], [20, 12], [10.5, 18], [-3, 14], [22.5, -12],
];

export function build(b, rnd) {
  const deco = { collide: false, cast: false };
  const one = (name, mat, x, z, w, d, h, y0 = 0) => b.prop(name, () => b.box(x, z, w, d, h, mat, { y0, cast: false })); // small props do not cast sun shadows (halves their draw cost)
  const lamp = (x, z) => { b.prop('lamp post', () => b.box(x, z, 0.14, 0.14, 3.0, 'ff_dark')); b.mesh(['sphere', 0.22, 10, 8], 'ff_bulb', x, 3.1, z, { cast: false }); }; // bulb is shared static glow, not part of the prop
  const bench = (x, z, alongX = true) => b.prop('bench', () => b.box(x, z, alongX ? 1.6 : 0.5, alongX ? 0.5 : 1.6, 0.45, 'ff_wood', { cast: false }));
  const bin = (x, z) => one('bin', 'ff_dark', x, z, 0.45, 0.45, 0.8);

  // ----- ground + fence
  b.box(0, 0, 51, 51, 0.02, 'ff_grass', deco);
  b.box(0, 6.5, 50, 5, 0.03, 'ff_path', deco); b.box(0, 14, 12, 22, 0.03, 'ff_path', deco); b.box(12, 1.5, 26, 14, 0.03, 'ff_path', deco); b.box(-14, 1, 14, 14, 0.03, 'ff_path', deco);
  for (const [x, z, w, d] of [[0, -25, 50.4, 0.3], [-25, 0, 0.3, 50.4], [25, 0, 0.3, 50.4], [-14, 25, 22, 0.3], [14, 25, 22, 0.3]]) b.box(x, z, w, d, 2.2, 'ff_fence'); // gate at the south: x -3..3
  b.box(-3.2, 25, 0.5, 0.5, 3.2, 'ff_red'); b.box(3.2, 25, 0.5, 0.5, 3.2, 'ff_red'); b.box(0, 25, 6.9, 0.4, 0.7, 'ff_neon', { y0: 3.0, ...deco }); // gate posts + neon arch
  b.light(0, 3.4, 18, 44, 20, 0xffd9a0);   // plaza
  b.light(2, 4.2, 2, 46, 20, 0xffb060);    // carousel + midway
  b.light(5, 2.6, -7.5, 30, 14, 0x6aff9a); // ghost train entrance glow
  b.light(16, 3.2, 15, 36, 18, 0xffc880);  // food court

  // ----- hedge maze (x -23..-5, z -23..-7): merged runs of 0.5 m hedge, 1.9 m high
  const hedgeRuns = (m, mat, thick, h) => {
    const { cols, rows, V, H } = m.maze;
    for (let a = 0; a <= rows; a++) { let c0 = -1; for (let c = 0; c <= cols; c++) { const on = c < cols && H[a][c]; if (on && c0 < 0) c0 = c; if (!on && c0 >= 0) { b.box(m.x + (c0 + c) - 0, m.z + 2 * a, 2 * (c - c0) + thick, thick, h, mat); c0 = -1; } } }
    for (let c = 0; c <= cols; c++) { let r0 = -1; for (let a = 0; a <= rows; a++) { const on = a < rows && V[a][c]; if (on && r0 < 0) r0 = a; if (!on && r0 >= 0) { b.box(m.x + 2 * c, m.z + (r0 + a), thick, 2 * (a - r0) + thick, h, mat); r0 = -1; } } }
  };
  hedgeRuns(HEDGE, 'ff_hedge', 0.5, 1.9);
  b.prop('topiary', () => { b.box(-4.0, -9.0, 0.7, 0.7, 1.4, 'ff_leaf'); b.mesh(['ico', 0.6, 1], 'ff_leaf', -4.0, 1.2, -9.0); });
  b.prop('garden gnome', () => { b.box(-4.4, -12.0, 0.3, 0.3, 0.5, 'ff_red'); });
  for (const [x, z] of [[-4.2, -15.0], [-4.2, -19.0]]) bench(x, z, false);

  // ----- ghost train (x -3..11, z -23..-9): dark maze inside, glowing strips only
  hedgeRuns(GHOST, 'ff_ghostWall', 0.25, 3.0);
  b.box(4, -16, 14.6, 14.6, 0.25, 'ff_ghostRoof', { y0: 3.0, collide: false });
  for (const [a, c] of [[0, 2], [2, 5], [3, 1], [4, 4], [6, 2], [1, 6], [5, 6]]) b.box(GHOST.x + 2 * c + 1, GHOST.z + 2 * a + 0.2, 1.2, 0.06, 0.06, (a + c) % 2 ? 'ff_ghostGlow' : 'ff_ghostGlow2', { y0: 1.6, ...deco }); // wall strips
  for (let i = 0; i < 7; i++) b.box(GHOST.x + 2 * i + 1, GHOST.z + 14.1, 1.0, 0.06, 0.12, i % 2 ? 'ff_ghostGlow' : 'ff_ghostGlow2', { y0: 0.1, ...deco }); // floor strip, south wall inside
  b.box(4.0, -8.85, 5.0, 0.2, 1.0, 'ff_neon', { y0: 3.1, ...deco }); // facade sign
  b.box(0.0, -8.9, 1.0, 0.5, 4.2, 'ff_red'); b.box(8.0, -8.9, 1.0, 0.5, 4.2, 'ff_red');
  for (const [x, z] of [[1.0, -21.0], [7.0, -19.0], [3.0, -13.0]]) b.prop('ghost cutout', () => b.box(x, z, 0.8, 0.1, 1.7, 'ff_white'));
  b.prop('coffin', () => b.box(9.0, -21.0, 0.7, 1.9, 0.6, 'ff_dark'));
  b.prop('ghost train car', () => { b.box(7.0, -10.0, 1.2, 2.4, 0.7, 'ff_ghostGlow2'); });
  b.prop('pumpkin', () => b.mesh(['ico', 0.35, 1], 'ff_pumpkin', 2.0, 0.35, -11.5));
  b.prop('skeleton prop', () => { b.box(-1.5, -21.5, 0.5, 0.3, 1.7, 'ff_white'); });

  // ----- teacups (west, centre (-15, 0))
  b.box(-15, 0, 10.5, 10.5, 0.1, 'ff_dark', deco);
  b.box(-15, 0, 0.8, 0.8, 1.6, 'ff_steel'); b.box(-15, 0, 9.0, 0.1, 0.06, 'ff_neonBlue', { y0: 0.12, ...deco });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, x = -15 + Math.cos(a) * 3.3, z = Math.sin(a) * 3.3, mat = k % 2 ? 'ff_cup2' : 'ff_cup';
    b.prop('teacup', () => { b.mesh(['cyl', 0.8, 0.5, 0.7, 14], mat, x, 0.45, z); b.collider({ x0: x - 0.7, x1: x + 0.7, z0: z - 0.7, z1: z + 0.7, y0: 0.1, y1: 0.8 }); });
  }
  b.prop('ticket booth', () => b.box(-8.6, 4.5, 1.4, 1.4, 2.2, 'ff_teal')); b.box(-8.6, 3.8, 1.0, 0.06, 0.5, 'ff_bulb', { y0: 1.2, ...deco });

  // ----- carousel (centre (2, 2)): lit platform, six horses
  b.box(2, 2, 9.0, 9.0, 0.12, 'ff_wood', deco); b.box(2, 2, 0.9, 0.9, 3.2, 'ff_red');
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, x = 2 + Math.cos(a) * 2.6, z = 2 + Math.sin(a) * 2.6;
    b.prop('carousel horse', () => { b.box(x, z, 0.5, 1.1, 0.8, 'ff_horse', { y0: 0.4 }); b.box(x, z, 0.1, 0.1, 1.2, 'ff_horse', { collide: false }); });
  }
  b.box(2, 2, 10, 10, 0.3, 'ff_red', { y0: 3.6, ...deco }); b.box(2, 2, 10.2, 10.2, 0.12, 'ff_bulb', { y0: 3.5, ...deco });
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.box(2 + Math.cos(a) * 4.6, 2 + Math.sin(a) * 4.6, 0.12, 0.12, 3.5, 'ff_steel', { collide: false, cast: false }); }

  // ----- ferris wheel (north-east, hub (19, -14)): kiddie wheel with gondolas near the ground
  for (const dz of [-3.2, 3.2]) b.box(19, -14 + dz, 0.5, 0.5, 3.8, 'ff_steel');
  b.box(19, -14, 0.5, 6.6, 0.3, 'ff_steel', { y0: 3.6, ...deco });
  for (let k = 0; k < 8; k++) b.mesh(['cyl', 0.06, 0.06, 6.4, 6], 'ff_steel', 19, 3.75, -14, { r: [(k / 8) * Math.PI, 0, 0], cast: false });
  b.box(19, -14, 0.4, 0.4, 0.4, 'ff_neon', { y0: 3.55, ...deco });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2, z = -14 + Math.sin(a) * 3.2, y0 = 3.2 + Math.cos(a) * 3.2 - 0.8;
    b.prop('gondola', () => b.box(19, z, 0.9, 0.9, 0.9, k % 2 ? 'ff_red' : 'ff_blue', { y0: Math.max(0, y0) }));
  }
  one('ticket kiosk', 'ff_yellow', 22.5, -9.4, 1.2, 1.2, 2.2); bench(15.0, -9.0); bin(23.0, -20.0); lamp(16.0, -20.0); lamp(23.0, -12.0);

  // ----- stalls (east midway): back wall, side posts, counter with a gap each side, prizes. Rows face the midway at z 0.
  const stall = (name, x, z, face, mat, prizeMat) => b.prop(name, () => {
    const f = face; // +1 faces +z
    b.box(x, z - f * 0.9, 4.0, 0.2, 2.6, mat);                       // back wall
    b.box(x, z + f * 0.8, 1.6, 0.6, 1.0, 'ff_wood');                 // counter (leaves 1.2 m open each side)
    for (const dx of [-1.9, 1.9]) b.box(x + dx, z + f * 0.9, 0.12, 0.12, 2.6, 'ff_wood', { collide: false });
    b.box(x, z + f * 0.4, 4.2, 2.4, 0.15, mat, { y0: 2.6, collide: false }); // awning
    for (const dx of [-1.0, 1.0]) b.box(x + dx, z + f * 0.7, 0.4, 0.4, 0.8, mat, { y0: 1.0, collide: false }); // prizes (the prizeMat arg is unused: one fewer material per stall)
  });
  stall('ring toss', 15, -6, 1, 'ff_red', 'ff_plush'); stall('shooting gallery', 20, -6, 1, 'ff_blue', 'ff_plush2');
  stall('prize booth', 15, 8, -1, 'ff_yellow', 'ff_plush3'); stall('coconut shy', 20, 8, -1, 'ff_teal', 'ff_plush');
  for (const [x, z, m] of [[13.2, -2.5, 'ff_plush'], [24.0, -2.0, 'ff_plush2'], [13.2, 4.0, 'ff_plush3'], [24.0, 3.5, 'ff_plush']]) b.prop('giant plush bear', () => { b.box(x, z, 0.9, 0.8, 1.0, m); b.mesh(['ico', 0.35, 1], m, x, 1.35, z); });
  for (const x of [10.5, 17.5, 22.5]) b.box(x, 0.8, 0.3, 0.3, 3.0, 'ff_bulb', { collide: false, cast: false });
  b.prop('balloon stand', () => { b.box(23.0, 5.5, 0.5, 0.5, 1.6, 'ff_red'); b.mesh(['ico', 0.45, 1], 'ff_red', 23.0, 2.1, 5.5); });
  b.prop('speaker tower', () => b.box(9.0, -3.0, 0.7, 0.7, 2.4, 'ff_dark'));
  lamp(12.0, 4.5); lamp(12.0, -4.5); lamp(-6.0, 7.5); lamp(-6.0, -4.0); lamp(2.0, 8.5); lamp(8.5, 21.5); lamp(-8.5, 21.5);
  bin(10.2, 2.0); bin(-5.5, 3.0); bin(6.0, 8.5);

  // ----- hay-bale pen (south-west, x -24..-9, z 9..24): bales in short rows with gaps = a low maze
  const bale = (x, z, ry = 0) => b.prop('hay bale', () => b.box(x, z, 1.4, 0.9, 0.9, 'ff_hay', { ry, cast: false }));
  for (const [x, z] of [[-22.5, 10.0], [-20.5, 10.0], [-17.0, 11.0], [-15.0, 11.0], [-12.0, 12.5], [-22.5, 14.5], [-19.5, 15.5], [-16.5, 16.5], [-13.0, 16.0], [-22.0, 18.5], [-18.0, 20.0], [-14.5, 21.0], [-11.0, 19.5], [-20.0, 23.0]]) bale(x, z);
  for (const [x, z] of [[-21.0, 16.5], [-14.5, 13.5]]) b.prop('hay stack', () => { b.box(x, z, 1.4, 0.9, 0.9, 'ff_hay'); b.box(x, z, 1.3, 0.8, 0.8, 'ff_hay', { y0: 0.9 }); });
  b.prop('barn cutout', () => b.box(-9.5, 9.5, 3.0, 0.3, 2.4, 'ff_red')); b.prop('scarecrow', () => b.box(-23.5, 20.0, 0.4, 0.4, 1.9, 'ff_wood'));
  b.prop('wheelbarrow', () => b.box(-18.5, 12.6, 0.7, 1.2, 0.7, 'ff_steel')); one('barrel', 'ff_wood', -12.0, 23.0, 0.7, 0.7, 0.9); one('crate', 'ff_wood', -23.0, 14.0, 0.9, 0.9, 0.9);

  // ----- food court (south-east, x 8..24, z 9..24): picnic tables you can crouch under, carts
  for (const [x, z] of [[12.0, 13.0], [17.0, 13.0], [12.0, 18.0], [20.0, 20.0]]) b.prop('picnic table', () => {
    b.box(x, z, 2.2, 1.0, 0.06, 'ff_wood', { y0: 1.1 });
    for (const dx of [-0.9, 0.9]) for (const dz of [-0.4, 0.4]) b.box(x + dx, z + dz, 0.06, 0.06, 1.1, 'ff_wood', { collide: false });
    for (const s of [-1, 1]) b.box(x, z + s * 0.9, 2.2, 0.3, 0.42, 'ff_wood');
  });
  b.prop('popcorn machine', () => b.box(22.5, 13.0, 1.0, 1.0, 1.9, 'ff_red')); b.box(22.5, 13.0, 0.9, 0.9, 0.4, 'ff_bulb', { y0: 1.5, ...deco });
  b.prop('candy floss cart', () => { b.box(22.0, 16.8, 1.4, 0.9, 1.1, 'ff_plush'); b.mesh(['ico', 0.4, 1], 'ff_plush', 22.0, 1.5, 16.8, { cast: true }); });
  b.prop('hot dog cart', () => b.box(14.5, 22.5, 1.6, 0.9, 1.3, 'ff_yellow'));
  b.prop('tent', () => { b.box(10.0, 21.0, 3.0, 3.0, 0.1, 'ff_canvas', { y0: 2.4, collide: false }); for (const dx of [-1.4, 1.4]) for (const dz of [-1.4, 1.4]) b.box(10.0 + dx, 21.0 + dz, 0.12, 0.12, 2.4, 'ff_steel'); });
  bench(17.0, 22.5); bench(23.0, 20.5, false); bin(8.8, 14.0); bin(23.8, 10.5); bin(15.0, 16.0);
  b.prop('clown cutout', () => b.box(9.0, 11.0, 1.0, 0.1, 1.9, 'ff_red'));

  // ----- entrance plaza (x -8..8, z 9..25)
  b.prop('ticket booth', () => b.box(-5.0, 22.0, 1.4, 1.4, 2.2, 'ff_red')); b.box(-5.0, 21.3, 1.0, 0.06, 0.5, 'ff_bulb', { y0: 1.2, ...deco });
  b.prop('ticket booth', () => b.box(5.0, 22.0, 1.4, 1.4, 2.2, 'ff_blue')); b.box(5.0, 21.3, 1.0, 0.06, 0.5, 'ff_bulb', { y0: 1.2, ...deco });
  b.prop('fountain', () => { b.box(0, 14.0, 3.0, 3.0, 0.4, 'ff_stone'); b.box(0, 14.0, 1.0, 1.0, 1.4, 'ff_stone', { y0: 0.4 }); });
  bench(-3.5, 17.0); bench(3.5, 17.0); one('map signpost', 'ff_wood', 0.0, 10.4, 0.6, 0.15, 2.0); one('fire extinguisher', 'ff_red', -2.2, 24.4, 0.2, 0.2, 0.5);
  for (let k = 0; k < 8; k++) b.box(-7.0 + k * 2, 11.0, 0.12, 0.12, 0.12, 'ff_bulb', { y0: 3.0 + (k % 2) * 0.2, ...deco }); // string lights (visual)
}
