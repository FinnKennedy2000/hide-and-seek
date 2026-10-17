// "Late Shop": a supermarket after closing. ~44x44 m, +z is the front (car park), -z the loading bay.
// Same builder API as worlddata.js (b.box / mesh / collider / light / books / prop). No THREE, no DOM.
// Gameplay constants this layout is tuned for (game.js): player radius 0.3, crouch height 1.0 (gaps to crouch under are >= 1.1),
// standing 1.7, no auto step-up (walk onto a collider only if its top is <= 0.05 above your feet, hence the lorry ramp),
// jump apex ~0.9 (colliders with y1 <= ~0.95 can be hopped).

export const FLICKER = 0xd8ffe6; // b.light colour that marks a fluorescent strip: game.js may flicker lights with this colour

export const meta = {
  id: 'lateshop', name: 'Late Shop', size: 44, blurb: 'A supermarket after closing. The strip lights are failing.',
  fog: { color: 0x151c28, near: 14, far: 80 }, sky: 'night',
  ambient: { color: 0xb4c0dc, ground: 0x646c84, intensity: 1.5 }, // hemisphere fill: lit shop at night, not a horror game
  seekerStart: { x: 0, z: 9.5, yaw: 0 }, // car park, in front of the automatic doors (server spreads seekers along x by 1.4)
  bounds: { x0: -22, x1: 22, z0: -22, z1: 22 },
  flicker: FLICKER,
  // Audio zones: the FIRST zone whose box contains the listener wins, so the last entry is the catch-all.
  // reverb: 'small' (furnished room) | 'hall' (big open interior) | 'outdoor'. box is {x0,x1,y0,y1,z0,z1} in world metres.
  zones: [
    { name: 'Staff room', box: { x0: 4, x1: 9.5, y0: -1, y1: 4, z0: -16, z1: -9 }, reverb: 'small' },
    { name: 'Office', box: { x0: 9.5, x1: 14.5, y0: -1, y1: 4, z0: -16, z1: -9 }, reverb: 'small' },
    { name: 'Toilets', box: { x0: 14.5, x1: 20, y0: -1, y1: 4, z0: -16, z1: -9 }, reverb: 'small' },
    { name: 'Corridor', box: { x0: 4, x1: 20, y0: -1, y1: 4, z0: -9, z1: -6 }, reverb: 'small' },
    { name: 'Stock room', box: { x0: -20, x1: 4, y0: -1, y1: 4, z0: -16, z1: -6 }, reverb: 'hall' },
    { name: 'Shop floor', box: { x0: -20, x1: 20, y0: -1, y1: 4, z0: -6, z1: 8 }, reverb: 'hall' },
    { name: 'Loading bay', box: { x0: -22, x1: 22, y0: -1, y1: 5, z0: -22, z1: -16 }, reverb: 'hall' },
    { name: 'Car park', box: { x0: -22, x1: 22, y0: -1, y1: 60, z0: -22, z1: 22 }, reverb: 'outdoor' },
  ],
  // Light probes: sampled bounce colour per area, for the renderer's ambient / IBL tint (x, y, z, colour, intensity, radius).
  lightProbes: [
    { x: -11, y: 1.6, z: 0, color: 0xd8ffe6, intensity: 0.9, radius: 9 }, { x: 11, y: 1.6, z: 0.5, color: 0xd8ffe6, intensity: 0.9, radius: 9 },
    { x: 0, y: 1.2, z: -2.5, color: 0x66aaff, intensity: 0.7, radius: 5 }, { x: -8, y: 1.6, z: -10, color: 0xd8ffe6, intensity: 0.6, radius: 10 },
    { x: 9.4, y: 1.6, z: -12.5, color: 0xffd9a0, intensity: 0.6, radius: 6 }, { x: 2, y: 2, z: -18.5, color: 0xffb066, intensity: 0.6, radius: 8 },
    { x: -8, y: 2, z: 13, color: 0xffc27a, intensity: 0.7, radius: 14 },
  ],
};

// Only NEW material names (everything else used here already exists in game.js: wall roof wood metal dark white counter glass glow tv car stone leaf hedge bark).
export const materials = {
  asphalt: { color: 0x2c2e33, roughness: 0.95 },
  tile: { color: 0x9aa0a8, roughness: 0.4, emissive: 0x39414d, emissiveIntensity: 0.6 }, // lit shop floor
  shelf: { color: 0x56677d, roughness: 0.5, metalness: 0.3 },
  goodsRed: { color: 0xa8322d, roughness: 0.7 }, goodsYellow: { color: 0xd2a82a, roughness: 0.7 },
  goodsBlue: { color: 0x2f5f9a, roughness: 0.7 }, goodsGreen: { color: 0x3f8a4a, roughness: 0.7 },
  cardboard: { color: 0xa88458, roughness: 0.9 },
  hazard: { color: 0xe8b800, roughness: 0.6 },
  redPlastic: { color: 0xb02a24, roughness: 0.55 },
  binGreen: { color: 0x2f5d3a, roughness: 0.7 }, binBlue: { color: 0x2d4f8c, roughness: 0.7 }, binGrey: { color: 0x555a60, roughness: 0.7 },
  freezer: { color: 0xcfdbe6, roughness: 0.35, emissive: 0x1a3c5a, emissiveIntensity: 0.6 },
  freezerGlow: { color: 0x9fd8ff, roughness: 0.3, emissive: 0x7fc8ff, emissiveIntensity: 1.6 },
  locker: { color: 0x4d6e8f, roughness: 0.5, metalness: 0.3 },
  rackBlue: { color: 0x2b4a86, roughness: 0.5, metalness: 0.3 }, rackOrange: { color: 0xd2691e, roughness: 0.5, metalness: 0.3 },
  strip: { color: 0xb8d4c8, roughness: 0.3 },
  lorry: { color: 0xd9d9d4, roughness: 0.5 }, lorryBlue: { color: 0x264b7a, roughness: 0.4 },
  exitGlow: { color: 0x200000, roughness: 0.5, emissive: 0xff2a1a, emissiveIntensity: 2.2 },
  tubeGlow: { color: 0x2a2e2a, roughness: 0.5, emissive: 0xd8ffe6, emissiveIntensity: 3.2 },
  windowGlow: { color: 0x101810, roughness: 0.5, emissive: 0x7fb59a, emissiveIntensity: 0.9 },
  produceGreen: { color: 0x4c9a3a, roughness: 0.9 }, produceRed: { color: 0xb8352c, roughness: 0.9 }, produceOrange: { color: 0xd9822b, roughness: 0.9 },
  melon: { color: 0x2e6b35, roughness: 0.8 },
  carRed: { color: 0x8b2a2a, roughness: 0.35, metalness: 0.4 }, carGrey: { color: 0x6a6f78, roughness: 0.35, metalness: 0.4 },
  // remaster (src/world/textures.js draws the sign_* / decal_* canvases)
  trim: { color: 0xd9dde3, roughness: 0.5 }, ceiling: { color: 0xdfe3e8, roughness: 0.95 }, fitting: { color: 0x7d8590, roughness: 0.4, metalness: 0.5 },
  glassPane: { color: 0x9fc0e0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false },
  shelfBoard: { color: 0x8794a6, roughness: 0.45, metalness: 0.4 }, goods: { color: 0xffffff, roughness: 0.7 }, // goods: tinted per instance
  sign_fresh: { color: 0xffffff }, sign_checkout: { color: 0xffffff }, sign_exit: { color: 0xffffff }, sign_staff: { color: 0xffffff }, sign_chilled: { color: 0xffffff },
  sign_bay: { color: 0xffffff }, sign_wc: { color: 0xffffff }, sign_office: { color: 0xffffff }, sign_open: { color: 0xffffff }, sign_stock: { color: 0xffffff },
  sign_a1: { color: 0xffffff }, sign_a2: { color: 0xffffff }, sign_a3: { color: 0xffffff }, sign_a4: { color: 0xffffff }, sign_a5: { color: 0xffffff }, sign_a6: { color: 0xffffff },
  decal_stain: { color: 0xffffff, roughness: 1 }, decal_scuff: { color: 0xffffff, roughness: 1 }, decal_hazard: { color: 0xffffff, roughness: 0.7 },
  decal_arrow: { color: 0xffffff, roughness: 0.7 }, decal_puddle: { color: 0xffffff, roughness: 0.15, metalness: 0.2 },
};

// AI hiding spots. crouch:true = best/only reachable crouched (under something, or a low gap).
export const mix = [['floor', 2], ['back', 1], ['bay', 1], ['outside', 1]]; // [kind, count] pairs for the 5 single-player hiders
export const spots = [
  // shop floor
  { x: -12.5, z: -2.0, kind: 'floor', crouch: false }, // slip-through gap between shelf units
  { x: -15.0, z: 0.6, kind: 'floor', crouch: false },  // gap B
  { x: -10.0, z: -1.2, kind: 'floor', crouch: true },  // under raised shelf unit (leg gap)
  { x: -17.5, z: -0.3, kind: 'floor', crouch: true },  // under raised shelf unit 2
  { x: -18.5, z: 4.0, kind: 'floor', crouch: false },  // behind west-wall shelf, south end
  { x: -5.0, z: -5.45, kind: 'floor', crouch: false }, // behind north end of last aisle
  { x: -1.9, z: 0.0, kind: 'floor', crouch: true },    // behind freezer island west
  { x: 1.9, z: -3.5, kind: 'floor', crouch: true },    // behind freezer island east
  { x: 7.85, z: 5.2, kind: 'floor', crouch: false },   // checkout lane pocket 1
  { x: 12.05, z: 5.2, kind: 'floor', crouch: true },   // checkout lane pocket 3
  { x: 14.15, z: 4.4, kind: 'floor', crouch: true },   // checkout lane pocket 4
  { x: 6.8, z: 7.45, kind: 'floor', crouch: true },    // behind checkout 1 (cashier walkway)
  { x: -8.0, z: 5.7, kind: 'floor', crouch: true },    // trolley bay gap
  { x: -6.4, z: 7.0, kind: 'floor', crouch: false },   // trolley bay gap 2
  { x: 5.2, z: -2.2, kind: 'floor', crouch: true },    // between produce stands
  { x: 11.2, z: -2.2, kind: 'floor', crouch: true },   // between produce stands
  { x: 15.7, z: -4.4, kind: 'floor', crouch: true },   // behind produce stand by chillers
  { x: 18.6, z: -1.0, kind: 'floor', crouch: false },  // east produce crates
  { x: 19.0, z: 5.0, kind: 'floor', crouch: false },   // by water cooler / service desk
  // back of house
  { x: -13.0, z: -14.1, kind: 'back', crouch: true },  // under pallet rack (row 1/2 aisle)
  { x: -9.6, z: -11.6, kind: 'back', crouch: true },   // under pallet rack (row 2/3 aisle)
  { x: -18.0, z: -12.9, kind: 'back', crouch: true },  // under rack deck
  { x: -15.0, z: -8.2, kind: 'back', crouch: false },  // pallet lobby behind stacks
  { x: -1.6, z: -12.2, kind: 'back', crouch: false },  // crate maze
  { x: 0.2, z: -9.5, kind: 'back', crouch: false },    // crate maze
  { x: 1.2, z: -7.2, kind: 'back', crouch: false },    // crate maze east end
  { x: 5.13, z: -15.4, kind: 'back', crouch: false },  // locker alcove 1 (stand inside)
  { x: 7.25, z: -15.4, kind: 'back', crouch: false },  // locker alcove 3
  { x: 6.2, z: -12.2, kind: 'back', crouch: true },    // under staff table
  { x: 8.0, z: -11.2, kind: 'back', crouch: false },   // behind sofa
  { x: 12.0, z: -12.6, kind: 'back', crouch: true },   // under manager's desk
  { x: 13.6, z: -15.5, kind: 'back', crouch: false },  // filing cabinet corner
  { x: 15.25, z: -14.7, kind: 'back', crouch: false }, // toilet stall A
  { x: 18.9, z: -14.7, kind: 'back', crouch: false },  // toilet stall D
  // loading bay
  { x: 14.2, z: -19.0, kind: 'bay', crouch: false },   // inside lorry, far end
  { x: 9.8, z: -20.1, kind: 'bay', crouch: true },     // inside lorry, behind box stack
  { x: -12.0, z: -17.6, kind: 'bay', crouch: false },  // beside skip
  { x: -5.2, z: -17.3, kind: 'bay', crouch: false },   // roll cages
  // outside
  { x: -15.4, z: 15.6, kind: 'outside', crouch: false }, // between cars
  { x: 14.8, z: 15.2, kind: 'outside', crouch: false },  // between cars 2
  { x: -18.3, z: 8.7, kind: 'outside', crouch: false },  // behind recycling bins
  { x: -6.0, z: 21.3, kind: 'outside', crouch: false },  // behind hedge line
  { x: 10.0, z: 21.3, kind: 'outside', crouch: false },  // behind hedge line 2
  { x: 20.65, z: -2.3, kind: 'outside', crouch: false },  // side corridor, between bales
  { x: 3.2, z: 17.2, kind: 'outside', crouch: false },   // beside van
];

export const spawns = [
  [0, 12.5], [-7, 12.5], [9.5, 12.5], [-19, 13.5], [19.5, 12.5], [-1, 3.2],
  [-16.25, 1.0], [-11.25, -1.5], [0, -2.0], [9.5, 1.0], [12.2, -2.1],
  [12, -7.6], [-11.5, -8.6], [-4, -9.5], [-20.9, -2.0], [20.9, -12.0], [0.5, -20.0], [-19, -19.5],
];

export function build(b, rnd) {
  const T = 0.2, H = 3;
  const deco = { collide: false, cast: false };
  const mini = (() => { let a = 7; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(); // own RNG: never touches `rnd`
  // skirting on both faces of every wall run and a frame (jambs + head) at each opening: non-colliding trim
  const trim = (cx, cz, len, alongX) => {
    for (const s of [-1, 1]) { const o = s * (T / 2 + 0.015); if (alongX) b.box(cx, cz + o, len, 0.03, 0.1, 'trim', deco); else b.box(cx + o, cz, 0.03, len, 0.1, 'trim', deco); }
  };
  const frame = (c, g0, g1, alongX) => {
    const m = (g0 + g1) / 2, w = g1 - g0;
    if (alongX) { for (const x of [g0 + 0.03, g1 - 0.03]) b.box(x, c, 0.06, T + 0.08, 2.2, 'trim', deco); b.box(m, c, w, T + 0.08, 0.06, 'trim', { ...deco, y0: 2.14 }); }
    else { for (const z of [g0 + 0.03, g1 - 0.03]) b.box(c, z, T + 0.08, 0.06, 2.2, 'trim', deco); b.box(c, m, T + 0.08, w, 0.06, 'trim', { ...deco, y0: 2.14 }); }
  };
  function wallH(z, x0, x1, gaps = []) {
    let c = x0;
    const seg = (a, e) => { if (e - a > 0.01) { b.box((a + e) / 2, z, e - a, T, H, 'wall'); trim((a + e) / 2, z, e - a, true); } };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box((g0 + g1) / 2, z, g1 - g0, T, 0.8, 'wall', { y0: 2.2, collide: false }); frame(z, g0, g1, true); c = g1; }
    seg(c, x1);
  }
  function wallV(x, z0, z1, gaps = []) {
    let c = z0;
    const seg = (a, e) => { if (e - a > 0.01) { b.box(x, (a + e) / 2, T, e - a, H, 'wall'); trim(x, (a + e) / 2, e - a, false); } };
    for (const [g0, g1] of gaps) { seg(c, g0); b.box(x, (g0 + g1) / 2, T, g1 - g0, 0.8, 'wall', { y0: 2.2, collide: false }); frame(x, g0, g1, false); c = g1; }
    seg(c, z1);
  }

  // ----- ground, shell, rooms
  b.box(0, 0, 44, 44, 0.02, 'asphalt', deco);
  b.box(0, -4, 40, 24, 0.04, 'tile', deco);
  for (const [x, z, w, d] of [[0, -21.9, 44, 0.2], [0, 21.9, 44, 0.2], [-21.9, 0, 0.2, 44], [21.9, 0, 0.2, 44]]) b.box(x, z, w, d, 1.8, 'metal'); // site fence
  wallH(8, -20, 20, [[-2.5, 2.5], [16.2, 17.8]]);       // front: automatic doors + exit-only door
  wallH(-16, -20, 20, [[0.5, 3.5]]);                    // back: dock door
  wallV(-20, -16, 8); wallV(20, -16, 8, [[-8.2, -6.7]]); // west; east with staff door
  wallH(-6, -20, 20, [[-12.5, -10.2], [-4.5, -2.2], [8, 9.8]]); // shop | back of house (two strip doors, staff door)
  wallV(4, -16, -6, [[-8.9, -6.6]]);                    // stock room | staff block
  wallH(-9, 4, 20, [[4.6, 6.2], [11, 12.4], [16, 17.6]]); // corridor | staff room, office, toilets
  wallV(9.5, -16, -9); wallV(14.5, -16, -9);
  b.box(0, -4, 40.4, 24.4, 0.25, 'roof', { y0: 3, collide: false });
  for (const x of [-16, -12, -8, 8, 12, 16]) b.mesh(['plane', 2.4, 1.1], 'windowGlow', x, 1.7, 8.12, { cast: false }); // dim shop windows
  for (const [x, z, ry] of [[0, 7.85, Math.PI], [17, 7.85, Math.PI], [8.9, -5.85, 0], [2, -15.85, 0], [19.85, -7.45, -Math.PI / 2], [11.7, -8.85, Math.PI]]) {
    b.mesh(['plane', 0.55, 0.2], 'exitGlow', x, 2.55, z, { cast: false, r: [0, ry, 0] });
  }
  const tube = (x, z) => { // fluorescent tube (visual) in a fitting: back plate and two end caps
    b.box(x, z, 1.3, 0.1, 0.06, 'tubeGlow', { y0: 2.9, collide: false, cast: false });
    b.box(x, z, 1.42, 0.16, 0.03, 'fitting', { y0: 2.96, ...deco });
    for (const e of [-0.68, 0.68]) b.box(x + e, z, 0.05, 0.12, 0.1, 'fitting', { y0: 2.88, ...deco });
  };
  for (const [x, z] of [[-11, -1], [-3, 4.5], [5, -1], [11, 3], [17, -2], [-8, -10], [-1, -11], [10, -7.5]]) tube(x, z);
  for (let x = -16; x <= 16; x += 4) for (const z of [-3, 1, 5]) tube(x, z); // ceiling panels, shop floor
  for (let x = -16; x <= 0; x += 4) for (const z of [-14, -10]) tube(x, z); // stock room
  b.light(-11.25, 2.6, 0, 40, 16, FLICKER);  // shop west (flicker)
  b.light(11, 2.6, 0.5, 40, 16, FLICKER);    // shop east (flicker)
  b.light(0, 1.6, -2.5, 18, 8, 0x66aaff);    // freezer glow
  b.light(-8, 2.6, -8.5, 36, 15, FLICKER);   // stock room (flicker)
  b.light(12, 2.4, -7.5, 10, 8, 0xff2a1a);   // corridor exit glow
  b.light(9.4, 2.5, -12.5, 16, 10, 0xffd9a0); // staff room / office
  b.light(2, 3.0, -18.5, 26, 12, 0xffb066);  // loading bay lamp
  b.light(-8, 2.7, 13, 40, 16, 0xffc27a);    // car park lamp

  // ----- generic props (each call = one disguisable prop)
  const cardboard = (x, z, s = 0.5, y0 = 0) => b.prop('cardboard box', () => {
    b.box(x, z, s, s * 0.85, s * 0.7, 'cardboard', { y0 });
    b.box(x, z, s * 0.16, s * 0.86, s * 0.7 + 0.01, 'white', { y0, collide: false, cast: false });
  });
  const cardStack = (x, z, s = 0.8, y0 = 0) => b.prop('box stack', () => {
    b.box(x, z, s, s, s * 0.7, 'cardboard', { y0 }); b.box(x + 0.04, z, s * 0.8, s * 0.8, s * 0.6, 'cardboard', { y0: y0 + s * 0.7 });
  });
  const crateStack = (x, z, n = 1, s = 1.1) => b.prop('crate stack', () => { for (let i = 0; i < n; i++) b.box(x, z, s, s, s, 'wood', { y0: i * s }); });
  const pallet = (x, z) => b.prop('pallet', () => b.box(x, z, 1.2, 0.8, 0.15, 'wood'));
  const palletStack = (x, z, h = 1.2) => b.prop('pallet stack', () => { b.box(x, z, 1.2, 0.8, 0.15, 'wood'); b.box(x, z, 1.1, 0.75, h, 'cardboard', { y0: 0.15 }); });
  const plant = (x, z) => b.prop('plant', () => {
    b.box(x, z, 0.45, 0.45, 0.45, 'stone');
    for (let i = 0; i < 3; i++) b.mesh(['ico', 0.28, 1], 'leaf', x + rnd(-0.1, 0.1), 0.75 + i * 0.25, z + rnd(-0.1, 0.1));
  });
  const bin = (x, z, mat = 'binGrey') => b.prop('bin', () => b.box(x, z, 0.45, 0.45, 0.8, mat));
  const recycle = (x, z, mat) => b.prop('recycling bin', () => { b.box(x, z, 0.8, 0.8, 1.05, mat); b.box(x, z, 0.86, 0.86, 0.06, 'dark', { y0: 1.05, collide: false }); });
  const extinguisher = (x, z) => b.prop('fire extinguisher', () => b.box(x, z, 0.2, 0.2, 0.55, 'redPlastic'));
  const cone = (x, z) => b.prop('traffic cone', () => {
    b.mesh(['cyl', 0.03, 0.17, 0.6, 10], 'hazard', x, 0.3, z);
    b.collider({ x0: x - 0.17, x1: x + 0.17, z0: z - 0.17, z1: z + 0.17, y0: 0, y1: 0.6 });
  });
  const wetSign = (x, z) => b.prop('wet floor sign', () => { b.box(x, z, 0.38, 0.32, 0.6, 'hazard'); b.box(x, z, 0.3, 0.34, 0.2, 'white', { y0: 0.2, collide: false, cast: false }); });
  const cooler = (x, z) => b.prop('water cooler', () => { b.box(x, z, 0.35, 0.35, 0.95, 'white'); b.box(x, z, 0.3, 0.3, 0.4, 'glass', { y0: 0.95, collide: false }); });
  const chair = (x, z) => b.prop('chair', () => { b.box(x, z, 0.45, 0.45, 0.45, 'redPlastic'); b.box(x, z - 0.2, 0.45, 0.06, 0.45, 'redPlastic', { y0: 0.45, collide: false }); });
  const trolley = (x, z, len = 0.95) => b.prop('trolley', () => { b.box(x, z, 0.55, len, 0.9, 'metal'); b.box(x, z + len / 2 - 0.05, 0.5, 0.05, 0.12, 'redPlastic', { y0: 1.0, collide: false }); });
  const baskets = (x, z) => b.prop('basket stack', () => { b.box(x, z, 0.42, 0.32, 0.3, 'redPlastic'); b.box(x, z, 0.42, 0.32, 0.3, 'redPlastic', { y0: 0.3 }); b.box(x, z, 0.42, 0.32, 0.3, 'redPlastic', { y0: 0.6, collide: false }); });
  const melons = (x, z) => b.prop('watermelon crate', () => {
    b.box(x, z, 0.9, 0.6, 0.45, 'wood');
    for (const dx of [-0.25, 0, 0.25]) b.mesh(['ico', 0.2, 1], 'melon', x + dx, 0.55, z + rnd(-0.08, 0.08), { s: [1, 0.85, 1.1] });
  });
  const cereal = (x, z) => b.prop('cereal box display', () => {
    b.box(x, z, 0.9, 0.5, 0.5, 'goodsYellow'); b.box(x, z, 0.7, 0.42, 0.45, 'goodsRed', { y0: 0.5 }); b.box(x, z, 0.5, 0.34, 0.4, 'goodsBlue', { y0: 0.95 });
    b.box(x, z + 0.26, 0.86, 0.02, 0.45, 'white', { y0: 0.02, collide: false, cast: false });
  });
  const produceStand = (x, z, w = 1.6, d = 0.9) => b.prop('produce stand', () => {
    b.box(x, z, w, d, 0.8, 'wood');
    b.box(x - w * 0.22, z, w * 0.5, d - 0.1, 0.14, 'produceGreen', { y0: 0.8, collide: false });
    b.box(x + w * 0.28, z, w * 0.4, d - 0.1, 0.14, ['produceRed', 'produceOrange'][(rnd(0, 2)) | 0], { y0: 0.8, collide: false });
  });
  const mopBucket = (x, z) => b.prop('mop bucket', () => { b.box(x, z, 0.4, 0.5, 0.4, 'hazard'); b.box(x + 0.12, z, 0.05, 0.05, 1.1, 'metal', { collide: false }); });
  const cage = (x, z, y0 = 0) => b.prop('roll cage', () => b.box(x, z, 0.8, 0.7, 1.6, 'metal', { y0 }));
  const bollard = (x, z) => b.prop('bollard', () => b.box(x, z, 0.22, 0.22, 0.9, 'hazard'));
  const lamp = (x, z) => b.prop('lamp post', () => { b.box(x, z, 0.12, 0.12, 2.6, 'dark'); b.mesh(['sphere', 0.2, 12, 8], 'glow', x, 2.7, z, { cast: false }); });
  const bale = (x, z) => b.prop('cardboard bale', () => b.box(x, z, 0.9, 1.0, 1.0, 'cardboard'));

  // ----- shop floor: gondola aisles along z (x = -17.5 .. -5), 3 units each with slip-through gaps; some units on legs (crouch under)
  // products: a board plus a row of small boxes per shelf level. The boxes are `inst` (one InstancedMesh for the whole shop, tinted per
  // instance via o.color); the boards are plain merged trim. Neither collides: the shelf body is the collider.
  const PAL = [0xa8322d, 0xd2a82a, 0x2f5f9a, 0x3f8a4a, 0xe6e1d3, 0xc96a2b, 0x7a4a9a, 0x2b2d33, 0x58a6b8];
  function stock(fx, z0, z1, face, y0, hmax = 0.34) { // fx: x of the shelf face; face +1 / -1: which way the products stick out
    b.box(fx + face * 0.14, (z0 + z1) / 2, 0.3, z1 - z0, 0.03, 'shelfBoard', deco);
    for (let z = z0 + 0.12; z < z1 - 0.08; z += 0.2) {
      if (mini() < 0.07) continue; // a gap: the shelf is not perfectly stocked
      b.box(fx + face * 0.14, z, 0.2, 0.17, hmax * (0.7 + mini() * 0.3), 'goods', { collide: false, cast: false, inst: true, color: PAL[(mini() * PAL.length) | 0], y0: y0 + 0.03 });
    }
  }
  function unit(cx, z0, z1, legs) {
    const cz = (z0 + z1) / 2, len = z1 - z0;
    if (legs) {
      b.box(cx, cz, 0.9, len, 0.8, 'shelf', { y0: 1.1 });
      for (const px of [-0.4, 0.4]) for (const pz of [z0 + 0.06, z1 - 0.06]) b.box(cx + px, pz, 0.08, 0.08, 1.1, 'shelf');
    } else b.box(cx, cz, 0.9, len, 1.9, 'shelf');
    for (const s of [-1, 1]) for (const y0 of legs ? [1.12, 1.5] : [0.2, 0.8, 1.4]) stock(cx + s * 0.45, z0 + 0.05, z1 - 0.05, s, y0, legs ? 0.3 : 0.34);
  }
  const layoutA = [[-5.0, -2.4], [-1.6, 1.0], [1.8, 4.4]], layoutB = [[-5.0, -3.4], [-2.6, 0.2], [1.0, 4.4]];
  [-17.5, -15.0, -12.5, -10.0, -7.5, -5.0].forEach((cx, i) => {
    const L = i % 2 ? layoutB : layoutA;
    const legs = { 0: 1, 3: 1, 4: 2 }[i]; // raised units (crouch under): gondola 0 unit 1, gondola 3 unit 1, gondola 4 unit 2
    L.forEach(([z0, z1], k) => unit(cx, z0, z1, legs === k));
  });
  for (const [z0, z1] of [[-5.0, -0.7], [0.4, 4.4]]) { // west-wall shelf with one gap
    b.box(-19.6, (z0 + z1) / 2, 0.5, z1 - z0, 1.9, 'shelf');
    for (const y0 of [0.3, 0.75, 1.2, 1.6]) stock(-19.35, z0 + 0.05, z1 - 0.05, 1, y0, 0.3);
  }
  cereal(-17.5, 4.75); cereal(-12.5, 4.75); cereal(-7.5, 4.75);

  // freezer islands (blue glow) + centre walkway
  for (const [x, z0, z1] of [[-1.9, -5.0, -0.4], [1.9, -3.0, 1.6]]) {
    b.box(x, (z0 + z1) / 2, 1.1, z1 - z0, 0.95, 'freezer');
    b.box(x, (z0 + z1) / 2, 0.8, z1 - z0 - 0.4, 0.03, 'freezerGlow', { y0: 0.95, collide: false, cast: false });
  }

  // trolley bay (front, west of doors) and baskets by the doors
  for (const x of [-10.4, -8.8, -7.2, -5.6]) b.prop('trolley stack', () => { b.box(x, 7.1, 0.55, 1.5, 0.9, 'metal'); b.box(x, 7.8, 0.5, 0.05, 0.12, 'redPlastic', { y0: 1.0, collide: false }); });
  trolley(-12.4, 6.9); trolley(-3.9, 6.6); baskets(-3.4, 7.55); baskets(3.4, 7.55);

  // checkouts (5 lanes along z) with bagging tables closing the lane back; till screens
  [6.8, 8.9, 11.0, 13.1, 15.2].forEach((x) => {
    b.box(x, 4.9, 0.8, 3.0, 0.9, 'counter');
    b.box(x - 0.1, 4.9, 0.5, 2.6, 0.04, 'dark', { y0: 0.9, collide: false });
    b.box(x + 0.22, 3.7, 0.25, 0.3, 0.25, 'dark', { y0: 0.9, collide: false });
    b.box(x + 0.22, 3.55, 0.2, 0.02, 0.14, 'tv', { y0: 1.12, collide: false, cast: false });
  });
  for (const x of [7.85, 9.95, 12.05, 14.15]) b.box(x, 6.75, 1.1, 0.4, 0.8, 'counter');
  // service desk, east strip
  b.box(18.6, 2.6, 1.6, 0.7, 1.0, 'counter'); b.box(18.6, 2.6, 1.66, 0.76, 0.04, 'dark', { y0: 1.0, collide: false });
  cooler(19.5, 5.6); plant(19.4, 7.2); plant(-19.4, 7.2); bin(16.6, 7.5); bin(17.4, 7.5);
  chair(18.0, 3.8); chair(17.1, 4.4);

  // produce: chillers along the north wall, stands, crates
  [6, 9.6, 13.2, 16.8].forEach((x) => {
    b.box(x, -5.5, 2.6, 0.7, 2.0, 'freezer');
    b.box(x, -5.12, 2.2, 0.03, 1.5, 'freezerGlow', { y0: 0.3, collide: false, cast: false });
  });
  [[5.2, -3.4], [8.2, -3.4], [11.2, -3.4], [14.2, -3.4], [6.7, -0.8], [9.7, -0.8], [12.7, -0.8], [15.7, -0.8]].forEach(([x, z]) => produceStand(x, z));
  melons(17.2, -1.4); melons(17.2, -0.5); melons(18.6, -3.8); melons(4.3, 0.3);
  crateStack(18.4, -2.3, 2); crateStack(18.4, -4.6, 1); crateStack(3.6, -4.8, 3); crateStack(16.2, 0.55, 1);
  cardboard(5.0, 1.6, 0.5); cardStack(15.9, 2.0); cardboard(11.0, 1.9, 0.6);
  wetSign(-1.2, 5.3); wetSign(10.0, 1.8); wetSign(-14.0, 5.5); wetSign(7.0, -4.8);
  cone(1.2, 2.8); cone(-14.0, -5.5); cone(14.5, 7.5);
  baskets(5.4, 7.4); baskets(-18.8, 5.4); baskets(2.8, 3.6);
  trolley(5.0, 2.7); trolley(-1.8, 5.0); trolley(16.8, 5.5);
  extinguisher(-19.7, 5.6); extinguisher(19.75, 0.3); extinguisher(-2.0, -5.75); extinguisher(8.0, -5.75);
  bin(-19.6, -5.6); bin(3.5, 6.2); bin(-3.2, -5.6); plant(-1.5, 7.2); plant(3.0, 7.2); plant(3.6, -1.7);

  // ----- back of house: stock room (pallet racks you can crouch under, crate maze, pallet lobby)
  for (const rz of [-15.4, -12.9, -10.4]) {
    for (const dz of [-0.4, 0.4]) for (let i = 0; i < 6; i++) b.box(-19.2 + i * 2.4, rz + dz, 0.1, 0.1, 2.8, 'rackBlue');
    b.box(-13.2, rz, 12.2, 0.9, 0.12, 'rackOrange', { y0: 1.15 }); // lowest deck: crouch gap underneath, too high to stand on
    for (const y0 of [1.95, 2.7]) b.box(-13.2, rz, 12.2, 0.9, 0.08, 'rackOrange', { y0, collide: false });
    for (let i = 0; i < 4; i++) b.box(-18 + i * 3.2 + rnd(-0.3, 0.3), rz, 0.6, 0.6, 0.6, 'cardboard', { y0: 1.27, collide: false });
    for (let i = 0; i < 3; i++) b.box(-17 + i * 3.8 + rnd(-0.3, 0.3), rz, 0.6, 0.6, 0.5, 'cardboard', { y0: 2.03, collide: false });
  }
  [[-18.2, -15.4], [-14.6, -12.9], [-9.2, -10.4], [-16.4, -10.4], [-11.6, -15.4]].forEach(([x, z]) => pallet(x, z)); // pallets under the racks
  // strip curtains in the two doorways
  for (const [a, e] of [[-12.5, -10.2], [-4.5, -2.2]]) for (let x = a + 0.2; x < e - 0.1; x += 0.3) b.box(x, -6, 0.26, 0.04, 2.0, 'strip', { y0: 0.15, collide: false, cast: false });
  // pallet lobby south of the racks
  [[-17.4, -8.6], [-16.0, -7.0], [-14.2, -8.9]].forEach(([x, z]) => palletStack(x, z, 1.2));
  [[-8.6, -8.4, 1.8], [-7.2, -7.0, 0.9], [-9.8, -6.7, 1.2]].forEach(([x, z, h]) => palletStack(x, z, h));
  cage(-6.8, -9.3); cage(-8.2, -6.7);
  cardStack(-19.4, -9.3); cardboard(-6.9, -14.6, 0.6); cardboard(-6.8, -13.8, 0.5);
  // crate maze (east stock room)
  [[-5.4, -13.4, 2], [-4.3, -13.4, 1], [-3.2, -13.4, 2], [-1.0, -13.4, 1], [0.1, -13.4, 2],
   [-5.9, -10.9, 1], [-4.8, -10.9, 2], [-2.0, -10.9, 1], [-0.9, -10.9, 2], [0.2, -10.9, 1], [1.3, -10.9, 1],
   [-4.6, -8.4, 1], [-3.5, -8.4, 2], [0.6, -8.4, 1], [1.7, -8.4, 2], [2.8, -8.4, 1]].forEach(([x, z, n]) => crateStack(x, z, n));
  palletStack(2.8, -13.2, 1.3); palletStack(-3.0, -15.2, 1.0);
  cardboard(3.4, -15.5, 0.5); cardboard(3.5, -14.7, 0.45); cardboard(-2.2, -7.2, 0.5); cardStack(3.2, -6.7);
  extinguisher(3.8, -9.8); extinguisher(-19.8, -14.0); wetSign(-10.4, -8.2); mopBucket(-12.4, -6.7); bin(3.5, -12.3);

  // ----- corridor (z -8.9 .. -6.1)
  extinguisher(10.0, -8.75); mopBucket(15.0, -8.6); cardboard(19.4, -8.5, 0.5); cardStack(5.0, -8.4); cooler(4.5, -6.6); wetSign(12.8, -6.5); bin(19.5, -6.5);

  // ----- staff room: locker alcoves (stand inside), locker bank, high table, sofa
  for (const x of [4.6, 5.66, 6.72, 7.78]) b.box(x, -15.55, 0.06, 0.7, 2.0, 'locker');
  for (const x of [5.13, 6.19, 7.25]) { b.box(x, -15.88, 0.95, 0.03, 1.9, 'locker', { collide: false, cast: false }); b.box(x, -15.2, 0.95, 0.04, 0.04, 'metal', { y0: 1.5, collide: false }); }
  b.box(9.2, -13.6, 0.5, 3.0, 1.9, 'locker');
  b.prop('staff table', () => {
    b.box(6.2, -12.2, 1.6, 0.9, 0.06, 'wood', { y0: 1.1 });
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(6.2 + dx * 0.73, -12.2 + dz * 0.38, 0.07, 0.07, 1.1, 'wood', { collide: false });
  });
  chair(4.95, -12.2); chair(7.45, -12.2);
  b.prop('sofa', () => {
    b.box(8.0, -10.0, 2.0, 1.0, 0.45, 'fabricBlue'); b.box(8.0, -10.38, 2.0, 0.25, 0.9, 'fabricBlue');
    b.box(7.1, -10.0, 0.2, 1.0, 0.65, 'fabricBlue'); b.box(8.9, -10.0, 0.2, 1.0, 0.65, 'fabricBlue');
  });
  b.prop('fridge', () => b.box(4.55, -9.6, 0.8, 0.7, 1.8, 'metal'));
  cooler(9.0, -9.5); bin(4.6, -14.0); plant(9.0, -15.6);

  // ----- manager's office
  b.prop('manager desk', () => {
    b.box(12.0, -12.6, 1.6, 0.9, 0.06, 'wood', { y0: 1.1 });
    b.box(11.225, -12.6, 0.05, 0.9, 1.1, 'wood'); b.box(12.775, -12.6, 0.05, 0.9, 1.1, 'wood'); b.box(12.0, -13.025, 1.5, 0.05, 1.1, 'wood');
    b.box(12.4, -12.6, 0.4, 0.02, 0.25, 'tv', { y0: 1.16, collide: false, cast: false });
  });
  chair(13.3, -12.0);
  for (const x of [12.9, 13.5, 14.1]) b.prop('filing cabinet', () => b.box(x, -14.6, 0.6, 1.0, 1.3, 'metal'));
  b.prop('bookshelf', () => { b.box(9.8, -12.0, 0.36, 1.8, 2.0, 'wood'); b.books(9.8, -12.0, 1.8); });
  plant(14.0, -9.6); bin(10.2, -9.5); cardboard(10.3, -15.5, 0.5); extinguisher(14.3, -10.5);

  // ----- toilets: four stalls (partitions with gaps, doors half open as non-colliding panels), sinks
  for (const x of [15.9, 17.2, 18.5]) b.box(x, -15.05, 0.05, 1.7, 1.8, 'white', { y0: 0.15 });
  [[15.25, 1.1], [16.55, -0.9], [17.85, 1.3], [19.2, -1.0]].forEach(([x, ry]) => {
    b.box(x, -15.55, 0.4, 0.6, 0.4, 'white'); // pan
    b.box(x, -15.8, 0.35, 0.2, 0.5, 'white', { y0: 0.4, collide: false });
    b.box(x + (ry > 0 ? -0.35 : 0.35), -14.5, 0.8, 0.04, 1.7, 'locker', { y0: 0.15, collide: false, ry }); // half-open stall door
  });
  b.box(19.6, -11.7, 0.5, 2.0, 0.9, 'counter'); b.box(19.88, -11.7, 0.04, 1.8, 1.0, 'glass', { y0: 1.1, collide: false, cast: false });
  wetSign(16.8, -10.4); bin(14.9, -9.5); mopBucket(19.4, -10.0); cardboard(19.5, -9.6, 0.4);

  // ----- loading bay (z -22 .. -16): lorry with open back + 3-step ramp, roll cages, skip
  // The load bed is 0.14 high so the AI nav grid (which ignores anything under 0.15) treats the lorry as floor and hiders can path
  // inside; the ramp rises 0.045 per tread (the player steps up <= 0.3 anyway).
  const BED = 0.14;
  for (let k = 1; k <= 3; k++) b.box(5.6 + (k - 0.5) * 0.47, -19.5, 0.47, 1.6, 0.045 * k, 'dark');
  b.box(11, -19.5, 8, 2.6, BED, 'lorry');                            // load bed
  b.box(11, -20.75, 8, 0.1, 2.5, 'lorry', { y0: BED }); b.box(11, -18.25, 8, 0.1, 2.5, 'lorry', { y0: BED });
  b.box(14.95, -19.5, 0.1, 2.4, 2.5, 'lorry', { y0: BED });
  b.box(11, -19.5, 8.1, 2.7, 0.1, 'lorry', { y0: 2.8, collide: false });
  b.box(16.1, -19.5, 2.2, 2.6, 2.3, 'lorryBlue'); b.box(17.22, -19.5, 0.03, 2.0, 0.9, 'glass', { y0: 1.3, collide: false, cast: false });
  for (const [x, z] of [[8.5, -21.0], [13.5, -21.0], [8.5, -18.0], [13.5, -18.0], [16.4, -21.0], [16.4, -18.0]]) b.mesh(['cyl', 0.5, 0.5, 0.35, 14], 'dark', x, 0.5, z, { r: [Math.PI / 2, 0, 0] });
  cage(14.3, -20.2, BED); cage(11.4, -18.75, BED); cardboard(12.4, -20.45, 0.6, BED); cardStack(8.6, -20.2, 0.8, BED); // lorry cargo (y0 follows the bed)
  b.prop('skip', () => { b.box(-12, -19.2, 3.2, 1.6, 1.3, 'binGreen'); b.box(-12, -19.2, 3.3, 1.7, 0.06, 'dark', { y0: 1.3, collide: false }); });
  cage(-5.5, -18.8); cage(-3.9, -19.4); cage(-7.2, -17.3); cage(-4.4, -17.2); cage(5.5, -17.2);
  palletStack(-15.0, -17.4, 1.0); palletStack(-19.4, -18.2, 1.4); cardboard(-9.4, -17.6, 0.55); cardStack(-14.5, -20.9);
  bin(0.6, -17.4); bin(3.8, -17.2); wetSign(2.0, -17.0); cone(-1.4, -17.6); cone(4.8, -18.6); mopBucket(-2.4, -20.6); extinguisher(-0.4, -15.75);

  // ----- outside: side corridors, car park
  bale(-21.3, -6.0); bale(-21.3, -4.8); bale(21.6, -3.0); bale(21.6, -1.7); cardStack(-21.2, 6.0);
  const car = (x, z, along, mat) => {
    const w = along ? 1.8 : 4.2, d = along ? 4.2 : 1.8;
    b.prop('car', () => {
      b.box(x, z, w, d, 0.65, mat, { y0: 0.3 });
      b.box(x, z, along ? 1.6 : 2.2, along ? 2.2 : 1.6, 0.55, 'glass', { y0: 0.95 });
      b.box(x, z, along ? 1.5 : 2.0, along ? 2.0 : 1.5, 0.04, mat, { y0: 1.5, collide: false });
      for (const sx of [-0.9, 0.9]) for (const sz of [-1.4, 1.4]) b.mesh(['cyl', 0.35, 0.35, 0.25, 12], 'dark', x + (along ? sx : sz), 0.35, z + (along ? sz : sx), { r: along ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
    });
  };
  car(-17, 15.6, true, 'car'); car(-13.3, 15.6, true, 'carGrey'); car(13.0, 15.2, true, 'carRed'); car(16.6, 15.2, true, 'car');
  car(-3.0, 18.4, true, 'carGrey'); car(4.0, 18.5, false, 'carRed'); car(-9.8, 11.2, false, 'car');
  for (const x of [-11.4, -9.4, -7.4, -5.4, -3.4, 3.4, 5.4, 7.4, 9.4, 11.4]) bollard(x, 9.4);
  recycle(-19.5, 9.7, 'binGreen'); recycle(-18.3, 9.7, 'binBlue'); recycle(-17.1, 9.7, 'binGrey'); recycle(19.2, 9.7, 'binBlue'); recycle(17.9, 9.7, 'binGreen'); recycle(16.7, 9.7, 'binGrey');
  trolley(-8.0, 12.5); trolley(7.0, 12.0); bin(-1.8, 9.6); bin(1.8, 9.6); cone(8.0, 10.5); cone(-12.5, 12.0);
  wetSign(2.8, 8.6); cardboard(-4.2, 9.8, 0.5); plant(-2.6, 8.7); plant(2.6, 8.7);
  lamp(-8, 13); lamp(8, 12);
  for (const x of [-17.7, -11.2, -4.7, 1.8, 8.3, 14.8]) b.box(x, 20.3, 5.0, 1.0, 1.6, 'hedge'); // hedge line with 1.5 m gaps
  b.box(19.9, 20.3, 3.4, 1.0, 1.6, 'hedge');

  // ----- decoration: parking bay lines
  for (const x of [-18.9, -15.2, -11.5, 11.2, 14.8, 18.4]) b.box(x, 15.4, 0.08, 4.8, 0.02, 'white', { y0: 0.02, collide: false, cast: false });

  // ===== remaster detail (adds no props until the appended ones; ids 193+ are new)
  b.box(0, -4, 40, 24, 0.03, 'ceiling', { y0: 2.96, ...deco }); // suspended ceiling under the roof slab
  for (const x of [-20, -10, 0, 10, 20]) b.box(x, -4, 0.06, 24, 0.04, 'fitting', { y0: 2.93, ...deco }); // ceiling grid rails
  // shop windows: frame + glass + inside plane, on both faces (the outside glow planes above stay)
  for (const x of [-16, -12, -8, 8, 12, 16]) {
    for (const side of [1, -1]) {
      const z = 8 + side * (T / 2 + 0.025);
      for (const dy of [-0.55, 0.55]) b.box(x, z, 2.5, 0.05, 0.06, 'trim', { ...deco, y0: 1.7 + dy - 0.03 });
      for (const dx of [-1.22, 0, 1.22]) b.box(x + dx, z, 0.06, 0.05, 1.1, 'trim', { ...deco, y0: 1.15 });
      b.mesh(['plane', 2.4, 1.1], 'glassPane', x, 1.7, 8 + side * (T / 2 + 0.005), { cast: false, r: [0, side > 0 ? 0 : Math.PI, 0] });
    }
    b.mesh(['plane', 2.4, 1.1], 'windowGlow', x, 1.7, 8 - (T / 2 + 0.003), { cast: false, r: [0, Math.PI, 0] });
  }
  // signage (no brands: plain wayfinding). hang(): a board on two rods, readable from both sides.
  const sign = (name, x, y, z, w, h, ry = 0) => b.mesh(['plane', w, h], name, x, y, z, { cast: false, r: [0, ry, 0] });
  const hang = (name, x, y, z, w = 1.3, h = 0.33) => {
    sign(name, x, y, z + 0.02, w, h); sign(name, x, y, z - 0.02, w, h, Math.PI);
    for (const dx of [-w * 0.4, w * 0.4]) b.box(x + dx, z, 0.02, 0.02, 2.96 - (y + h / 2), 'fitting', { y0: y + h / 2, ...deco });
  };
  [-17.5, -15, -12.5, -10, -7.5, -5].forEach((cx, i) => hang(`sign_a${i + 1}`, cx, 2.45, 4.8));
  hang('sign_fresh', 11, 2.35, -4.9, 2.6, 0.65); hang('sign_chilled', 0, 2.4, -1.3, 1.5, 0.38); hang('sign_checkout', 11, 2.45, 2.6, 2.2, 0.55);
  sign('sign_staff', 8.9, 2.0, -5.89, 0.9, 0.22); sign('sign_stock', -11.35, 2.45, -5.89, 1.4, 0.35); sign('sign_stock', -3.35, 2.45, -5.89, 1.4, 0.35);
  sign('sign_bay', 2, 2.6, -15.89, 2.0, 0.5); sign('sign_wc', 16.8, 2.45, -8.89, 0.9, 0.22); sign('sign_office', 11.7, 2.45, -8.89, 0.9, 0.22);
  sign('sign_open', 0, 2.6, 8.13, 2.6, 0.65);
  // lorry interior: ribbed walls, a light strip, a hazard edge on the load bed and the tail
  for (let x = 7.6; x < 14.8; x += 0.8) for (const z of [-20.68, -18.32]) b.box(x, z, 0.08, 0.04, 2.3, 'fitting', { y0: BED, ...deco });
  b.box(11, -19.5, 6, 0.14, 0.03, 'tubeGlow', { y0: 2.77, ...deco });
  b.mesh(['plane', 0.5, 2.4], 'decal_hazard', 7.2, BED + 0.004, -19.5, { cast: false, r: [-Math.PI / 2, 0, 0] });
  b.mesh(['plane', 3.2, 0.5], 'decal_hazard', 2.0, 0.047, -16.45, { cast: false, r: [-Math.PI / 2, 0, 0] }); // dock door threshold
  // floor decals: grime, scuffs along the aisles, rain by the front doors, loading-bay arrows
  for (const [x, z, k] of [[-1.9, -2.6, 0.3], [1.9, -0.8, 1.2], [11, 0.8, 2.1], [-6, -9, 0.7], [-8.5, 6, 0.1]]) b.mesh(['plane', 2.2, 2.2], 'decal_stain', x, 0.047, z, { cast: false, r: [-Math.PI / 2, 0, k] });
  for (const [x, z, k] of [[-11.25, 0, 0], [0, 1.5, 1.4], [11, -2.2, 0.5], [-14, -10, 2.2], [4, -7.5, 1.1]]) b.mesh(['plane', 2.8, 2.8], 'decal_scuff', x, 0.047, z, { cast: false, r: [-Math.PI / 2, 0, k] });
  b.mesh(['plane', 2.4, 1.6], 'decal_puddle', -1.0, 0.047, 6.6, { cast: false, r: [-Math.PI / 2, 0, 0.3] }); b.mesh(['plane', 1.6, 1.2], 'decal_puddle', 1.6, 0.047, 6.2, { cast: false, r: [-Math.PI / 2, 0, 1] });
  for (const [x, z] of [[0, -18.8], [6, -18.8]]) b.mesh(['plane', 1.4, 0.9], 'decal_arrow', x, 0.025, z, { cast: false, r: [-Math.PI / 2, 0, 0] });
  b.mesh(['plane', 1.4, 0.9], 'decal_arrow', -2.0, 0.025, -20.4, { cast: false, r: [-Math.PI / 2, 0, Math.PI] });

  // ----- appended props (ids 193+): new disguise options, never insert above this line
  b.prop('vending machine', () => { b.box(13.0, -8.6, 0.9, 0.8, 1.9, 'redPlastic'); b.box(13.0, -8.18, 0.7, 0.02, 1.2, 'freezerGlow', { y0: 0.5, collide: false, cast: false }); b.box(13.0, -8.18, 0.7, 0.03, 0.2, 'dark', { y0: 0.2, collide: false, cast: false }); });
  b.prop('pallet jack', () => { b.box(-0.2, -19.8, 0.5, 1.5, 0.12, 'redPlastic', { y0: 0.08 }); b.box(-0.2, -20.65, 0.1, 0.1, 1.0, 'dark', { collide: false }); });
  b.prop('gas cylinder', () => { b.mesh(['cyl', 0.13, 0.13, 1.2, 12], 'metal', -17.4, 0.6, -20.7); b.mesh(['sphere', 0.13, 10, 6], 'metal', -17.4, 1.2, -20.7); b.collider({ x0: -17.53, x1: -17.27, z0: -20.83, z1: -20.57, y0: 0, y1: 1.3 }); });
  b.prop('gas cylinder', () => { b.mesh(['cyl', 0.13, 0.13, 1.2, 12], 'metal', -17.0, 0.6, -20.7); b.mesh(['sphere', 0.13, 10, 6], 'metal', -17.0, 1.2, -20.7); b.collider({ x0: -17.13, x1: -16.87, z0: -20.83, z1: -20.57, y0: 0, y1: 1.3 }); });
  b.prop('ladder', () => { b.box(-19.7, -7.4, 0.1, 0.5, 1.8, 'rackOrange'); for (let k = 0; k < 5; k++) b.box(-19.66, -7.4, 0.04, 0.46, 0.04, 'metal', { y0: 0.25 + k * 0.32, collide: false }); });
  b.prop('hand truck', () => { b.box(-1.5, -17.0, 0.4, 0.06, 1.1, 'rackBlue'); b.box(-1.5, -16.88, 0.4, 0.2, 0.03, 'dark', { y0: 0.02 }); });
}
