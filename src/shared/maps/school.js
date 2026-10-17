// "After Hours": a school at night. ~40x34 m. Hallway down the middle (lockers you can stand in), classrooms + library + stairwell to the north,
// gym, cafeteria, science room and toilets to the south. Same builder API as lateshop.js: b.box / mesh / collider / light / prop. No THREE, no DOM.
// Material names are prefixed `sc_` (the client's material table is global). Gameplay constants: player radius 0.3, crouch height 1.0
// (desk and table tops sit at 1.1 so you can crouch under them), standing 1.7, jump apex ~0.9.
// The stairwell has the one upper floor: two flights of 0.25 m risers (autostep 0.3) up to a deck at y = 3.0. All AI spots and spawns are on the ground floor.

export const meta = {
  id: 'school', name: 'After Hours', size: 40, blurb: 'A school after the last bell. Crouch under desks, stand in lockers, mind the stairs.',
  players: { min: 3, max: 6, recommended: '3-6' }, thumbnail: '/thumbs/school.webp',
  fog: { color: 0x0d1218, near: 12, far: 60 }, sky: 'night',
  ambient: { color: 0xaab8d8, ground: 0x586078, intensity: 1.4 },
  seekerStart: { x: -6, z: 0, yaw: 0 }, // hallway centre (server spreads seekers along x by 1.4)
  bounds: { x0: -20, x1: 20, z0: -17, z1: 17 },
  floors: [{ name: 'upper', y: 3.0, box: { x0: 8, x1: 13, z0: -17, z1: -7.4 } }], // the single upper floor (stairwell deck)
  zones: [ // rooms for culling + audio. box = {x0,x1,z0,z1}; reverb = 'dead' | 'small' | 'medium' | 'large' | 'hall'
    { name: 'hallway', box: { x0: -20, x1: 20, z0: -2, z1: 2 }, reverb: 'hall' },
    { name: 'classroom A', box: { x0: -20, x1: -12, z0: -17, z1: -2 }, reverb: 'small' },
    { name: 'classroom B', box: { x0: -12, x1: -4, z0: -17, z1: -2 }, reverb: 'small' },
    { name: 'library', box: { x0: -4, x1: 8, z0: -17, z1: -2 }, reverb: 'medium' },
    { name: 'stairwell', box: { x0: 8, x1: 13, z0: -17, z1: -2 }, reverb: 'large' },
    { name: 'admin', box: { x0: 13, x1: 20, z0: -17, z1: -2 }, reverb: 'small' },
    { name: 'gym', box: { x0: -20, x1: -4, z0: 2, z1: 17 }, reverb: 'large' },
    { name: 'cafeteria', box: { x0: -4, x1: 10, z0: 2, z1: 17 }, reverb: 'large' },
    { name: 'science room', box: { x0: 10, x1: 20, z0: 2, z1: 9.5 }, reverb: 'small' },
    { name: 'toilets', box: { x0: 10, x1: 20, z0: 9.5, z1: 17 }, reverb: 'dead' },
  ],
};

export const materials = {
  sc_floor: { color: 0x7d7a70, roughness: 0.5 },
  sc_wall: { color: 0xb8b2a0, roughness: 0.95 },
  sc_ceiling: { color: 0x2b2d33, roughness: 0.9 },
  sc_gymFloor: { color: 0xb2814a, roughness: 0.45 },
  sc_cafeFloor: { color: 0x8c8f8a, roughness: 0.4 },
  sc_libCarpet: { color: 0x4a3b5c, roughness: 1 },
  sc_locker: { color: 0x3f6f8f, roughness: 0.45, metalness: 0.3 },
  sc_lockerOpen: { color: 0x1c2a36, roughness: 0.7 },
  sc_desk: { color: 0xb98a55, roughness: 0.7 },
  sc_chair: { color: 0xd9822b, roughness: 0.7 },
  sc_board: { color: 0x2c4a3a, roughness: 0.8 },
  sc_white: { color: 0xe6e4dc, roughness: 0.6 },
  sc_metal: { color: 0xa0a6b0, roughness: 0.35, metalness: 0.6 },
  sc_dark: { color: 0x25272d, roughness: 0.6 },
  sc_mat: { color: 0x2d5f9a, roughness: 0.8 },
  sc_matRed: { color: 0xa83a32, roughness: 0.8 },
  sc_bleacher: { color: 0xc49a5a, roughness: 0.7 },
  sc_shelf: { color: 0x6b4a2e, roughness: 0.8 },
  sc_books: { color: 0x8a3b3f, roughness: 0.9 },
  sc_concrete: { color: 0x8a8a86, roughness: 0.9 },
  sc_rail: { color: 0x2f6fa0, roughness: 0.4, metalness: 0.4 },
  sc_leaf: { color: 0x2f6b3a, roughness: 0.9, flatShading: true },
  sc_pot: { color: 0xa5632e, roughness: 0.9 },
  sc_cardboard: { color: 0xa88458, roughness: 0.9 },
  sc_fabric: { color: 0x7a3b4a, roughness: 1 },
  sc_tile: { color: 0xc6d2d4, roughness: 0.3 },
  sc_stall: { color: 0x4a8a86, roughness: 0.5 },
  sc_ball: { color: 0xd2692e, roughness: 0.7 },
  sc_tube: { color: 0x2a2e2a, roughness: 0.5, emissive: 0xe4f0ea, emissiveIntensity: 2.8 },
  sc_window: { color: 0x101820, roughness: 0.5, emissive: 0x6a8ab8, emissiveIntensity: 0.9 },
  sc_exit: { color: 0x200000, roughness: 0.5, emissive: 0xff2a1a, emissiveIntensity: 2.2 },
  sc_vend: { color: 0x9a3b2d, roughness: 0.4, emissive: 0xff6a3a, emissiveIntensity: 0.8 },
  sc_line: { color: 0xe8e4dc, roughness: 0.5 },
};

// locker banks (x0, x1) along the north (z -1.65) and south (z +1.65) hallway walls; every third unit (i % 3 === 1) is an open alcove you can stand in
const BANKS_N = [[-19.8, -17.3], [-15.1, -9.3], [-7.1, -1.1], [1.5, 4.3], [13.3, 15.3], [17.5, 19.8]];
const BANKS_S = [[-19.8, -14.4], [-11.6, -8.4], [-5.6, -0.4], [2.6, 5.4], [7.9, 14.1], [16.5, 19.8]];
const alcoves = (banks, z) => banks.flatMap(([a, e]) => { const n = Math.max(1, Math.round((e - a) / 0.9)), w = (e - a) / n; return Array.from({ length: n }, (_, i) => i).filter((i) => i % 3 === 1).map((i) => [a + (i + 0.5) * w, z]); });
const ALC_N = alcoves(BANKS_N, -1.65), ALC_S = alcoves(BANKS_S, 1.65);

export const mix = [['classroom', 1], ['hallway', 1], ['gym', 1], ['cafeteria', 1], ['library', 1]];
export const spots = [
  // classrooms
  { x: -16, z: -14.6, kind: 'classroom', crouch: true }, { x: -8, z: -14.6, kind: 'classroom', crouch: true }, { x: 16, z: 4.4, kind: 'classroom', crouch: false },
  { x: -17.6, z: -11.5, kind: 'classroom', crouch: true }, { x: -14.4, z: -8.5, kind: 'classroom', crouch: true }, { x: -9.6, z: -11.5, kind: 'classroom', crouch: true }, { x: -6.4, z: -5.5, kind: 'classroom', crouch: true },
  { x: -18.8, z: -5.2, kind: 'classroom', crouch: false }, { x: -13.6, z: -16.0, kind: 'classroom', crouch: false }, { x: -6.2, z: -16.0, kind: 'classroom', crouch: false },
  { x: 15.0, z: 6.5, kind: 'classroom', crouch: true }, { x: 18.5, z: 5.0, kind: 'classroom', crouch: false },
  // hallway lockers (open alcoves you stand in)
  ...[...ALC_N, ...ALC_S].map(([x, z]) => ({ x: +x.toFixed(2), z, kind: 'hallway', crouch: false })),
  // library
  { x: -2.0, z: -12.5, kind: 'library', crouch: false }, { x: 2.0, z: -12.5, kind: 'library', crouch: false }, { x: 6.0, z: -12.5, kind: 'library', crouch: false },
  { x: 0.0, z: -9.0, kind: 'library', crouch: true }, { x: 4.4, z: -6.5, kind: 'library', crouch: true }, { x: -1.4, z: -4.0, kind: 'library', crouch: false }, { x: 6.8, z: -15.8, kind: 'library', crouch: false },
  // stairwell + admin
  { x: 10.5, z: -12.0, kind: 'stairwell', crouch: false }, { x: 10.5, z: -15.5, kind: 'stairwell', crouch: false }, { x: 11.0, z: -9.0, kind: 'stairwell', crouch: false },
  { x: 17.0, z: -12.5, kind: 'admin', crouch: true }, { x: 15.4, z: -15.6, kind: 'admin', crouch: false }, { x: 19.0, z: -8.0, kind: 'admin', crouch: false },
  // gym
  { x: -17.0, z: 14.8, kind: 'gym', crouch: false }, { x: -13.5, z: 12.0, kind: 'gym', crouch: false }, { x: -9.5, z: 14.2, kind: 'gym', crouch: false }, { x: -5.4, z: 4.0, kind: 'gym', crouch: false },
  { x: -18.6, z: 13.7, kind: 'gym', crouch: false }, { x: -9.5, z: 16.2, kind: 'gym', crouch: false },
  // cafeteria
  { x: 0.6, z: 6.0, kind: 'cafeteria', crouch: true }, { x: 5.8, z: 6.0, kind: 'cafeteria', crouch: true }, { x: 0.6, z: 10.5, kind: 'cafeteria', crouch: true }, { x: 5.8, z: 10.5, kind: 'cafeteria', crouch: true },
  { x: 8.0, z: 16.0, kind: 'cafeteria', crouch: false }, { x: -2.6, z: 14.0, kind: 'cafeteria', crouch: false }, { x: 8.4, z: 3.0, kind: 'cafeteria', crouch: false },
  // toilets
  { x: 11.2, z: 15.2, kind: 'toilets', crouch: false }, { x: 13.3, z: 15.3, kind: 'toilets', crouch: false }, { x: 18.8, z: 12.0, kind: 'toilets', crouch: false },
];
export const spawns = [
  [-17, 0], [-13, 0], [-9, 0], [-3, 0], [1, 0], [5, 0], [10.5, 0], [14, 0], [18, 0],
  [-16, -7], [-5.8, -9.5], [3, -9], [16, -6], [-14, 8], [-10, 11], [-6, 6.5], [3, 8.5], [7, 13], [15, 6], [17, 12.6],
];

export function build(b, rnd) {
  const T = 0.2, H = 3;
  const deco = { collide: false, cast: false };
  function wallH(z, x0, x1, gaps = [], mat = 'sc_wall', h = H) {
    let c = x0;
    const seg = (a, e) => { if (e - a > 0.01) b.box((a + e) / 2, z, e - a, T, h, mat); };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box((g0 + g1) / 2, z, g1 - g0, T, h - 2.2, mat, { y0: 2.2, collide: false }); c = g1; }
    seg(c, x1);
  }
  function wallV(x, z0, z1, gaps = [], mat = 'sc_wall', h = H) {
    let c = z0;
    const seg = (a, e) => { if (e - a > 0.01) b.box(x, (a + e) / 2, T, e - a, h, mat); };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box(x, (g0 + g1) / 2, T, g1 - g0, h - 2.2, mat, { y0: 2.2, collide: false }); c = g1; }
    seg(c, z1);
  }
  const one = (name, mat, x, z, w, d, h, y0 = 0) => b.prop(name, () => b.box(x, z, w, d, h, mat, { y0 }));
  const plant = (x, z) => b.prop('potted plant', () => { b.box(x, z, 0.45, 0.45, 0.4, 'sc_pot'); b.mesh(['ico', 0.4, 1], 'sc_leaf', x, 0.95, z); });
  const bin = (x, z) => one('bin', 'sc_dark', x, z, 0.4, 0.4, 0.7);
  const tbl = (name, x, z, w, d, mat = 'sc_desk') => b.prop(name, () => { // raised top: crouch under it
    b.box(x, z, w, d, 0.06, mat, { y0: 1.1 });
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) b.box(x + dx * (w / 2 - 0.08), z + dz * (d / 2 - 0.08), 0.06, 0.06, 1.1, mat, { collide: false });
  });
  const chair = (x, z) => b.prop('chair', () => { b.box(x, z, 0.42, 0.42, 0.45, 'sc_chair'); b.box(x, z - 0.2, 0.42, 0.05, 0.45, 'sc_chair', { y0: 0.45 }); });

  // ----- floors, ceiling, shell
  b.box(0, 0, 41, 35, 0.02, 'sc_floor', deco);
  b.box(-12, 9.5, 16, 15, 0.04, 'sc_gymFloor', deco);
  b.box(3, 9.5, 14, 15, 0.04, 'sc_cafeFloor', deco);
  b.box(2, -9.5, 12, 15, 0.04, 'sc_libCarpet', deco);
  b.box(15, 13.25, 10, 7.5, 0.04, 'sc_tile', deco);
  for (const [x0, x1, z0, z1] of [[-20, 8, -17, 17], [8, 20, 2, 17], [13, 20, -17, 2]]) b.box((x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 0.4, z1 - z0 + 0.4, 0.2, 'sc_ceiling', { y0: 3, ...deco });
  b.box(10.5, -9.5, 5.4, 15.4, 0.2, 'sc_ceiling', { y0: 6, ...deco });
  wallH(-17, -20, 8); wallH(-17, 13, 20); wallH(-17, 8, 13, [], 'sc_wall', 6); wallH(17, -20, 20); wallV(-20, -17, 17); wallV(20, -17, 17);
  wallH(-2, -20, 8, [[-17, -15.4], [-9, -7.4], [-0.8, 1.2], [4.6, 6.2]]); wallH(-2, 13, 20, [[15.6, 17.2]]); // hallway north (stairwell x 8..13 is open)
  wallH(2, -20, 20, [[-14, -12], [-8, -6], [0, 2.2], [6, 7.6], [14.5, 16.2]]);                               // hallway south
  wallV(-12, -17, -2, [[-9.5, -8]]); wallV(-4, -17, -2, [[-13, -11.5]]); wallV(8, -17, -2, [[-12, -10.5]], 'sc_wall', 6); wallV(13, -17, -2, [[-9, -7.5]], 'sc_wall', 6);
  wallV(-4, 2, 17, [[8, 10]]); wallV(10, 2, 17, [[5, 6.6], [12.5, 14]]); wallH(9.5, 10, 20, [[17, 18.6]]);
  for (const x of [-16, -8, 0, 4, 16]) for (const s of [-1, 1]) b.mesh(['plane', 2.2, 1.1], 'sc_window', x, 1.7, s * 16.88, { cast: false, r: [0, s < 0 ? 0 : Math.PI, 0] });
  for (const [x, z, ry] of [[-19.85, 0, Math.PI / 2], [19.85, 0, -Math.PI / 2], [5.4, -1.85, 0], [-5, 1.85, Math.PI]]) b.mesh(['plane', 0.55, 0.2], 'sc_exit', x, 2.55, z, { cast: false, r: [0, ry, 0] });
  for (let x = -18; x <= 18; x += 4) b.box(x, 0, 1.4, 0.2, 0.06, 'sc_tube', { y0: 2.92, ...deco }); // hallway
  for (const [x0, x1] of [[-20, -12], [-12, -4]]) for (const x of [x0 + 2.5, x0 + 5.5]) for (const z of [-13, -7]) b.box(x, z, 1.4, 0.2, 0.06, 'sc_tube', { y0: 2.92, ...deco });
  for (const x of [-14, -8]) for (const z of [5, 9, 13]) b.box(x, z, 1.8, 0.2, 0.06, 'sc_tube', { y0: 2.92, ...deco });
  for (const x of [0, 5]) for (const z of [5, 9, 13]) b.box(x, z, 1.4, 0.2, 0.06, 'sc_tube', { y0: 2.92, ...deco });
  for (const x of [-2, 3, 7]) for (const z of [-13, -8, -4.5]) b.box(x, z, 1.4, 0.2, 0.06, 'sc_tube', { y0: 2.92, ...deco });
  for (const x of [15, 18]) for (const z of [-13, -6, 5, 13]) b.box(x, z, 1.2, 0.2, 0.06, 'sc_tube', { y0: 2.92, ...deco });
  b.light(0, 2.6, 0, 40, 18, 0xdfeaf0);    // hallway
  b.light(-12, 2.8, 9.5, 46, 17, 0xffe6bf); // gym
  b.light(3, 2.6, 9.5, 36, 15, 0xfff0d0);   // cafeteria
  b.light(2, 2.6, -9, 28, 13, 0xd8c8ff);    // library

  // ----- hallway lockers: banks with open alcoves (stand inside). One static material, a few single locker props at the dead ends.
  const bank = (x0, x1, z) => { // locker bank along a wall; z = box centre. Doors are painted strips, every third unit is an open alcove
    const n = Math.max(1, Math.round((x1 - x0) / 0.9)), w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * w;
      if (i % 3 === 1) { b.box(cx - w / 2 + 0.03, z, 0.06, 0.5, 1.9, 'sc_lockerOpen'); b.box(cx + w / 2 - 0.03, z, 0.06, 0.5, 1.9, 'sc_lockerOpen'); b.box(cx, z + (z < 0 ? -0.22 : 0.22), w, 0.06, 1.9, 'sc_lockerOpen', { collide: false }); }
      else b.box(cx, z, w - 0.02, 0.5, 1.9, 'sc_locker');
    }
  };
  for (const [a, e] of BANKS_N) bank(a, e, -1.65);
  for (const [a, e] of BANKS_S) bank(a, e, 1.65);
  one('locker', 'sc_locker', 6.9, -1.65, 0.6, 0.5, 1.9);
  plant(-19.4, -0.4); plant(19.4, 0.4); one('water fountain', 'sc_metal', 7.0, 1.7, 0.5, 0.4, 1.0); bin(-1.4, -1.65);
  one('trophy case', 'sc_shelf', 19.5, -10.5, 0.5, 1.8, 1.7); one('notice board', 'sc_board', 15.0, -16.7, 1.4, 0.1, 1.2, 0.6);
  one('fire extinguisher', 'sc_matRed', -19.7, 0.0, 0.2, 0.2, 0.5); one('wet floor sign', 'sc_chair', 12.0, -0.6, 0.38, 0.3, 0.6);

  // ----- classrooms A, B (north-west) and the science room (south-east)
  const classroom = (x0, x1, withChairs) => {
    const cx = (x0 + x1) / 2;
    b.box(cx, -16.84, 4.6, 0.04, 1.2, 'sc_board', { y0: 1.0, ...deco }); // board
    tbl('teacher desk', cx, -14.6, 1.8, 0.8);
    for (const dx of [2.4, 5.6]) for (const z of [-11.5, -8.5, -5.5]) { tbl('student desk', x0 + dx, z, 1.2, 0.6); if (withChairs) chair(x0 + dx, z + 0.7); }
    b.prop('bookcase', () => b.box(x0 + 0.4, -3.4, 0.5, 1.6, 1.9, 'sc_shelf'));
    plant(x1 - 0.5, -16.4); bin(x1 - 0.5, -3.2);
    one('globe stand', 'sc_metal', x0 + 1.0, -16.2, 0.45, 0.45, 1.1);
  };
  classroom(-20, -12, false); classroom(-12, -4, true);
  one('cabinet', 'sc_metal', -19.4, -9.6, 0.6, 1.2, 1.5);
  one('cardboard box', 'sc_cardboard', -5.4, -16.2, 0.55, 0.5, 0.45);
  // science room (x 10..20, z 2..9.5)
  b.box(15, 2.3, 4.6, 0.04, 1.2, 'sc_board', { y0: 1.0, ...deco });
  for (const [x, z] of [[13.5, 5.2], [16.5, 5.2], [13.5, 7.8], [16.5, 7.8]]) b.prop('lab bench', () => { b.box(x, z, 2.2, 0.8, 0.9, 'sc_white'); b.box(x, z, 2.0, 0.6, 0.04, 'sc_dark', { y0: 0.9, collide: false }); });
  tbl('teacher desk', 14.5, 3.4, 1.8, 0.8); one('cabinet', 'sc_metal', 19.4, 7.5, 0.6, 1.2, 1.7); one('skeleton stand', 'sc_white', 19.2, 3.2, 0.5, 0.5, 1.7); plant(10.6, 9.0); bin(19.5, 4.4);

  // ----- library (x -4..8): tall stacks with crossing gaps, reading tables, beanbags
  for (const [z, segs] of [[-14.2, [[-3.6, -1.0], [0.2, 3.0], [4.2, 6.6]]], [-11.2, [[-3.6, -0.4], [0.8, 4.0], [5.2, 7.6]]], [-8.2, [[-3.6, -1.6], [-0.4, 2.4], [3.6, 7.6]]]]) for (const [a, e] of segs) { b.box((a + e) / 2, z, e - a, 0.6, 2.4, 'sc_shelf'); b.box((a + e) / 2, z + 0.31, e - a - 0.1, 0.02, 2.0, 'sc_books', { y0: 0.2, ...deco }); }
  b.box(2, -16.7, 11.6, 0.4, 2.4, 'sc_shelf'); // wall shelving, north
  tbl('reading table', 0.0, -9.6, 1.8, 0.9, 'sc_shelf'); tbl('reading table', 4.4, -6.0, 1.8, 0.9, 'sc_shelf');
  for (const [x, z] of [[-2.8, -5.0], [6.8, -4.6], [-0.4, -6.2]]) b.prop('beanbag', () => b.box(x, z, 0.8, 0.8, 0.45, 'sc_fabric'));
  b.prop('book cart', () => b.box(5.8, -9.6, 0.5, 1.0, 1.0, 'sc_metal'));
  b.prop('globe', () => { b.box(2.4, -5.0, 0.3, 0.3, 0.7, 'sc_metal'); b.mesh(['sphere', 0.3, 12, 8], 'sc_rail', 2.4, 1.0, -5.0); });
  plant(7.4, -3.0); one('card catalog', 'sc_shelf', -3.4, -6.8, 0.5, 1.4, 1.2);

  // ----- stairwell + upper floor: two flights (risers 0.25, treads 0.4) up to a deck at y 3.0; the middle passage leads under the deck
  for (const x of [9.0, 12.0]) for (let k = 1; k <= 12; k++) b.box(x, -2.6 - 0.4 * (k - 0.5), 1.2, 0.4, 0.25 * k, 'sc_concrete');
  b.box(10.5, -12.2, 4.8, 9.6, 0.3, 'sc_concrete', { y0: 2.7 }); // deck, z -17 .. -7.4
  b.box(10.5, -7.5, 1.8, 0.1, 1.0, 'sc_rail', { y0: 3.0 }); // railing at the deck edge between the flights
  b.prop('upper bench', () => b.box(10.5, -15.8, 2.0, 0.5, 0.45, 'sc_desk', { y0: 3.0 }));
  b.prop('upper cabinet', () => b.box(12.4, -12.0, 0.5, 1.5, 1.4, 'sc_metal', { y0: 3.0 }));
  b.prop('upper plant', () => { b.box(8.6, -9.0, 0.45, 0.45, 0.4, 'sc_pot', { y0: 3.0 }); b.mesh(['ico', 0.4, 1], 'sc_leaf', 8.6, 3.95, -9.0); });
  one('storage crate', 'sc_cardboard', 8.7, -15.8, 0.8, 0.8, 0.8); one('storage crate', 'sc_cardboard', 12.4, -15.8, 0.8, 0.8, 0.8); one('mop bucket', 'sc_chair', 12.4, -9.0, 0.4, 0.5, 0.45);
  one('stack of chairs', 'sc_chair', 10.5, -14.4, 0.5, 0.5, 1.3);

  // ----- admin / nurse (x 13..20, z -17..-2)
  tbl('office desk', 17.0, -12.5, 1.8, 0.9); chair(17.0, -11.6);
  b.prop('nurse bed', () => b.box(19.0, -6.0, 0.9, 1.9, 0.6, 'sc_white'));
  for (const z of [-15.8, -14.8]) one('filing cabinet', 'sc_metal', 14.2, z, 0.6, 0.8, 1.35);
  b.prop('sofa', () => { b.box(16.0, -4.3, 1.8, 0.8, 0.45, 'sc_fabric'); b.box(16.0, -4.65, 1.8, 0.16, 0.9, 'sc_fabric'); });
  b.prop('photocopier', () => b.box(19.3, -15.6, 0.9, 0.7, 1.0, 'sc_white')); plant(13.6, -3.0);

  // ----- gym (x -20..-4, z 2..17): court lines, bleachers, mats, hoops
  for (const [x, z, w, d] of [[-12, 9.5, 12, 0.1], [-12, 4, 12, 0.1], [-12, 15, 12, 0.1], [-6, 9.5, 0.1, 11], [-18, 9.5, 0.1, 11]]) b.box(x, z, w, d, 0.02, 'sc_line', { y0: 0.04, ...deco });
  b.prop('bleachers', () => { for (let k = 0; k < 3; k++) b.box(-19.1 + k * 0.5, 9.5, 0.9, 7.0, 0.45 * (k + 1), 'sc_bleacher'); });
  b.prop('bleachers', () => { for (let k = 0; k < 3; k++) b.box(-19.1 + k * 0.5, 15.6, 0.9, 2.4, 0.45 * (k + 1), 'sc_bleacher'); });
  for (const [x, z] of [[-16.5, 5.0], [-9.5, 5.2], [-4.9, 12.5], [-12.5, 15.2]]) b.prop('gym mat stack', () => { b.box(x, z, 1.8, 1.0, 0.5, 'sc_mat'); b.box(x + 0.05, z, 1.7, 0.9, 0.35, 'sc_matRed', { y0: 0.5 }); });
  b.prop('vaulting box', () => b.box(-14.5, 12.0, 1.2, 0.7, 0.9, 'sc_desk'));
  b.prop('vaulting box', () => b.box(-8.0, 13.8, 1.2, 0.7, 0.9, 'sc_desk'));
  for (const x of [-18.2, -5.8]) b.prop('basketball hoop', () => { b.box(x, 9.5, 0.2, 0.2, 3.0, 'sc_metal'); b.box(x + (x < 0 && x < -12 ? 0.5 : -0.5), 9.5, 0.06, 1.2, 0.8, 'sc_white', { y0: 2.5, collide: false }); });
  b.prop('ball trolley', () => { b.box(-5.2, 7.2, 0.7, 0.9, 0.9, 'sc_metal'); b.mesh(['sphere', 0.2, 10, 8], 'sc_ball', -5.2, 1.1, 7.0); });
  for (const [x, z] of [[-9, 8.2], [-11, 10.8], [-15, 6.8]]) b.prop('traffic cone', () => b.mesh(['cyl', 0.03, 0.17, 0.6, 10], 'sc_ball', x, 0.3, z));
  for (const x of [-14, -8]) b.prop('gym bench', () => b.box(x, 3.0, 2.0, 0.4, 0.45, 'sc_desk'));
  one('equipment cage', 'sc_metal', -18.8, 3.2, 1.2, 1.0, 1.6); one('equipment cage', 'sc_metal', -6.2, 16.0, 1.2, 1.0, 1.6); plant(-4.6, 15.8);

  // ----- cafeteria (x -4..10, z 2..17): long tables you can crouch under, serving counter
  for (const [x, z] of [[0.6, 6.0], [5.8, 6.0], [0.6, 10.5], [5.8, 10.5]]) b.prop('cafeteria table', () => {
    b.box(x, z, 3.0, 1.0, 0.06, 'sc_desk', { y0: 1.1 });
    for (const dx of [-1.4, 1.4]) for (const dz of [-0.4, 0.4]) b.box(x + dx, z + dz, 0.06, 0.06, 1.1, 'sc_desk', { collide: false });
    for (const s of [-1, 1]) b.box(x, z + s * 0.78, 2.8, 0.3, 0.42, 'sc_chair');
  });
  b.box(0.2, 16.3, 8.4, 0.8, 1.0, 'sc_metal'); b.box(0.2, 16.3, 8.6, 0.9, 0.05, 'sc_white', { y0: 1.0, collide: false });
  b.prop('vending machine', () => b.box(-3.4, 3.2, 0.9, 0.8, 1.9, 'sc_vend')); b.prop('vending machine', () => b.box(9.4, 16.4, 0.9, 0.8, 1.9, 'sc_vend'));
  for (const [x, z] of [[8.8, 4.0], [-3.2, 8.4]]) b.prop('tray trolley', () => b.box(x, z, 0.6, 1.0, 1.0, 'sc_metal'));
  bin(9.4, 7.0); bin(-3.4, 12.0); bin(9.4, 10.0); one('water cooler', 'sc_rail', -3.4, 14.6, 0.35, 0.35, 1.0); plant(9.4, 13.0);
  one('salad bar', 'sc_white', 4.4, 14.4, 2.4, 0.8, 1.0);

  // ----- toilets (x 10..20, z 9.5..17): stalls along the south wall, sinks on the east wall
  for (let k = 0; k < 4; k++) {
    const x = 11.0 + k * 2.2;
    b.box(x + 1.1, 15.9, 0.05, 2.2, 1.8, 'sc_stall', { y0: 0.15 });
    b.prop('toilet', () => b.box(x, 16.4, 0.4, 0.6, 0.4, 'sc_white'));
    b.box(x - 0.45, 14.8, 0.9, 0.04, 1.7, 'sc_stall', { y0: 0.15, collide: false, ry: k % 2 ? 0.9 : -0.9 });
  }
  b.box(19.7, 12.2, 0.4, 3.0, 0.9, 'sc_white'); b.box(19.92, 12.2, 0.04, 2.6, 1.0, 'sc_metal', { y0: 1.1, ...deco });
  one('mop bucket', 'sc_chair', 12.0, 10.2, 0.4, 0.5, 0.45); bin(18.6, 10.2); one('wet floor sign', 'sc_chair', 15.0, 12.6, 0.38, 0.3, 0.6);
}
