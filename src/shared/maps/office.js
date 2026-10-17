// "Open Plan": a dark office floor after hours. ~30x22 m, the smallest map (2-4 players). +z is the lobby (south), -z the kitchen / print / server strip.
// Same builder API as lateshop.js (b.box / mesh / collider / light / prop). No THREE, no DOM. Material names are prefixed `of_` (the client's material table is global).
// Gameplay constants (game.js): player radius 0.3, crouch height 1.0 (desk tops sit at 1.1 so you can crouch under them), standing 1.7, jump apex ~0.9.
// Lit by emissive ceiling panels and screens; only 4 point lights.

export const meta = {
  id: 'office', name: 'Open Plan', size: 30, blurb: 'An office floor after hours. Cubicles, glass meeting rooms and a humming server room.',
  players: { min: 2, max: 4, recommended: '2-4' }, thumbnail: '/thumbs/office.webp',
  fog: { color: 0x10141c, near: 10, far: 55 }, sky: 'night',
  ambient: { color: 0xb8c4e0, ground: 0x5c6480, intensity: 1.45 },
  seekerStart: { x: 9, z: 6.4, yaw: 0 }, // lobby (server spreads seekers along x by 1.4)
  bounds: { x0: -15, x1: 15, z0: -11, z1: 11 },
  blink: ['of_ledG', 'of_ledR'], // emissive materials the client may pulse (server-room LEDs)
  outdoor: { reverb: 'outdoor', surface: 'concrete' }, // anywhere outside a zone
  zones: [ // rooms for culling + audio (first match wins, see src/audio/zones.js): flat x0..z1 (audio) and the same rectangle as `box` (culling); reverb room|hall|outdoor; surface wood|tile|grass|concrete
    { name: 'open plan', x0: -15, x1: 3.5, z0: -3, z1: 11, box: { x0: -15, x1: 3.5, z0: -3, z1: 11 }, reverb: 'room', surface: 'wood' },
    { name: 'kitchen', x0: -15, x1: -6, z0: -11, z1: -3, box: { x0: -15, x1: -6, z0: -11, z1: -3 }, reverb: 'room', surface: 'tile' },
    { name: 'print room', x0: -6, x1: 5, z0: -11, z1: -3, box: { x0: -6, x1: 5, z0: -11, z1: -3 }, reverb: 'room', surface: 'tile' },
    { name: 'server room', x0: 5, x1: 15, z0: -11, z1: -3, box: { x0: 5, x1: 15, z0: -11, z1: -3 }, reverb: 'room', surface: 'concrete' },
    { name: 'glass maze', x0: 3.5, x1: 15, z0: -3, z1: 4.5, box: { x0: 3.5, x1: 15, z0: -3, z1: 4.5 }, reverb: 'room', surface: 'wood' },
    { name: 'lobby', x0: 3.5, x1: 15, z0: 4.5, z1: 11, box: { x0: 3.5, x1: 15, z0: 4.5, z1: 11 }, reverb: 'hall', surface: 'tile' },
  ],
};

export const materials = {
  of_carpet: { color: 0x3a4152, roughness: 1 },
  of_tile: { color: 0xb9bec4, roughness: 0.35, emissive: 0x2a3038, emissiveIntensity: 0.5 },
  of_floorDark: { color: 0x22262c, roughness: 0.6 },
  of_wall: { color: 0xc9c6bf, roughness: 0.95 },
  of_part: { color: 0x6f7f95, roughness: 0.95 },
  of_ceiling: { color: 0x2a2d34, roughness: 0.9 },
  of_glass: { color: 0x8fb4d0, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.32, depthWrite: false },
  of_wood: { color: 0x9a6b43, roughness: 0.7 },
  of_white: { color: 0xe6e4de, roughness: 0.6 },
  of_steel: { color: 0xa5abb4, roughness: 0.35, metalness: 0.6 },
  of_dark: { color: 0x25272d, roughness: 0.6 },
  of_fabric: { color: 0x3c5a7a, roughness: 1 },
  of_fabricOrange: { color: 0xc26a2c, roughness: 1 },
  of_leaf: { color: 0x2f6b3a, roughness: 0.9, flatShading: true },
  of_pot: { color: 0xb5b0a6, roughness: 0.9 },
  of_cardboard: { color: 0xa88458, roughness: 0.9 },
  of_rack: { color: 0x1b1e24, roughness: 0.4, metalness: 0.5 },
  of_vend: { color: 0x2d4e9a, roughness: 0.4, emissive: 0x3a6cff, emissiveIntensity: 0.9 },
  of_tube: { color: 0x2a2e2a, roughness: 0.5, emissive: 0xe8f0ff, emissiveIntensity: 3.0 },
  of_screen: { color: 0x050508, roughness: 0.4, emissive: 0x4a7cff, emissiveIntensity: 1.0 },
  of_ledG: { color: 0x061006, roughness: 0.5, emissive: 0x35ff6a, emissiveIntensity: 2.6 },
  of_ledR: { color: 0x100606, roughness: 0.5, emissive: 0xff3a2a, emissiveIntensity: 2.6 },
  of_windowGlow: { color: 0x101820, roughness: 0.5, emissive: 0x4a6a9a, emissiveIntensity: 0.9 },
  of_exit: { color: 0x200000, roughness: 0.5, emissive: 0xff2a1a, emissiveIntensity: 2.2 },
  of_cooler: { color: 0x7fb7e8, roughness: 0.2, emissive: 0x3a7ac0, emissiveIntensity: 0.7 },
};

export const mix = [['cubicle', 2], ['kitchen', 1], ['server', 1], ['lobby', 1]];
export const spots = [
  // cubicles: under the desks (crouch) and behind partitions
  ...[-13.5, -10.5, -7.5, -4.5, -1.5, 1.5].map((x) => ({ x, z: 1.0, kind: 'cubicle', crouch: true })),
  ...[-13.5, -10.5, -7.5, -4.5, -1.5, 1.5].map((x) => ({ x, z: 2.0, kind: 'cubicle', crouch: true })),
  { x: -13.5, z: 10.4, kind: 'cubicle', crouch: true }, { x: -7.5, z: 10.4, kind: 'cubicle', crouch: true }, { x: -1.5, z: 10.4, kind: 'cubicle', crouch: true },
  { x: -10.5, z: 8.2, kind: 'cubicle', crouch: false }, { x: 1.5, z: 8.2, kind: 'cubicle', crouch: false }, { x: -14.5, z: -2.2, kind: 'cubicle', crouch: false },
  // kitchen
  { x: -14.4, z: -7.6, kind: 'kitchen', crouch: false }, { x: -9.5, z: -7.0, kind: 'kitchen', crouch: true }, { x: -12.4, z: -5.0, kind: 'kitchen', crouch: false },
  { x: -7, z: -9.55, kind: 'kitchen', crouch: false }, { x: -6.6, z: -4.45, kind: 'kitchen', crouch: true },
  // print room
  { x: -4.9, z: -9.8, kind: 'print', crouch: false }, { x: -1.0, z: -9.6, kind: 'print', crouch: true }, { x: 3.9, z: -10.0, kind: 'print', crouch: false }, { x: 3.9, z: -4.0, kind: 'print', crouch: true },
  { x: -2.8, z: -6.4, kind: 'print', crouch: true },
  // server room
  { x: 6.0, z: -8.2, kind: 'server', crouch: true }, { x: 10.2, z: -8.2, kind: 'server', crouch: true }, { x: 14.2, z: -8.2, kind: 'server', crouch: false }, { x: 9.8, z: -9.8, kind: 'server', crouch: true },
  { x: 13.4, z: -4.4, kind: 'server', crouch: false }, { x: 7.2, z: -4.4, kind: 'server', crouch: false },
  // glass maze
  { x: 5.3, z: -0.8, kind: 'maze', crouch: true }, { x: 4.4, z: 3.4, kind: 'maze', crouch: false }, { x: 8.8, z: 3.4, kind: 'maze', crouch: false }, { x: 8.8, z: -1.8, kind: 'maze', crouch: true },
  { x: 12.8, z: -1.6, kind: 'maze', crouch: true }, { x: 13.2, z: 2.6, kind: 'maze', crouch: false }, { x: 12.0, z: 0.4, kind: 'maze', crouch: false },
  // lobby
  { x: 12.0, z: 9.7, kind: 'lobby', crouch: true }, { x: 7.2, z: 10.3, kind: 'lobby', crouch: false }, { x: 14.2, z: 6.2, kind: 'lobby', crouch: false }, { x: 6.4, z: 7.3, kind: 'lobby', crouch: true },
  { x: 13.0, z: 10.2, kind: 'lobby', crouch: false },
];
export const spawns = [
  [-13.5, 5.6], [-8.0, 5.6], [-3.0, 5.6], [1.5, 5.6], [-12.0, -2.2], [-6.0, -2.2], [0, -2.2], [-9.5, -4.2], [-10.5, -9.0],
  [-3.0, -4.5], [-1.0, -7.6], [9.0, -4.5], [12.5, -9.0], [6.0, 2.6], [9.0, 2.2], [13.5, 0.2], [5.0, 7.0], [9.0, 7.5], [12.0, 6.4], [7.0, 6.5],
];

export function build(b, rnd) {
  const T = 0.2, H = 3;
  const deco = { collide: false, cast: false };
  // walls with doorways (lintel above each gap is visual only)
  function wallH(z, x0, x1, gaps = [], mat = 'of_wall', h = H) {
    let c = x0;
    const seg = (a, e) => { if (e - a > 0.01) b.box((a + e) / 2, z, e - a, T, h, mat); };
    for (const [g0, g1] of gaps) { seg(c, g0); if (h === H) b.box((g0 + g1) / 2, z, g1 - g0, T, 0.8, mat, { y0: 2.2, collide: false }); c = g1; }
    seg(c, x1);
  }
  function wallV(x, z0, z1, gaps = [], mat = 'of_wall', h = H) {
    let c = z0;
    const seg = (a, e) => { if (e - a > 0.01) b.box(x, (a + e) / 2, T, e - a, h, mat); };
    for (const [g0, g1] of gaps) { seg(c, g0); if (h === H) b.box(x, (g0 + g1) / 2, T, g1 - g0, 0.8, mat, { y0: 2.2, collide: false }); c = g1; }
    seg(c, z1);
  }
  const one = (name, mat, x, z, w, d, h, y0 = 0) => b.prop(name, () => b.box(x, z, w, d, h, mat, { y0 }));

  // ----- floors, shell, ceiling
  b.box(0, 0, 31, 23, 0.02, 'of_carpet', deco);
  b.box(-10.5, -7, 9, 8, 0.04, 'of_tile', deco);
  b.box(10, -7, 10, 8, 0.04, 'of_floorDark', deco);
  b.box(0, 0, 31, 23, 0.2, 'of_ceiling', { y0: 3, collide: false, cast: false });
  wallH(-11, -15, 15); wallH(11, -15, 15); wallV(-15, -11, 11); wallV(15, -11, 11);
  wallH(-3, -15, 15, [[-12.5, -11], [-8.5, -7], [-2.5, -1], [9, 10.5], [12.8, 14.2]]); // north strip doors
  wallV(-6, -11, -3, [[-8.5, -7]]); wallV(5, -11, -3, [[-9, -7.5]]);                       // kitchen | print | server
  wallV(3.5, -3, 11, [[-2.7, -1.2], [4.5, 6.2]]);                                          // open plan | maze + lobby
  for (const x of [-12, -8, -4, 4, 8, 12]) b.mesh(['plane', 2.4, 1.2], 'of_windowGlow', x, 1.7, 10.88, { cast: false, r: [0, Math.PI, 0] }); // south windows
  for (const x of [-12, -8]) b.mesh(['plane', 2.4, 1.2], 'of_windowGlow', x, 1.7, -10.88, { cast: false });
  for (const [x, z, ry] of [[-11.75, -2.85, Math.PI], [9.75, -2.85, Math.PI], [-1.75, -2.85, Math.PI]]) b.mesh(['plane', 0.55, 0.2], 'of_exit', x, 2.55, z, { cast: false, r: [0, ry, 0] });
  // ceiling panels (visual): they light the floor together with the 4 point lights
  for (let x = -12; x <= 0; x += 4) for (const z of [-0.5, 3.5, 8.0]) b.box(x, z, 1.4, 0.2, 0.06, 'of_tube', { y0: 2.92, ...deco });
  for (const x of [6, 10, 14]) for (const z of [-1, 2.5, 7.5]) b.box(x, z, 1.4, 0.2, 0.06, 'of_tube', { y0: 2.92, ...deco });
  for (const x of [-11, -8.5]) b.box(x, -7, 1.4, 0.2, 0.06, 'of_tube', { y0: 2.92, ...deco });
  for (const x of [-4, 0, 3]) b.box(x, -7, 1.4, 0.2, 0.06, 'of_tube', { y0: 2.92, ...deco });
  b.light(-6, 2.7, 4, 34, 17, 0xdfe8ff);   // open plan
  b.light(9, 2.6, 2, 30, 15, 0xffffff);    // glass maze + lobby
  b.light(-10, 2.5, -7, 22, 10, 0xffe2b0); // kitchen
  b.light(10, 2.2, -7, 16, 10, 0x4a6cff);  // server room (blue)

  // ----- cubicles (x -15..3.5, z -3..11): three rows of six, partitions 1.4 m high; desks have raised tops (crouch under)
  const cols = [-13.5, -10.5, -7.5, -4.5, -1.5, 1.5];
  for (const x of [-12, -9, -6, -3, 0, 3]) { wallV(x, -1.5, 1.5, [], 'of_part', 1.4); wallV(x, 1.5, 4.0, [], 'of_part', 1.4); wallV(x, 6.5, 10.9, [], 'of_part', 1.4); }
  wallH(1.5, -15, 3.5, [], 'of_part', 1.4);
  const desk = (cx, cz) => b.prop('office desk', () => {
    b.box(cx, cz, 1.7, 0.7, 0.06, 'of_wood', { y0: 1.1 });
    b.box(cx - 0.8, cz, 0.05, 0.6, 1.1, 'of_wood', { collide: false }); b.box(cx + 0.8, cz, 0.05, 0.6, 1.1, 'of_wood', { collide: false });
  });
  const chair = (cx, cz) => b.prop('office chair', () => { b.box(cx, cz, 0.5, 0.5, 0.5, 'of_fabric'); b.box(cx, cz + (cz > 5 ? -0.22 : 0.22), 0.5, 0.06, 0.55, 'of_fabric', { y0: 0.5 }); });
  cols.forEach((cx) => {
    desk(cx, 1.0); chair(cx, 0.0);
    desk(cx, 2.0); chair(cx, 2.9);
    b.box(cx, 0.75, 0.5, 0.04, 0.32, 'of_screen', { y0: 1.2, ...deco }); b.box(cx, 2.25, 0.5, 0.04, 0.32, 'of_screen', { y0: 1.2, ...deco }); // monitors (visual)
  });
  [-13.5, -7.5, -1.5].forEach((cx) => { desk(cx, 10.4); chair(cx, 9.6); b.box(cx, 10.65, 0.5, 0.04, 0.32, 'of_screen', { y0: 1.2, ...deco }); });
  one('filing cabinet', 'of_steel', -10.5, 10.5, 0.6, 0.9, 1.35); one('filing cabinet', 'of_steel', -9.7, 10.5, 0.6, 0.9, 1.35);
  b.prop('photocopier', () => { b.box(-4.5, 10.2, 1.0, 0.7, 1.0, 'of_white'); });
  b.prop('potted plant', () => { b.box(1.5, 10.2, 0.45, 0.45, 0.4, 'of_pot'); b.mesh(['ico', 0.4, 1], 'of_leaf', 1.5, 0.95, 10.2); });
  b.prop('potted plant', () => { b.box(-14.4, 6.8, 0.45, 0.45, 0.4, 'of_pot'); b.mesh(['ico', 0.4, 1], 'of_leaf', -14.4, 0.95, 6.8); });
  b.prop('water cooler', () => { b.box(-14.4, 5.4, 0.35, 0.35, 1.0, 'of_cooler'); });
  one('printer', 'of_white', -4.5, 8.0, 0.5, 0.45, 0.35, 0);
  one('cardboard box', 'of_cardboard', -5.2, 7.6, 0.5, 0.45, 0.4); one('cardboard box', 'of_cardboard', 0.6, 7.6, 0.45, 0.4, 0.35);
  one('floor lamp', 'of_steel', -12.0, 8.0, 0.25, 0.25, 1.8);
  one('bin', 'of_dark', -2.4, -1.9, 0.4, 0.4, 0.6); one('bin', 'of_dark', -3.6, 7.3, 0.4, 0.4, 0.6);
  one('fire extinguisher', 'of_ledR', -14.7, 3.0, 0.2, 0.2, 0.5);
  b.prop('whiteboard', () => { b.box(-0.2, 7.3, 1.4, 0.1, 1.7, 'of_white'); });

  // ----- kitchen (x -15..-6, z -11..-3)
  b.box(-10.5, -10.55, 8.6, 0.7, 0.9, 'of_steel'); b.box(-10.5, -10.78, 8.6, 0.3, 0.7, 'of_wood', { y0: 1.5, ...deco });
  b.prop('fridge', () => { b.box(-14.4, -8.6, 0.8, 0.8, 1.9, 'of_steel'); });
  b.prop('vending machine', () => { b.box(-14.4, -6.4, 0.9, 0.9, 1.9, 'of_vend'); });
  b.prop('high table', () => {
    b.box(-9.5, -7.0, 2.4, 1.0, 0.06, 'of_wood', { y0: 1.1 });
    for (const dx of [-1.1, 1.1]) for (const dz of [-0.4, 0.4]) b.box(-9.5 + dx, -7.0 + dz, 0.06, 0.06, 1.1, 'of_wood', { collide: false });
  });
  for (const x of [-10.5, -9.5, -8.5]) one('stool', 'of_fabricOrange', x, -5.9, 0.35, 0.35, 0.65);
  one('stool', 'of_fabricOrange', -10.5, -8.1, 0.35, 0.35, 0.65);
  b.prop('coffee machine', () => { b.box(-12.6, -10.5, 0.4, 0.4, 0.45, 'of_dark', { y0: 0.9, collide: false }); });
  b.prop('water cooler', () => { b.box(-6.8, -10.3, 0.35, 0.35, 1.0, 'of_cooler'); });
  one('bin', 'of_dark', -6.6, -3.7, 0.45, 0.45, 0.75); one('bin', 'of_dark', -13.2, -3.7, 0.45, 0.45, 0.75);
  b.prop('sofa', () => { b.box(-13.9, -4.5, 1.6, 0.9, 0.45, 'of_fabric'); b.box(-13.9, -4.9, 1.6, 0.2, 0.9, 'of_fabric'); }); // kitchen-corner sofa

  // ----- print room (x -6..5, z -11..-3)
  b.box(-0.5, -10.7, 9.4, 0.5, 1.9, 'of_part', { collide: true }); // paper shelving along the north wall
  for (const x of [-2.5, 1.5]) b.prop('photocopier', () => { b.box(x, -8.6, 1.0, 0.7, 1.0, 'of_white'); });
  for (const x of [-4.5, 3.5]) one('printer', 'of_white', x, -8.2, 0.5, 0.45, 0.35);
  b.prop('shredder', () => { b.box(-4.5, -4.0, 0.45, 0.4, 0.7, 'of_dark'); });
  b.prop('paper trolley', () => { b.box(2.8, -5.5, 0.7, 1.1, 0.9, 'of_steel'); });
  for (const [x, z, s] of [[-0.5, -5.0, 0.6], [0.3, -5.0, 0.5], [-5.2, -7.0, 0.6]]) one('cardboard box', 'of_cardboard', x, z, s, s, s * 0.8);
  b.prop('supply cupboard', () => { b.box(4.55, -6.4, 0.7, 1.2, 1.9, 'of_steel'); });
  b.prop('table', () => {
    b.box(-3.0, -6.4, 1.4, 0.8, 0.06, 'of_wood', { y0: 1.1 });
    b.box(-3.6, -6.4, 0.05, 0.7, 1.1, 'of_wood', { collide: false }); b.box(-2.4, -6.4, 0.05, 0.7, 1.1, 'of_wood', { collide: false });
  });

  // ----- server room (x 5..15, z -11..-3): two banks of racks with blinking LEDs
  const rackAt = (x, z, ry = 1) => b.prop('server rack', () => b.box(x, z, 0.9, 0.7, 2.1, 'of_rack'));
  for (const z of [-9.8, -6.4]) for (const x of [6.45, 7.35, 8.25, 11.4, 12.3, 13.2]) {
    rackAt(x, z);
    for (let k = 0; k < 4; k++) { const f = z < -8 ? 0.36 : -0.36; b.box(x - 0.2 + (k % 2) * 0.25, z + f, 0.1, 0.02, 0.05, ((x * 7 + z * 3 + k * 5) | 0) % 3 ? 'of_ledG' : 'of_ledR', { y0: 0.5 + k * 0.4, ...deco }); }
  }
  b.prop('ups cabinet', () => b.box(14.4, -4.2, 0.9, 0.9, 1.4, 'of_dark'));
  b.prop('cooling unit', () => b.box(6.0, -4.2, 0.9, 0.9, 1.9, 'of_steel'));
  one('cable drum', 'of_wood', 14.2, -9.2, 0.7, 0.7, 0.6);

  // ----- glass meeting maze (x 3.5..15, z -3..4.5): partitions are glass colliders
  const glassV = (x, z0, z1, gaps) => wallV(x, z0, z1, gaps, 'of_glass', 2.6);
  const glassH = (z, x0, x1, gaps) => wallH(z, x0, x1, gaps, 'of_glass', 2.6);
  glassV(7.0, -2.9, 1.0); glassV(10.6, 0.6, 4.4); glassH(1.0, 3.6, 7.0, [[4.3, 5.9]]);
  glassV(12.4, 1.0, 3.0); glassH(1.0, 12.4, 14.9, [[13.2, 14.4]]);
  wallH(4.5, 3.5, 15, [[7.6, 9.2], [12.2, 13.8]]); // lobby | maze (opaque wall with two doors... the lobby side is the front)
  b.prop('meeting table', () => {
    b.box(5.3, -0.8, 2.0, 1.0, 0.06, 'of_wood', { y0: 1.1 });
    for (const dx of [-0.9, 0.9]) b.box(5.3 + dx, -0.8, 0.06, 0.8, 1.1, 'of_wood', { collide: false });
  });
  b.prop('meeting table', () => {
    b.box(12.8, -1.6, 2.0, 1.0, 0.06, 'of_wood', { y0: 1.1 });
    for (const dx of [-0.9, 0.9]) b.box(12.8 + dx, -1.6, 0.06, 0.8, 1.1, 'of_wood', { collide: false });
  });
  b.prop('whiteboard', () => b.box(3.8, -1.6, 0.1, 1.6, 1.7, 'of_white'));
  b.prop('whiteboard', () => b.box(14.8, -1.6, 0.1, 1.6, 1.7, 'of_white'));
  chair(6.3, -0.8); chair(4.4, -0.8); chair(12.8, -2.6); chair(11.8, -1.6);
  b.prop('tv trolley', () => { b.box(9.0, -2.6, 1.2, 0.2, 1.6, 'of_dark'); });
  b.prop('armchair', () => { b.box(14.3, 2.2, 0.8, 0.8, 0.45, 'of_fabricOrange'); b.box(14.62, 2.2, 0.16, 0.8, 0.9, 'of_fabricOrange'); });
  b.prop('potted plant', () => { b.box(4.1, 3.9, 0.45, 0.45, 0.4, 'of_pot'); b.mesh(['ico', 0.4, 1], 'of_leaf', 4.1, 0.95, 3.9); });
  b.prop('potted plant', () => { b.box(9.8, 3.9, 0.45, 0.45, 0.4, 'of_pot'); b.mesh(['ico', 0.4, 1], 'of_leaf', 9.8, 0.95, 3.9); });
  one('bin', 'of_dark', 8.8, 0.2, 0.4, 0.4, 0.6); one('cardboard box', 'of_cardboard', 14.4, 0.0, 0.5, 0.45, 0.4);

  // ----- lobby (x 3.5..15, z 4.5..11)
  b.prop('reception desk', () => { b.box(12.0, 8.3, 3.2, 0.8, 1.1, 'of_wood'); b.box(12.0, 8.3, 3.3, 0.9, 0.06, 'of_white', { y0: 1.1 }); });
  b.box(12.1, 8.55, 0.5, 0.04, 0.32, 'of_screen', { y0: 1.2, ...deco });
  b.prop('sofa', () => { b.box(5.6, 10.4, 2.0, 0.9, 0.45, 'of_fabric'); b.box(5.6, 10.7, 2.0, 0.2, 0.9, 'of_fabric'); });
  b.prop('coffee table', () => { b.box(5.6, 9.2, 1.0, 0.6, 0.4, 'of_wood'); });
  b.prop('bench', () => { b.box(9.0, 10.5, 2.2, 0.5, 0.45, 'of_wood'); });
  for (const [x, z] of [[4.2, 6.9], [14.4, 5.4], [14.4, 10.3]]) b.prop('potted plant', () => { b.box(x, z, 0.5, 0.5, 0.45, 'of_pot'); b.mesh(['ico', 0.45, 1], 'of_leaf', x, 1.0, z); });
  one('umbrella stand', 'of_dark', 4.2, 7.9, 0.3, 0.3, 0.6); one('floor lamp', 'of_steel', 7.2, 8.2, 0.25, 0.25, 1.8); one('bin', 'of_dark', 14.4, 7.0, 0.4, 0.4, 0.6);
  b.prop('display stand', () => { b.box(10.6, 5.6, 1.2, 0.3, 1.2, 'of_part'); });
  b.prop('coat rack', () => { b.box(4.1, 9.0, 0.5, 0.5, 1.8, 'of_dark'); });
  b.prop('luggage', () => { b.box(7.6, 8.6, 0.6, 0.4, 0.7, 'of_fabricOrange', {}); });
}
