// "Night at the Museum": a natural-history museum after dark. ~42x36 m. Dinosaur hall (north-west), Egyptian wing (north-east), cramped dark storage between them,
// a grand hall of statues and display cases across the middle, an armour gallery, the atrium and a gift shop to the south. +z is the entrance.
// Emissive display cases do most of the lighting (4 point lights only). Same builder API as lateshop.js: b.box / mesh / collider / light / prop. No THREE, no DOM.
// Material names are prefixed `mu_` (the client's material table is global). Gameplay constants: player radius 0.3, crouch height 1.0, standing 1.7.

export const meta = {
  id: 'museum', name: 'Night at the Museum', size: 42, blurb: 'Skeletons, sarcophagi and suits of armour. Which one just moved?',
  players: { min: 3, max: 8, recommended: '4-6' }, thumbnail: '/thumbs/museum.webp',
  fog: { color: 0x0b0d14, near: 9, far: 58 }, sky: 'night',
  ambient: { color: 0x9aa4c8, ground: 0x4a4658, intensity: 1.25 },
  seekerStart: { x: 0, z: 14.5, yaw: 0 }, // atrium (server spreads seekers along x by 1.4)
  bounds: { x0: -21, x1: 21, z0: -18, z1: 18 },
  outdoor: { reverb: 'outdoor', surface: 'concrete' }, // anywhere outside a zone
  zones: [ // rooms for culling + audio (first match wins, see src/audio/zones.js): flat x0..z1 (audio) and the same rectangle as `box` (culling); reverb room|hall|outdoor; surface wood|tile|grass|concrete
    { name: 'dinosaur hall', x0: -21, x1: -4, z0: -18, z1: -3, box: { x0: -21, x1: -4, z0: -18, z1: -3 }, reverb: 'hall', surface: 'wood' },
    { name: 'storage', x0: -4, x1: 4, z0: -18, z1: -3, box: { x0: -4, x1: 4, z0: -18, z1: -3 }, reverb: 'room', surface: 'concrete' },
    { name: 'egyptian wing', x0: 4, x1: 21, z0: -18, z1: -3, box: { x0: 4, x1: 21, z0: -18, z1: -3 }, reverb: 'hall', surface: 'concrete' },
    { name: 'grand hall', x0: -21, x1: 21, z0: -3, z1: 5, box: { x0: -21, x1: 21, z0: -3, z1: 5 }, reverb: 'hall', surface: 'tile' },
    { name: 'armour gallery', x0: -21, x1: -6, z0: 5, z1: 18, box: { x0: -21, x1: -6, z0: 5, z1: 18 }, reverb: 'hall', surface: 'wood' },
    { name: 'atrium', x0: -6, x1: 6, z0: 5, z1: 18, box: { x0: -6, x1: 6, z0: 5, z1: 18 }, reverb: 'hall', surface: 'tile' },
    { name: 'gift shop', x0: 6, x1: 21, z0: 5, z1: 18, box: { x0: 6, x1: 21, z0: 5, z1: 18 }, reverb: 'room', surface: 'wood' },
  ],
};

export const materials = {
  mu_marble: { color: 0x3c3f4a, roughness: 0.25, metalness: 0.1 },
  mu_sand: { color: 0x8a7550, roughness: 0.9 },
  mu_woodFloor: { color: 0x6a4a30, roughness: 0.6 },
  mu_carpet: { color: 0x5a2230, roughness: 1 },
  mu_wall: { color: 0x7c705e, roughness: 0.95 },
  mu_wallDark: { color: 0x4a4540, roughness: 0.95 },
  mu_ceiling: { color: 0x1d1f26, roughness: 0.9 },
  mu_column: { color: 0xa9a392, roughness: 0.6 },
  mu_bone: { color: 0xd9d2b8, roughness: 0.7 },
  mu_stone: { color: 0x9a9890, roughness: 0.85, flatShading: true },
  mu_plinth: { color: 0x2f3036, roughness: 0.6 },
  mu_gold: { color: 0xc9a23a, roughness: 0.35, metalness: 0.7 },
  mu_sarc: { color: 0x2f6a78, roughness: 0.55, metalness: 0.2 },
  mu_armour: { color: 0x9aa0aa, roughness: 0.3, metalness: 0.75 },
  mu_case: { color: 0x1a2a2a, roughness: 0.2, emissive: 0x8fe8d8, emissiveIntensity: 1.1 }, // glowing display cases: the museum's lighting
  mu_caseWarm: { color: 0x2a2010, roughness: 0.2, emissive: 0xffc46a, emissiveIntensity: 1.2 },
  mu_wood: { color: 0x8a5a36, roughness: 0.8 },
  mu_crate: { color: 0x9a7a4a, roughness: 0.9 },
  mu_cardboard: { color: 0xa88458, roughness: 0.9 },
  mu_sheet: { color: 0xcfcbc0, roughness: 1 },
  mu_rope: { color: 0x9a1f2a, roughness: 0.6 },
  mu_dark: { color: 0x24252b, roughness: 0.6 },
  mu_fabric: { color: 0x3a5a7a, roughness: 1 },
  mu_plush1: { color: 0x6aa84f, roughness: 1 }, mu_plush2: { color: 0xe0793a, roughness: 1 }, mu_plush3: { color: 0x6a7ad0, roughness: 1 },
  mu_egg: { color: 0xb8a98a, roughness: 0.8 },
  mu_leaf: { color: 0x2f6b3a, roughness: 0.9, flatShading: true },
  mu_exit: { color: 0x200000, roughness: 0.5, emissive: 0xff2a1a, emissiveIntensity: 2.2 },
  mu_window: { color: 0x101820, roughness: 0.5, emissive: 0x5a78a8, emissiveIntensity: 0.9 },
  mu_torch: { color: 0x2a1408, roughness: 0.5, emissive: 0xff8a2a, emissiveIntensity: 2.4 },
  mu_door: { color: 0x181410, roughness: 0.5, emissive: 0xa8c4ff, emissiveIntensity: 0.8 },
};

export const mix = [['dino', 1], ['egypt', 1], ['grand', 1], ['gift', 1], ['armour', 1]];
export const spots = [
  // dinosaur hall
  { x: -12.0, z: -9.5, kind: 'dino', crouch: false }, { x: -12.0, z: -15.5, kind: 'dino', crouch: false }, { x: -19.5, z: -7.0, kind: 'dino', crouch: false }, { x: -7, z: -11.95, kind: 'dino', crouch: false },
  { x: -19.8, z: -17.0, kind: 'dino', crouch: false }, { x: -5.2, z: -16.8, kind: 'dino', crouch: false }, { x: -17, z: -12.6, kind: 'dino', crouch: false }, { x: -8, z: -6, kind: 'dino', crouch: false },
  // storage
  { x: -2.0, z: -15.4, kind: 'storage', crouch: true }, { x: 2.2, z: -14.0, kind: 'storage', crouch: false }, { x: -2.4, z: -11.0, kind: 'storage', crouch: false }, { x: 1.6, z: -9.0, kind: 'storage', crouch: true },
  { x: -2.6, z: -6.2, kind: 'storage', crouch: false }, { x: 2.4, z: -5.25, kind: 'storage', crouch: true }, { x: 0.2, z: -16.8, kind: 'storage', crouch: false },
  // egyptian wing
  { x: 7.25, z: -14, kind: 'egypt', crouch: true }, { x: 11.75, z: -14, kind: 'egypt', crouch: true }, { x: 16.25, z: -14, kind: 'egypt', crouch: true }, { x: 10.0, z: -8.0, kind: 'egypt', crouch: false },
  { x: 15, z: -8, kind: 'egypt', crouch: false }, { x: 20.0, z: -10.0, kind: 'egypt', crouch: false }, { x: 5.0, z: -17.0, kind: 'egypt', crouch: false }, { x: 19.5, z: -4.25, kind: 'egypt', crouch: false },
  // grand hall
  { x: -18, z: 1.25, kind: 'grand', crouch: false }, { x: -13.25, z: 3.8, kind: 'grand', crouch: false }, { x: -6.75, z: -1.5, kind: 'grand', crouch: false }, { x: 0, z: -0.75, kind: 'grand', crouch: true },
  { x: 6.5, z: 4.05, kind: 'grand', crouch: false }, { x: 13.25, z: -1.6, kind: 'grand', crouch: false }, { x: 19.0, z: 2.0, kind: 'grand', crouch: false },
  // armour gallery
  { x: -19.5, z: 8.0, kind: 'armour', crouch: false }, { x: -15.0, z: 10.5, kind: 'armour', crouch: false }, { x: -19.5, z: 14.5, kind: 'armour', crouch: false }, { x: -10.5, z: 16.4, kind: 'armour', crouch: false },
  { x: -8.2, z: 7.5, kind: 'armour', crouch: false }, { x: -13.0, z: 13.5, kind: 'armour', crouch: true }, { x: -17.0, z: 16.6, kind: 'armour', crouch: false },
  // atrium
  { x: -4.4, z: 16.6, kind: 'atrium', crouch: false }, { x: 4.4, z: 16.6, kind: 'atrium', crouch: false }, { x: 0, z: 8.25, kind: 'atrium', crouch: true },
  // gift shop
  { x: 9.5, z: 7.25, kind: 'gift', crouch: false }, { x: 14.5, z: 9.0, kind: 'gift', crouch: false }, { x: 19.5, z: 10.5, kind: 'gift', crouch: false }, { x: 12.0, z: 13.5, kind: 'gift', crouch: false },
  { x: 17.5, z: 15.75, kind: 'gift', crouch: false }, { x: 8.0, z: 16.8, kind: 'gift', crouch: false },
];
export const spawns = [
  [-17.75, 0.5], [-12, 0.5], [-7, 1.5], [-3, 2.5], [3, 2.5], [8, 0.25], [14, 1.5], [19, 0.5],
  [-9, -7], [-16, -4.5], [-6, -15], [0, -12], [6.25, -6], [13, -12], [19, -16.25], [-14, 8], [-9.25, 12.5], [-2, 10.5], [3, 12.5], [11, 11.5], [18, 7.25],
];

export function build(b, rnd) {
  const T = 0.2, H = 5;
  const deco = { collide: false, cast: false };
  function wallH(z, x0, x1, gaps = [], mat = 'mu_wall', h = H) {
    let c = x0;
    const seg = (a, e) => { if (e - a > 0.01) b.box((a + e) / 2, z, e - a, T, h, mat); };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box((g0 + g1) / 2, z, g1 - g0, T, h - 2.8, mat, { y0: 2.8, collide: false }); c = g1; }
    seg(c, x1);
  }
  function wallV(x, z0, z1, gaps = [], mat = 'mu_wall', h = H) {
    let c = z0;
    const seg = (a, e) => { if (e - a > 0.01) b.box(x, (a + e) / 2, T, e - a, h, mat); };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box(x, (g0 + g1) / 2, T, g1 - g0, h - 2.8, mat, { y0: 2.8, collide: false }); c = g1; }
    seg(c, z1);
  }
  const one = (name, mat, x, z, w, d, h, y0 = 0) => b.prop(name, () => b.box(x, z, w, d, h, mat, { y0 }));
  const column = (x, z) => b.box(x, z, 0.8, 0.8, H, 'mu_column');
  const statue = (x, z, mat = 'mu_stone') => b.prop('statue', () => { b.box(x, z, 0.8, 0.8, 0.5, mat); b.box(x, z, 0.4, 0.3, 1.0, mat, { y0: 0.5 }); b.mesh(['ico', 0.2, 1], mat, x, 1.75, z); });
  const aCase = (name, x, z, w, d, mat = 'mu_case') => b.prop(name, () => b.box(x, z, w, d, 1.1, mat));
  const armour = (x, z) => b.prop('suit of armour', () => { b.box(x, z, 0.5, 0.5, 0.4, 'mu_armour'); b.box(x, z, 0.35, 0.25, 0.6, 'mu_armour', { y0: 0.4 }); b.box(x, z, 0.5, 0.3, 0.6, 'mu_armour', { y0: 1.0 }); b.mesh(['ico', 0.16, 1], 'mu_armour', x, 1.8, z); });
  const stanchion = (x, z) => one('stanchion', 'mu_rope', x, z, 0.12, 0.12, 1.0);
  const crate = (name, x, z, w, d, h) => one(name, 'mu_crate', x, z, w, d, h);

  // ----- floors, ceiling, shell
  b.box(0, 0, 43, 37, 0.02, 'mu_marble', deco);
  b.box(-12.5, -10.5, 17, 15, 0.04, 'mu_woodFloor', deco); // dino hall
  b.box(12.5, -10.5, 17, 15, 0.04, 'mu_sand', deco);       // egyptian wing
  b.box(-13.5, 11.5, 15, 13, 0.04, 'mu_carpet', deco);     // armour gallery
  b.box(13.5, 11.5, 15, 13, 0.04, 'mu_woodFloor', deco);   // gift shop
  b.box(0, 0, 43, 37, 0.2, 'mu_ceiling', { y0: 5, ...deco });
  wallH(-18, -21, 21); wallH(18, -21, 21); wallV(-21, -18, 18); wallV(21, -18, 18);
  wallH(-3, -21, 21, [[-15, -12], [-9, -6], [-0.8, 0.8], [7, 10], [14, 17]]);   // north strip | grand hall
  wallV(-4, -18, -3, [[-12, -9.5]]); wallV(4, -18, -3, [[-14, -12]]);        // dino | storage | egypt
  wallH(5, -21, 21, [[-16, -13], [-10, -7.5], [-4, 4], [8, 10.4], [15, 17.6]]); // grand hall | south wing
  wallV(-6, 5, 18, [[9, 11.5]]); wallV(6, 5, 18, [[9, 11.5]]);                // armour | atrium | gift shop
  b.box(0, 17.88, 4.0, 0.06, 2.6, 'mu_door', { ...deco }); // glowing entrance doors (closed)
  for (const x of [-16, -10, 8, 14]) b.mesh(['plane', 2.2, 1.6], 'mu_window', x, 2.4, 17.88, { cast: false, r: [0, Math.PI, 0] });
  for (const [x, z, ry] of [[-10.5, -2.85, Math.PI], [8.5, -2.85, Math.PI], [0, 4.85, 0], [-6, -17.85, 0]]) b.mesh(['plane', 0.55, 0.2], 'mu_exit', x, 3.4, z, { cast: false, r: [0, ry, 0] });
  b.light(-12, 3.4, -10, 38, 20, 0x8fb4ff);  // dinosaur hall: cold moonlight
  b.light(13, 2.8, -9, 30, 15, 0xffb050);    // egyptian wing: torch gold
  b.light(0, 3.6, 1, 34, 20, 0xb8c8ff);      // grand hall
  b.light(3, 3.0, 12, 34, 20, 0xffe0b0);     // atrium + gift shop

  // ----- dinosaur hall (x -21..-4, z -18..-3): two skeletons you can walk under, display cases, eggs
  const skeleton = (name, x0, x1, z, legX) => b.prop(name, () => {
    b.box((x0 + x1) / 2, z, x1 - x0, 0.3, 0.3, 'mu_bone', { y0: 2.0, collide: false }); // spine
    for (const lx of legX) for (const dz of [-0.7, 0.7]) b.box(lx, z + dz, 0.3, 0.3, 2.0, 'mu_bone');
    for (let k = 0; k < 6; k++) b.box(legX[0] + 0.5 * k, z, 0.1, 0.7, 1.1, 'mu_bone', { y0: 0.9, collide: false }); // ribs
    b.box(x1 - 0.5, z, 1.1, 0.6, 0.5, 'mu_bone', { y0: 1.8, collide: false }); // skull
    for (let k = 0; k < 4; k++) b.box(x0 + 0.6 + k * 0.9, z, 0.8, 0.25 - k * 0.04, 0.25, 'mu_bone', { y0: 1.8 - k * 0.1, collide: false }); // tail
  });
  skeleton('dinosaur skeleton', -17.5, -6.5, -9.5, [-12.2, -10.8]);
  skeleton('long-neck skeleton', -19.5, -5.5, -15.5, [-13.2, -11.2]);
  b.prop('pterosaur model', () => { b.box(-13, -6, 4.0, 0.5, 0.1, 'mu_bone', { y0: 3.6, collide: false }); b.box(-13, -6, 0.5, 1.0, 0.1, 'mu_bone', { y0: 3.55, collide: false }); });
  for (const [x, z] of [[-19.4, -4.4], [-19.4, -11.0], [-19.4, -14.0], [-4.9, -7.0], [-4.9, -14.6]]) aCase('fossil case', x, z, 1.4, 0.8, 'mu_case');
  for (const [x, z] of [[-16.5, -12.7], [-15.8, -12.2], [-9.0, -12.6]]) b.prop('dinosaur egg', () => { b.mesh(['ico', 0.3, 1], 'mu_egg', x, 0.3, z, { s: [1, 1.25, 1] }); b.collider({ x0: x - 0.25, x1: x + 0.25, z0: z - 0.25, z1: z + 0.25, y0: 0, y1: 0.6 }); });
  b.prop('triceratops skull', () => { b.box(-8.0, -5.0, 1.6, 1.2, 0.8, 'mu_bone'); b.box(-8.0, -5.5, 1.2, 0.3, 1.2, 'mu_bone', { y0: 0.4 }); });
  for (const x of [-17.5, -12.0, -7.0]) stanchion(x, -12.5);
  for (const [x, z] of [[-16, -6], [-9, -6], [-16, -13], [-8.8, -17.2]]) column(x, z);
  one('info plinth', 'mu_plinth', -20.4, -7.8, 0.5, 1.2, 1.1);
  one('palm in pot', 'mu_leaf', -5.0, -4.0, 0.7, 0.7, 1.3);

  // ----- storage (x -4..4, z -18..-3): dark and cramped
  for (const [x, z, w, d, h] of [[-2.6, -16.4, 1.2, 1.2, 1.2], [-1.2, -16.0, 1.0, 1.0, 2.0], [1.4, -16.4, 1.2, 1.2, 1.2], [2.8, -15.4, 1.0, 1.4, 1.0], [-2.8, -12.6, 1.4, 1.0, 1.6],
    [0.2, -13.2, 1.2, 1.2, 1.2], [-0.8, -10.6, 1.2, 1.0, 1.0], [2.6, -11.0, 1.0, 1.0, 1.4], [-2.8, -8.4, 1.0, 1.0, 1.0], [0.4, -7.4, 1.4, 1.0, 1.8], [2.8, -7.6, 1.0, 1.0, 1.0]]) crate('packing crate', x, z, w, d, h);
  b.prop('sheeted statue', () => b.box(-2.2, -4.4, 1.0, 1.0, 1.9, 'mu_sheet')); b.prop('sheeted statue', () => b.box(1.6, -12.0, 0.9, 0.9, 1.7, 'mu_sheet'));
  b.prop('pallet of boxes', () => { b.box(2.8, -4.6, 1.2, 0.8, 0.15, 'mu_wood'); b.box(2.8, -4.6, 1.1, 0.75, 1.1, 'mu_cardboard', { y0: 0.15 }); });
  b.prop('trolley', () => b.box(-0.2, -5.2, 0.7, 1.1, 0.9, 'mu_dark'));
  one('ladder', 'mu_wood', -3.7, -14.0, 0.3, 0.6, 2.4); one('cardboard box', 'mu_cardboard', -3.2, -17.4, 0.6, 0.5, 0.5);
  b.box(0.0, -17.7, 6.6, 0.6, 2.2, 'mu_wood'); // storage shelving along the north wall

  // ----- egyptian wing (x 4..21, z -18..-3): sarcophagi on plinths, statues, obelisk, torch-lit walls
  for (const x of [8, 12.5, 17]) b.prop('sarcophagus', () => { b.box(x, -14, 0.8, 2.2, 0.35, 'mu_plinth'); b.box(x, -14, 0.7, 2.0, 0.55, 'mu_sarc', { y0: 0.35 }); b.box(x, -14.7, 0.5, 0.5, 0.3, 'mu_gold', { y0: 0.9, collide: false }); });
  for (const x of [10.2, 15.0]) b.prop('upright mummy case', () => { b.box(x, -8.6, 0.6, 0.4, 1.8, 'mu_sarc'); b.box(x, -8.6, 0.3, 0.1, 0.5, 'mu_gold', { y0: 1.2, collide: false }); });
  b.prop('obelisk', () => { b.box(19.6, -5.0, 1.0, 1.0, 0.4, 'mu_plinth'); b.box(19.6, -5.0, 0.6, 0.6, 3.6, 'mu_stone', { y0: 0.4 }); });
  statue(7.0, -6.0, 'mu_gold'); statue(18.5, -15.5, 'mu_gold');
  b.prop('cat statue', () => { b.box(5.5, -4.2, 0.6, 0.6, 0.6, 'mu_plinth'); b.box(5.5, -4.2, 0.35, 0.25, 0.7, 'mu_gold', { y0: 0.6 }); });
  for (const [x, z] of [[19.3, -9.0], [19.3, -13.0], [5.0, -9.4], [11.0, -4.4]]) aCase('artefact case', x, z, 1.2, 0.8, 'mu_caseWarm');
  for (const [x, z] of [[8.5, -9.5], [13.2, -5.0], [16.5, -9.7]]) b.prop('canopic jar', () => { b.mesh(['cyl', 0.2, 0.25, 0.6, 10], 'mu_stone', x, 0.3, z); b.collider({ x0: x - 0.22, x1: x + 0.22, z0: z - 0.22, z1: z + 0.22, y0: 0, y1: 0.6 }); });
  for (const x of [6.5, 11.5, 16.5]) b.box(x, -17.8, 0.3, 0.1, 0.5, 'mu_torch', { y0: 1.8, ...deco }); // torch glows
  b.box(12.5, -17.7, 12, 0.5, 0.2, 'mu_gold', { y0: 3.0, ...deco }); // gold frieze
  for (const x of [8.5, 16.5]) column(x, -4.2);

  // ----- grand hall (x -21..21, z -3..5): central display island with a loop around it, statues, columns
  b.box(0, 1, 5.0, 3.0, 0.5, 'mu_plinth');
  b.prop('meteorite case', () => b.box(0, 1, 2.2, 1.6, 1.6, 'mu_case', { y0: 0.5 }));
  for (const [x, z] of [[-18.5, 0.5], [-12.5, 3.4], [-6.0, -1.3], [6.0, 3.4], [12.5, -1.4], [18.5, 3.2]]) statue(x, z);
  for (const [x, z] of [[-18, -1.5], [-11, -1.5], [11, -1.5], [18, -1.5], [-18, 3.5], [-11, 3.5], [11, 3.6], [18, 3.5]]) column(x, z);
  for (const [x, z] of [[-14.0, 1.0], [8.5, 1.0], [-3.2, -2.1]]) aCase('wall case', x, z, 1.2, 0.8);
  b.prop('bench', () => b.box(4.0, 4.4, 1.6, 0.5, 0.45, 'mu_wood')); b.prop('bench', () => b.box(-4.0, 4.4, 1.6, 0.5, 0.45, 'mu_wood'));
  one('donation box', 'mu_gold', 20.4, 0.5, 0.4, 0.4, 1.1);

  // ----- armour gallery (x -21..-6, z 5..18): suits of armour in two rows, weapon racks, a throne
  for (const [x, z] of [[-19.5, 7.0], [-17.0, 7.0], [-14.5, 7.0], [-12.0, 7.0], [-19.5, 12.0], [-19.5, 13.8], [-9.0, 17.0], [-10.8, 17.0], [-12.6, 17.0], [-14.4, 12.0], [-8.6, 12.4]]) armour(x, z);
  for (const x of [-16.0, -10.0]) b.prop('weapon rack', () => { b.box(x, 17.5, 1.6, 0.4, 1.6, 'mu_wood'); b.box(x, 17.2, 1.4, 0.05, 1.2, 'mu_armour', { y0: 0.3, collide: false }); });
  b.prop('throne', () => { b.box(-15.0, 12.0, 1.0, 0.9, 0.6, 'mu_gold'); b.box(-15.0, 12.35, 1.0, 0.2, 1.6, 'mu_gold', { y0: 0.6 }); });
  aCase('sword case', -11.8, 14.2, 1.6, 0.8, 'mu_caseWarm'); aCase('helmet case', -19.8, 10.0, 0.8, 1.4, 'mu_caseWarm');
  for (const x of [-18.2, -16.6]) stanchion(x, 14.5);
  b.prop('banner stand', () => b.box(-7.0, 9.8, 0.5, 0.5, 2.2, 'mu_rope'));

  // ----- atrium (x -6..6, z 5..18)
  b.prop('information desk', () => { b.box(0, 9.0, 2.6, 0.8, 1.1, 'mu_wood'); b.box(0, 9.0, 2.7, 0.9, 0.06, 'mu_gold', { y0: 1.1 }); });
  b.prop('dinosaur cast', () => { b.box(0, 12.8, 2.4, 1.0, 0.4, 'mu_plinth'); b.box(0, 12.8, 1.6, 0.5, 1.4, 'mu_bone', { y0: 0.4 }); b.mesh(['ico', 0.4, 1], 'mu_bone', 0.9, 2.1, 12.8); });
  statue(-4.6, 7.0); statue(4.6, 7.0);
  b.prop('bench', () => b.box(-4.2, 14.0, 0.5, 2.0, 0.45, 'mu_wood')); b.prop('bench', () => b.box(4.2, 14.0, 0.5, 2.0, 0.45, 'mu_wood'));
  b.prop('potted palm', () => { b.box(-5.0, 17.2, 0.7, 0.7, 0.5, 'mu_dark'); b.mesh(['ico', 0.6, 1], 'mu_leaf', -5.0, 1.3, 17.2); });
  b.prop('potted palm', () => { b.box(5.0, 17.2, 0.7, 0.7, 0.5, 'mu_dark'); b.mesh(['ico', 0.6, 1], 'mu_leaf', 5.0, 1.3, 17.2); });
  for (const x of [-2.2, 2.2]) b.prop('coat stand', () => b.box(x, 16.6, 0.4, 0.4, 1.8, 'mu_dark'));

  // ----- gift shop (x 6..21, z 5..18): shelving rows with plushies, counter, spinners
  for (const [x0, x1, z] of [[8.0, 13.0, 8.0], [15.0, 19.6, 8.0], [8.0, 11.6, 12.4], [13.4, 19.6, 12.4]]) { b.box((x0 + x1) / 2, z, x1 - x0, 0.6, 1.6, 'mu_wood'); b.box((x0 + x1) / 2, z + 0.31, x1 - x0 - 0.1, 0.02, 1.2, 'mu_plush2', { y0: 0.3, ...deco }); }
  b.box(13.5, 17.2, 7.0, 0.9, 1.1, 'mu_wood'); b.box(13.5, 17.2, 7.1, 1.0, 0.06, 'mu_gold', { y0: 1.1, collide: false }); // counter along the south wall
  for (const [x, z, m] of [[9.0, 9.6, 'mu_plush1'], [11.0, 9.6, 'mu_plush2'], [16.0, 9.6, 'mu_plush3'], [18.6, 9.6, 'mu_plush1'], [9.4, 14.4, 'mu_plush3'], [14.8, 14.4, 'mu_plush2']]) b.prop('plush dinosaur', () => { b.box(x, z, 0.5, 0.35, 0.4, m); b.mesh(['ico', 0.18, 1], m, x + 0.2, 0.55, z); });
  for (const [x, z] of [[12.0, 5.8], [17.0, 5.8]]) b.prop('postcard spinner', () => b.box(x, z, 0.4, 0.4, 1.6, 'mu_dark'));
  b.prop('poster tube stand', () => b.box(20.2, 7.0, 0.6, 0.6, 0.9, 'mu_cardboard'));
  b.prop('souvenir table', () => { b.box(16.5, 15.0, 1.6, 1.0, 0.8, 'mu_wood'); b.box(16.5, 15.0, 1.4, 0.8, 0.3, 'mu_plush3', { y0: 0.8, collide: false }); });
  one('cardboard box', 'mu_cardboard', 20.3, 16.8, 0.6, 0.5, 0.5); one('bin', 'mu_dark', 6.6, 16.6, 0.4, 0.4, 0.7);
}
