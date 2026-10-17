// House + garden at dusk. Same builder API as the other maps (b.box / mesh / collider / light / books / prop). No THREE, no DOM.
// Prop ids are the order of b.prop calls, so never reorder them. `rnd` is the seeded RNG buildWorld hands every map.

export const meta = {
  id: 'house', trusted: true, name: 'House', blurb: 'A house. A garden. The last light of dusk.',
  fog: { color: 0x6b4f6e, density: 0.021 }, sky: 'dusk',
  ambient: { color: 0x8a78c0, ground: 0x3a2e44, intensity: 0.8 },
  seekerStart: { x: 0, z: 7.8, yaw: 0 },
  bounds: { x0: -23.5, x1: 23.5, z0: -23.5, z1: 23.5 },
  // Audio zones: the FIRST zone whose box contains the listener wins, so the last entry is the catch-all.
  // reverb: 'small' (furnished room) | 'hall' (big open interior) | 'outdoor'. box is {x0,x1,y0,y1,z0,z1} in world metres.
  zones: [
    { name: 'Bedroom', box: { x0: -8, x1: -2, y0: -1, y1: 4, z0: -6, z1: 0 }, reverb: 'small' },
    { name: 'Study', box: { x0: -2, x1: 3, y0: -1, y1: 4, z0: -6, z1: -1.5 }, reverb: 'small' },
    { name: 'Guest room', box: { x0: 3, x1: 8, y0: -1, y1: 4, z0: -6, z1: -1.5 }, reverb: 'small' },
    { name: 'Kitchen', box: { x0: -8, x1: -2, y0: -1, y1: 4, z0: 0, z1: 6 }, reverb: 'small' },
    { name: 'Living room', box: { x0: -2, x1: 8, y0: -1, y1: 4, z0: -1.5, z1: 6 }, reverb: 'small' },
    { name: 'Garden', box: { x0: -24, x1: 24, y0: -1, y1: 60, z0: -24, z1: 24 }, reverb: 'outdoor' },
  ],
  // Light probes: sampled bounce colour of each interior, for the renderer's ambient / IBL tint (x, y, z, colour, intensity, radius).
  lightProbes: [
    { x: -5, y: 1.5, z: -3, color: 0xffc58a, intensity: 0.5, radius: 6 }, { x: 0.5, y: 1.5, z: -3.5, color: 0xffc58a, intensity: 0.45, radius: 5 },
    { x: 5.5, y: 1.5, z: -3.5, color: 0xffb27a, intensity: 0.4, radius: 5 }, { x: -5, y: 1.5, z: 3, color: 0xffc58a, intensity: 0.5, radius: 6 },
    { x: 3, y: 1.5, z: 2.2, color: 0xffc58a, intensity: 0.55, radius: 7 }, { x: 0, y: 2, z: 12, color: 0x8a78c0, intensity: 0.8, radius: 40 },
  ],
};
// New materials for the remaster. sign_* / art_* / decal_* get their canvas textures in src/world/textures.js.
export const materials = {
  trim: { color: 0xece6da, roughness: 0.5 }, ceiling: { color: 0xe9e2d4, roughness: 0.95 },
  glassPane: { color: 0x9fc0e0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false },
  windowIn: { color: 0x101626, roughness: 1, emissive: 0x3a4c86, emissiveIntensity: 0.9 },
  curtain: { color: 0x8a4a55, roughness: 1 }, lampshade: { color: 0xf0d9b0, roughness: 0.9, emissive: 0xffc477, emissiveIntensity: 1.1 },
  doormat: { color: 0x3a2c22, roughness: 1 }, pot: { color: 0xa55a3a, roughness: 0.9 }, bloom: { color: 0xe85a6a, roughness: 0.9 },
  art_hills: { color: 0xffffff, roughness: 0.8 }, art_sea: { color: 0xffffff, roughness: 0.8 }, art_abstract: { color: 0xffffff, roughness: 0.8 },
  decal_leaves: { color: 0xffffff, roughness: 1 }, decal_stain: { color: 0xffffff, roughness: 1 }, decal_scuff: { color: 0xffffff, roughness: 1 },
};
// ----- hedge maze, north-east corner of the garden: a perfect maze (every cell reachable) from a fixed seed, entrance in the south wall, east end (the hedge row at x 15 closes the west end).
const MZ = { x0: 14.0, z0: 14.8, n: 4, cell: 2.2, wall: 0.35 };
function makeMaze() {
  let a = 424242; const rand = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const { n } = MZ, st = `${n - 1},0`, open = new Set(), seen = new Set([st]), depth = new Map([[st, 0]]), stack = [[n - 1, 0]];
  const key = (i, j, k, l) => (i < k || (i === k && j < l) ? `${i},${j}|${k},${l}` : `${k},${l}|${i},${j}`);
  let far = [n - 1, 0];
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dj]) => [i + di, j + dj]).filter(([x, z]) => x >= 0 && z >= 0 && x < n && z < n && !seen.has(`${x},${z}`));
    if (!nb.length) { stack.pop(); continue; }
    const [x, z] = nb[(rand() * nb.length) | 0];
    open.add(key(i, j, x, z)); seen.add(`${x},${z}`); depth.set(`${x},${z}`, depth.get(`${i},${j}`) + 1); stack.push([x, z]);
    if (depth.get(`${x},${z}`) > depth.get(`${far[0]},${far[1]}`)) far = [x, z];
  }
  return { open, far, key };
}
const MAZE = makeMaze();
const mazeCentre = (i, j) => [MZ.x0 + (i + 0.5) * MZ.cell, MZ.z0 + (j + 0.5) * MZ.cell];

export const mix = [['house', 3], ['garden', 2]];
export const spots = [
  { x: -7.45, z: -4.7, kind: 'house', name: 'beside bed' }, { x: -3.2, z: -5.55, kind: 'house', name: 'wardrobe' },
  { x: 0.3, z: -5.5, kind: 'house', name: 'under desk' }, { x: 2.0, z: -2.15, kind: 'house', name: 'behind armchair' },
  { x: 7.5, z: -4.7, kind: 'house', name: 'beside bed 2' }, { x: 3.55, z: -5.4, kind: 'house', name: 'crate pocket' },
  { x: -4.6, z: 3.0, kind: 'house', name: 'under table' }, { x: -7.45, z: 5.45, kind: 'house', name: 'fridge pocket' },
  { x: 4.0, z: -0.55, kind: 'house', name: 'behind sofa' },
  { x: 12.9, z: -12.7, kind: 'garden', name: 'shed' }, { x: -11, z: 15.1, kind: 'garden', name: 'hedge A' },
  { x: 16.1, z: 11, kind: 'garden', name: 'hedge B' }, { x: -12, z: -16.1, kind: 'garden', name: 'hedge C' },
  { x: -20.1, z: 0, kind: 'garden', name: 'hedge D' }, { x: -14.6, z: 8.7, kind: 'garden', name: 'tree 1' },
  { x: 18.7, z: -6.4, kind: 'garden', name: 'tree 2' }, { x: -4.1, z: -17.7, kind: 'garden', name: 'tree 3' },
  { x: 21.5, z: 5.6, kind: 'garden', name: 'rock' }, { x: -19.3, z: -9, kind: 'garden', name: 'crates' },
  { x: 8, z: 16.9, kind: 'garden', name: 'car' },
  { x: mazeCentre(...MAZE.far)[0], z: mazeCentre(...MAZE.far)[1], kind: 'garden', name: 'hedge maze' }, // appended: spot indices stay stable
];
// open spots in the garden / yard that don't overlap the world's colliders
export const spawns = [[0, 12], [-6, 10], [-4, 16], [6, 9], [12, 6], [-12, 8], [16, 0], [-16, -4], [0, -14], [10, -18], [-8, -10], [19.5, 9.5], [-18, 16], [-20, -14]];


export function build(b, rnd) {
  const T = 0.2, H = 3;
  const deco = { collide: false, cast: false };
  // skirting board + cornice on both faces of a wall run, and a door frame (jambs + head) at each gap: all non-colliding trim
  const trim = (cx, cz, len, alongX) => {
    for (const s of [-1, 1]) {
      const o = s * (T / 2 + 0.015);
      if (alongX) { b.box(cx, cz + o, len, 0.03, 0.12, 'trim', deco); b.box(cx, cz + o * 1.3, len, 0.04, 0.08, 'trim', { ...deco, y0: 2.92 }); }
      else { b.box(cx + o, cz, 0.03, len, 0.12, 'trim', deco); b.box(cx + o * 1.3, cz, 0.04, len, 0.08, 'trim', { ...deco, y0: 2.92 }); }
    }
  };
  const frame = (c, g0, g1, alongX) => { // c: wall line, [g0,g1]: the opening
    const m = (g0 + g1) / 2, w = g1 - g0;
    if (alongX) { for (const x of [g0 + 0.03, g1 - 0.03]) b.box(x, c, 0.06, T + 0.08, 2.2, 'trim', deco); b.box(m, c, w, T + 0.08, 0.06, 'trim', { ...deco, y0: 2.14 }); }
    else { for (const z of [g0 + 0.03, g1 - 0.03]) b.box(c, z, T + 0.08, 0.06, 2.2, 'trim', deco); b.box(c, m, T + 0.08, w, 0.06, 'trim', { ...deco, y0: 2.14 }); }
  };
  function wallH(z, x0, x1, gaps = []) { // runs along x
    let c = x0;
    const seg = (a, e) => { if (e - a > 0.01) { b.box((a + e) / 2, z, e - a, T, H, 'wall'); trim((a + e) / 2, z, e - a, true); } };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box((g0 + g1) / 2, z, g1 - g0, T, 0.8, 'wall', { y0: 2.2, collide: false }); frame(z, g0, g1, true); c = g1; }
    seg(c, x1);
  }
  function wallV(x, z0, z1, gaps = []) { // runs along z
    let c = z0;
    const seg = (a, e) => { if (e - a > 0.01) { b.box(x, (a + e) / 2, T, e - a, H, 'wall'); trim(x, (a + e) / 2, e - a, false); } };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box(x, (g0 + g1) / 2, T, g1 - g0, 0.8, 'wall', { y0: 2.2, collide: false }); frame(x, g0, g1, false); c = g1; }
    seg(c, z1);
  }
  function pendant(x, z, intensity = 22, color = 0xffc58a) {
    b.light(x, 2.55, z, intensity, 11, color);
    b.mesh(['sphere', 0.12, 12, 8], 'glow', x, 2.6, z, { cast: false });
    b.box(x, z, 0.02, 0.02, 0.4, 'dark', { y0: 2.62, ...deco }); b.mesh(['cyl', 0.1, 0.32, 0.26, 14], 'lampshade', x, 2.45, z, { cast: false });
  }

  // ----- house shell
  wallH(-6, -8, 8); wallH(6, -8, 8, [[-1, 1]]); wallV(-8, -6, 6); wallV(8, -6, 6);
  wallH(0, -8, -2, [[-5.9, -4.5]]);
  wallV(-2, -6, 6, [[-4.3, -2.9], [2.0, 3.4]]);
  wallH(-1.5, -2, 8, [[0.1, 1.5], [5.6, 7.0]]);
  wallV(3, -6, -1.5, [[-4.3, -2.9]]);
  b.box(0, 0, 17, 13, 0.25, 'roof', { y0: 3, collide: false });
  b.box(0, 0, 15.9, 11.9, 0.03, 'ceiling', { y0: 2.97, ...deco }); b.box(0, 0, 15.9, 11.9, 0.02, 'floor', deco); // plaster ceiling, plank floor
  b.box(0, 6.35, 17.4, 0.25, 0.5, 'roof', { y0: 3.2, collide: false }); // front fascia
  for (const x of [-5, -3, 3, 5]) b.mesh(['plane', 1.1, 1.0], 'glow', x, 1.6, 6.12, { cast: false }); // glowing windows
  for (const x of [-5, 0, 5]) b.mesh(['plane', 1.1, 1.0], 'glow', x, 1.6, -6.12, { cast: false, r: [0, Math.PI, 0] });
  b.box(0, 6.7, 3.2, 1.2, 0.12, 'stone', { collide: false }); // porch
  b.light(0, 2.5, 6.8, 30, 14, 0xffb066);
  b.mesh(['sphere', 0.14, 12, 8], 'glow', 0, 2.5, 6.4, { cast: false });
  pendant(-5, -3); pendant(0.5, -3.8, 16); pendant(-5, 3); pendant(3, 2.2, 26); pendant(5.5, -3.8, 18);

  // ----- furniture helpers (each is one prop)
  const bed = (cx, cz, blanket) => b.prop('bed', () => {
    b.box(cx, cz, 1.6, 2.1, 0.5, 'wood');
    b.box(cx, cz, 1.52, 2.0, 0.18, 'white', { y0: 0.5, collide: false });
    b.box(cx, cz + 0.35, 1.56, 1.4, 0.1, blanket, { y0: 0.66, collide: false });
    b.box(cx, cz - 0.82, 0.9, 0.35, 0.14, 'white', { y0: 0.68, collide: false });
    b.box(cx, cz - 1.05, 1.64, 0.1, 1.05, 'wood');
  });
  const sofa = (cx, cz, w, backNorth, material) => b.prop('sofa', () => {
    const s = backNorth ? -1 : 1;
    b.box(cx, cz, w, 1.0, 0.45, material);
    b.box(cx, cz + s * 0.38, w, 0.25, 0.9, material);
    b.box(cx - w / 2 + 0.1, cz, 0.2, 1.0, 0.65, material);
    b.box(cx + w / 2 - 0.1, cz, 0.2, 1.0, 0.65, material);
  });
  const table = (cx, cz, w, d, topY = 0.75) => b.prop('table', () => {
    b.box(cx, cz, w, d, 0.07, 'wood', { y0: topY });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(cx + dx * (w / 2 - 0.07), cz + dz * (d / 2 - 0.07), 0.07, 0.07, topY, 'wood', { collide: false });
  });
  const chair = (cx, cz) => b.prop('chair', () => { b.box(cx, cz, 0.45, 0.45, 0.45, 'wood'); b.box(cx, cz - 0.2, 0.45, 0.06, 0.45, 'wood', { y0: 0.45, collide: false }); });
  const crate = (cx, cz, s, y0 = 0) => b.prop('crate', () => b.box(cx, cz, s, s, s, 'wood', { y0 }));
  const bookshelf = (cx, cz, len) => b.prop('bookshelf', () => { b.box(cx, cz, 0.36, len, 2.0, 'wood'); b.books(cx, cz, len); });
  const plant = (cx, cz) => b.prop('plant', () => {
    b.box(cx, cz, 0.45, 0.45, 0.45, 'stone');
    for (let i = 0; i < 4; i++) b.mesh(['ico', 0.28, 1], 'leaf', cx + rnd(-0.1, 0.1), 0.75 + i * 0.25, cz + rnd(-0.1, 0.1));
  });
  const cabinet = (name, cx, cz, w, d, h, mat) => b.prop(name, () => b.box(cx, cz, w, d, h, mat));

  // ----- interior
  // bedroom 1
  bed(-6.2, -4.85, 'fabricBlue');
  b.prop('nightstand', () => { b.box(-4.9, -5.6, 0.5, 0.5, 0.5, 'wood'); b.box(-4.9, -5.6, 0.2, 0.2, 0.12, 'glow', { y0: 0.5, collide: false, cast: false }); });
  cabinet('dresser', -7.6, -1.0, 0.5, 1.4, 0.95, 'wood');
  b.box(-4.6, -2.2, 2.0, 1.4, 0.02, 'rug', { y0: 0.02, collide: false, cast: false });
  // open wardrobe (hide inside), faces +z
  b.box(-3.85, -5.55, 0.05, 0.7, 2.1, 'wood'); b.box(-2.55, -5.55, 0.05, 0.7, 2.1, 'wood');
  b.box(-3.2, -5.875, 1.3, 0.05, 2.1, 'wood'); b.box(-3.2, -5.55, 1.4, 0.7, 0.05, 'wood', { y0: 2.1 });
  b.box(-3.2, -5.45, 1.2, 0.03, 0.03, 'metal', { y0: 1.7, collide: false });
  for (let i = 0; i < 5; i++) b.box(-3.55 + i * 0.18, -5.45, 0.08, 0.04, 0.7, ['fabricRed', 'fabricGreen', 'fabricBlue'][i % 3], { y0: 0.95, collide: false });
  // study
  b.prop('desk', () => {
    b.box(0.3, -5.5, 1.6, 0.7, 0.07, 'wood', { y0: 1.1 }); // top at 1.1: crouch-under clearance (the 'under desk' spot)
    b.box(-0.5, -5.5, 0.05, 0.7, 1.1, 'wood'); b.box(1.1, -5.5, 0.05, 0.7, 1.1, 'wood');
    b.box(0.3, -5.8, 1.5, 0.04, 1.1, 'wood');
    b.box(0.9, -5.5, 0.35, 0.02, 0.25, 'tv', { y0: 1.17, collide: false, cast: false });
  });
  chair(0.3, -3.9);
  bookshelf(-1.7, -5.0, 1.4);
  b.prop('armchair', () => { b.box(2.0, -3.2, 1.0, 1.0, 0.45, 'fabricGreen'); b.box(2.0, -3.52, 1.0, 0.25, 0.9, 'fabricGreen'); });
  b.box(0.5, -3.0, 1.6, 1.0, 0.02, 'rug', { y0: 0.02, collide: false, cast: false });
  // bedroom 2
  bed(6.3, -4.85, 'fabricRed');
  crate(4.6, -5.2, 1.0); crate(5.2, -5.4, 0.8); crate(4.6, -5.2, 0.7, 1.0); // pushed east so the 'crate pocket' by the wall is walkable
  cabinet('side table', 7.65, -2.4, 0.5, 1.0, 0.9, 'wood');
  plant(3.5, -2.1);
  // kitchen
  b.box(-7.55, 2.5, 0.7, 3.4, 0.9, 'counter');
  b.box(-7.55, 2.5, 0.72, 3.42, 0.04, 'dark', { y0: 0.9, collide: false });
  cabinet('fridge', -6.6, 5.45, 0.8, 0.8, 1.9, 'metal');
  table(-4.6, 3.0, 1.6, 0.9, 1.1); // tall enough to crouch under
  chair(-4.6, 1.8); chair(-4.6, 4.2); chair(-5.95, 3.0); chair(-3.25, 3.0);
  b.box(-4.6, 3.0, 2.4, 1.8, 0.02, 'rug', { y0: 0.02, collide: false, cast: false });
  // living room
  sofa(4.0, 0.8, 2.4, true, 'fabricBlue');
  table(4.0, 2.4, 1.2, 0.6, 0.4);
  b.box(4.0, 1.6, 2.6, 2.2, 0.02, 'rug', { y0: 0.02, collide: false, cast: false });
  b.prop('tv console', () => { b.box(7.55, 2.6, 0.5, 2.0, 0.5, 'wood'); b.box(7.7, 2.6, 0.06, 1.3, 0.75, 'tv', { y0: 0.55, collide: false, cast: false }); });
  bookshelf(-1.7, 4.6, 1.8);
  plant(7.4, 5.4); plant(-1.5, 1.2);
  cabinet('sideboard', 2.7, 5.55, 1.4, 0.5, 1.0, 'wood');

  // ----- garden
  const fenceLen = 48.4;
  for (const [x, z, w, d] of [[0, -24, fenceLen, 0.15], [0, 24, fenceLen, 0.15], [-24, 0, 0.15, fenceLen], [24, 0, 0.15, fenceLen]]) b.box(x, z, w, d, 1.8, 'wood');
  for (let z = 7.4; z < 23; z += 1.1) b.box(0, z, 1.3, 0.8, 0.04, 'stone', { collide: false }); // stepping path
  const hedge = (cx, cz, w, d) => { b.box(cx, cz, w, d, 1.6, 'hedge'); b.box(cx, cz, w - 0.3, d - 0.1, 0.3, 'hedge', { y0: 1.5, collide: false }); };
  hedge(-11, 14, 6, 1); hedge(15, 11, 1, 6); hedge(-12, -15, 7, 1); hedge(-19, 0, 1, 6);
  const tree = (x, z, s = 1) => {
    b.box(x, z, 0.55, 0.55, 3.4 * s, 'bark');
    for (const [dx, dy, dz, r] of [[0, 4.3, 0, 1.9], [0.8, 3.6, 0.4, 1.3], [-0.7, 3.8, -0.5, 1.4]]) b.mesh(['ico', r * s, 1], 'leaf', x + dx * s, dy * s, z + dz * s);
  };
  [[-14, 8], [18, -6], [-4, -17], [10, 19], [-18, 19], [20, -18], [-20, -18], [0, -20], [22, 12], [-22, 10]].forEach(([x, z]) => tree(x, z, rnd(0.9, 1.25)));
  b.prop('rock', () => {
    b.mesh(['ico', 1, 0], 'stone', 20, 0.6, 5, { s: [1.0, 0.75, 0.9] });
    b.collider({ x0: 19.2, x1: 20.8, z0: 4.3, z1: 5.7, y0: 0, y1: 1.2 });
  });
  crate(-18, -9, 1.1); crate(-16.9, -9.3, 0.9); crate(-18, -9, 0.8, 1.1);
  // car
  b.box(8, 14.2, 1.8, 4.2, 0.65, 'car', { y0: 0.3 });
  b.box(8, 14.0, 1.6, 2.2, 0.55, 'glass', { y0: 0.95 });
  b.box(8, 14.0, 1.5, 2.0, 0.04, 'car', { y0: 1.5, collide: false });
  for (const [dx, dz] of [[-1, -1.4], [1, -1.4], [-1, 1.4], [1, 1.4]]) b.mesh(['cyl', 0.35, 0.35, 0.25, 14], 'dark', 8 + dx * 0.9, 0.35, 14.2 + dz, { r: [0, 0, Math.PI / 2] });
  b.mesh(['sphere', 0.12, 8, 6], 'glow', 7.4, 0.8, 12.08, { cast: false }); b.mesh(['sphere', 0.12, 8, 6], 'glow', 8.6, 0.8, 12.08, { cast: false });
  // shed (open door facing +z), interior x 12.4..15.6, z -13.4..-10.6
  const sx = 14, sz = -12;
  b.box(sx, sz - 1.4, 3.3, 0.15, 2.5, 'wood'); b.box(sx - 1.6, sz, 0.15, 2.9, 2.5, 'wood'); b.box(sx + 1.6, sz, 0.15, 2.9, 2.5, 'wood');
  b.box(sx - 1.0, sz + 1.4, 1.3, 0.15, 2.5, 'wood'); b.box(sx + 1.1, sz + 1.4, 1.1, 0.15, 2.5, 'wood');
  b.box(sx, sz, 3.9, 3.5, 0.2, 'roof', { y0: 2.5, collide: false });
  crate(13.7, -12.3, 0.7);
  // lamp post
  b.prop('lamp post', () => { b.box(3.5, 12, 0.12, 0.12, 2.6, 'dark'); b.mesh(['sphere', 0.2, 12, 8], 'glow', 3.5, 2.7, 12, { cast: false }); });
  b.light(3.5, 2.7, 12, 40, 16, 0xffc27a);


  // ===== remaster detail. Everything above this line keeps its b.prop order; the detail below adds no props until the appended ones.
  const mini = (() => { let a = 99; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(); // own RNG: never touches `rnd`
  // windows: frame bars with a mullion cross on both wall faces, translucent glass, sill outside, dusk sky plane inside, curtains inside
  const windowAt = (x, wz, sign) => { // wz: wall line (z), sign: +1 = wall faces +z outside (south wall), -1 = north wall
    for (const side of [1, -1]) { // side +1 = outside face, -1 = inside face
      const z = wz + sign * side * (T / 2 + 0.025);
      for (const dy of [-0.5, 0.5]) b.box(x, z, 1.2, 0.05, 0.06, 'trim', { ...deco, y0: 1.6 + dy - 0.03 });
      for (const dx of [-0.58, 0.58]) b.box(x + dx, z, 0.06, 0.05, 1.0, 'trim', { ...deco, y0: 1.1 });
      b.box(x, z, 0.03, 0.04, 1.0, 'trim', { ...deco, y0: 1.1 }); b.box(x, z, 1.1, 0.04, 0.03, 'trim', { ...deco, y0: 1.585 });
      b.mesh(['plane', 1.1, 1.0], 'glassPane', x, 1.6, wz + sign * side * (T / 2 + 0.005), { cast: false, r: [0, side * sign > 0 ? 0 : Math.PI, 0] });
    }
    b.box(x, wz + sign * (T / 2 + 0.07), 1.35, 0.16, 0.04, 'trim', { ...deco, y0: 1.06 }); // outside sill
    b.mesh(['plane', 1.1, 1.0], 'windowIn', x, 1.6, wz - sign * (T / 2 + 0.003), { cast: false, r: [0, sign > 0 ? Math.PI : 0, 0] });
    for (const dx of [-0.82, 0.82]) b.box(x + dx, wz - sign * (T / 2 + 0.07), 0.3, 0.1, 1.55, 'curtain', { ...deco, y0: 0.9 });
    b.box(x, wz - sign * (T / 2 + 0.07), 1.9, 0.03, 0.03, 'dark', { ...deco, y0: 2.5 });
  };
  for (const x of [-5, -3, 3, 5]) windowAt(x, 6, 1);
  for (const x of [-5, 0, 5]) windowAt(x, -6, -1);
  // pictures: (x, z) on the wall face, `face` = the way the picture looks
  const picture = (x, z, face, art, w = 0.8, h = 0.6, y = 1.7) => {
    const ry = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 }[face], f = face.endsWith('z'), s = face[0] === '+' ? 1 : -1;
    b.box(x, z, f ? w + 0.1 : 0.04, f ? 0.04 : w + 0.1, h + 0.1, 'wood', { ...deco, y0: y - h / 2 - 0.05 });
    b.mesh(['plane', w, h], art, f ? x : x + s * 0.025, y, f ? z + s * 0.025 : z, { cast: false, r: [0, ry, 0] });
  };
  picture(-7.88, -3.4, '+x', 'art_hills'); picture(-6.2, -5.88, '+z', 'art_sea', 0.9, 0.6, 1.9); picture(6.3, -5.88, '+z', 'art_abstract', 0.9, 0.6, 1.9);
  picture(2.7, 5.88, '-z', 'art_hills', 0.9, 0.55, 1.75); picture(5.8, 5.88, '-z', 'art_sea'); picture(-1.88, -0.6, '+x', 'art_abstract', 0.5, 0.7, 1.6);
  picture(7.88, 0.6, '-x', 'art_hills', 1.0, 0.6, 1.8); picture(0.4, -5.88, '+z', 'art_abstract', 0.6, 0.8, 1.9);
  // kitchen: wall cabinets over the counter, clock, a hob and a sink on the counter
  b.box(-7.74, 2.5, 0.34, 3.2, 0.7, 'wood', { ...deco, y0: 1.5 });
  for (const z of [1.45, 2.5, 3.55]) b.box(-7.56, z, 0.02, 0.9, 0.55, 'trim', { ...deco, y0: 1.58 });
  b.mesh(['cyl', 0.2, 0.2, 0.04, 20], 'white', -3.2, 2.0, 0.14, { cast: false, r: [Math.PI / 2, 0, 0] });
  for (const [dx, dz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) b.mesh(['cyl', 0.07, 0.07, 0.015, 12], 'dark', -7.55 + dx, 0.935, 1.6 + dz, { cast: false });
  b.box(-7.55, 3.4, 0.5, 0.6, 0.02, 'metal', { ...deco, y0: 0.9 });
  // living room / study: books and objects on shelves and surfaces, TV glare
  for (let i = 0; i < 9; i++) b.box(2.2 + i * 0.14, 5.55, 0.08, 0.14, 0.12 + mini() * 0.1, ['fabricRed', 'fabricBlue', 'fabricGreen', 'white'][i % 4], { ...deco, y0: 1.0 });
  b.mesh(['cyl', 0.07, 0.05, 0.14, 10], 'white', 4.0, 0.47, 2.4, { cast: false }); b.mesh(['cyl', 0.05, 0.05, 0.1, 10], 'pot', -4.3, 0.8, 2.8, { cast: false });
  // front door: mat, trim post and the porch lamp bracket; wall lights either side
  b.box(0, 6.6, 1.0, 0.5, 0.015, 'doormat', { y0: 0.12, ...deco });
  for (const x of [-1.5, 1.5]) { b.box(x, 6.18, 0.08, 0.08, 0.14, 'dark', { y0: 2.1, ...deco }); b.mesh(['sphere', 0.09, 10, 8], 'glow', x, 2.28, 6.2, { cast: false }); }
  // floor decals: grime by the kitchen counter, scuffs at the front door and in the hall, leaf litter under the garden trees
  b.mesh(['plane', 2.2, 2.2], 'decal_stain', -6.6, 0.026, 4.3, { cast: false, r: [-Math.PI / 2, 0, 0.4] });
  b.mesh(['plane', 2.4, 2.4], 'decal_scuff', 0, 0.026, 5.0, { cast: false, r: [-Math.PI / 2, 0, 0.2] });
  b.mesh(['plane', 2.4, 2.4], 'decal_scuff', 5.5, 0.026, 3.8, { cast: false, r: [-Math.PI / 2, 0, 1.9] });
  for (const [x, z] of [[-14, 8], [18, -6], [-4, -17], [10, 19], [-18, 19], [20, -18], [0, -20]]) b.mesh(['plane', 4.2, 4.2], 'decal_leaves', x, 0.015, z, { cast: false, r: [-Math.PI / 2, 0, x] });
  b.mesh(['plane', 3, 3], 'decal_leaves', 0, 0.135, 6.7, { cast: false, r: [-Math.PI / 2, 0, 1] });
  // hedge maze (north-east corner): cell walls from the generated maze, outer ring closed except the south entrance in the last column
  const mz = (i, j) => [MZ.x0 + i * MZ.cell, MZ.z0 + j * MZ.cell];
  const mazeWall = (cx, cz, w, d) => { b.box(cx, cz, w, d, 1.9, 'hedge'); b.box(cx, cz, w - 0.15, d - 0.15, 0.3, 'hedge', { y0: 1.8, collide: false }); };
  for (let i = 0; i < MZ.n; i++) for (let j = 0; j <= MZ.n; j++) { // walls along x at z = z0 + j*cell, above cell (i, j)
    const edge = j === 0 || j === MZ.n || !MAZE.open.has(MAZE.key(i, j - 1, i, j));
    if (j === 0 && i === MZ.n - 1) continue; // entrance
    if (edge) { const [x, z] = mz(i + 0.5, j); mazeWall(x, z, MZ.cell + MZ.wall, MZ.wall); }
  }
  for (let i = 0; i <= MZ.n; i++) for (let j = 0; j < MZ.n; j++) { // walls along z at x = x0 + i*cell
    const edge = i === 0 || i === MZ.n || !MAZE.open.has(MAZE.key(i - 1, j, i, j));
    if (edge) { const [x, z] = mz(i, j + 0.5); mazeWall(x, z, MZ.wall, MZ.cell + MZ.wall); }
  }
  { const [cx, cz] = mazeCentre(...MAZE.far); b.mesh(['sphere', 0.12, 10, 8], 'glow', cx, 0.3, cz, { cast: false }); b.box(cx, cz, 0.5, 0.5, 0.1, 'stone', { collide: false }); }

  // ----- appended props (ids 32+): disguise options that did not exist before; never insert above this line
  b.prop('coat stand', () => { b.box(-1.3, 5.65, 0.34, 0.34, 0.05, 'dark'); b.box(-1.3, 5.65, 0.05, 0.05, 1.7, 'wood'); b.mesh(['sphere', 0.12, 8, 6], 'fabricRed', -1.3, 1.6, 5.65, { s: [1, 0.7, 1] }); });
  b.prop('umbrella stand', () => { b.mesh(['cyl', 0.14, 0.12, 0.5, 12], 'metal', 1.3, 0.25, 5.65); b.box(1.3, 5.65, 0.03, 0.03, 0.9, 'dark', { y0: 0.4, collide: false }); b.collider({ x0: 1.14, x1: 1.46, z0: 5.49, z1: 5.81, y0: 0, y1: 0.5 }); });
  b.prop('floor lamp', () => { b.box(6.4, 5.5, 0.3, 0.3, 0.04, 'dark'); b.box(6.4, 5.5, 0.04, 0.04, 1.5, 'dark', { y0: 0.04 }); b.mesh(['cyl', 0.14, 0.24, 0.3, 14], 'lampshade', 6.4, 1.65, 5.5, { cast: false }); });
  b.prop('laundry basket', () => { b.mesh(['cyl', 0.24, 0.2, 0.5, 14], 'wood', -3.2, 0.25, -0.6); b.collider({ x0: -3.44, x1: -2.96, z0: -0.84, z1: -0.36, y0: 0, y1: 0.5 }); });
  b.prop('garden bench', () => { b.box(3.0, 9.0, 1.4, 0.45, 0.06, 'wood', { y0: 0.42 }); b.box(3.0, 8.82, 1.4, 0.05, 0.4, 'wood', { y0: 0.48 }); for (const dx of [-0.6, 0.6]) b.box(3.0 + dx, 9.0, 0.06, 0.4, 0.42, 'dark'); });
  b.prop('bird bath', () => { b.mesh(['cyl', 0.1, 0.16, 0.7, 10], 'stone', -3.5, 0.35, 13.5); b.mesh(['cyl', 0.42, 0.18, 0.12, 14], 'stone', -3.5, 0.76, 13.5); b.collider({ x0: -3.92, x1: -3.08, z0: 13.08, z1: 13.92, y0: 0, y1: 0.82 }); });
  b.prop('wheelbarrow', () => { b.box(10.5, -9.6, 0.7, 0.9, 0.3, 'metal', { y0: 0.35 }); b.box(10.5, -9.0, 0.06, 0.06, 0.3, 'dark', { y0: 0.2 }); b.mesh(['cyl', 0.2, 0.2, 0.06, 12], 'dark', 10.5, 0.2, -10.1, { r: [0, 0, Math.PI / 2] }); });
  b.prop('barrel', () => b.mesh(['cyl', 0.34, 0.3, 0.9, 14], 'wood', 16.5, 0.45, -9.2)); // collider below
  b.collider({ x0: 16.16, x1: 16.84, z0: -9.54, z1: -8.86, y0: 0, y1: 0.9 });
  b.prop('flower pot', () => { b.mesh(['cyl', 0.2, 0.15, 0.36, 12], 'pot', -1.3, 0.3, 6.9); b.mesh(['ico', 0.2, 1], 'leaf', -1.3, 0.55, 6.9); b.mesh(['sphere', 0.07, 6, 5], 'bloom', -1.25, 0.72, 6.9); b.collider({ x0: -1.5, x1: -1.1, z0: 6.7, z1: 7.1, y0: 0, y1: 0.6 }); });
  b.prop('garden gnome', () => { b.mesh(['cyl', 0.1, 0.13, 0.3, 8], 'fabricBlue', -7.5, 0.27, 7.5); b.mesh(['sphere', 0.09, 8, 6], 'white', -7.5, 0.5, 7.5); b.mesh(['cyl', 0.0, 0.1, 0.22, 8], 'fabricRed', -7.5, 0.66, 7.5); b.collider({ x0: -7.65, x1: -7.35, z0: 7.35, z1: 7.65, y0: 0, y1: 0.77 }); });
  b.prop('wheelie bin', () => { b.box(9.2, -2.0, 0.55, 0.65, 1.0, 'leaf'); b.box(9.2, -2.0, 0.6, 0.7, 0.05, 'dark', { y0: 1.0, collide: false }); });
}
