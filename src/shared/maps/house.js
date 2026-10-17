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
export const materials = {};
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
];
// open spots in the garden / yard that don't overlap the world's colliders
export const spawns = [[0, 12], [-6, 10], [-4, 16], [6, 9], [12, 6], [-12, 8], [16, 0], [-16, -4], [0, -14], [10, -18], [-8, -10], [18, 16], [-18, 16], [-20, -14]];

export function build(b, rnd) {
  const T = 0.2, H = 3;
  function wallH(z, x0, x1, gaps = []) { // runs along x
    let c = x0;
    const seg = (a, e) => { if (e - a > 0.01) b.box((a + e) / 2, z, e - a, T, H, 'wall'); };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box((g0 + g1) / 2, z, g1 - g0, T, 0.8, 'wall', { y0: 2.2, collide: false }); c = g1; }
    seg(c, x1);
  }
  function wallV(x, z0, z1, gaps = []) { // runs along z
    let c = z0;
    const seg = (a, e) => { if (e - a > 0.01) b.box(x, (a + e) / 2, T, e - a, H, 'wall'); };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box(x, (g0 + g1) / 2, T, g1 - g0, 0.8, 'wall', { y0: 2.2, collide: false }); c = g1; }
    seg(c, z1);
  }
  function pendant(x, z, intensity = 22, color = 0xffc58a) {
    b.light(x, 2.55, z, intensity, 11, color);
    b.mesh(['sphere', 0.12, 12, 8], 'glow', x, 2.6, z, { cast: false });
  }

  // ----- house shell
  wallH(-6, -8, 8); wallH(6, -8, 8, [[-1, 1]]); wallV(-8, -6, 6); wallV(8, -6, 6);
  wallH(0, -8, -2, [[-5.9, -4.5]]);
  wallV(-2, -6, 6, [[-4.3, -2.9], [2.0, 3.4]]);
  wallH(-1.5, -2, 8, [[0.1, 1.5], [5.6, 7.0]]);
  wallV(3, -6, -1.5, [[-4.3, -2.9]]);
  b.box(0, 0, 17, 13, 0.25, 'roof', { y0: 3, collide: false });
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

}
