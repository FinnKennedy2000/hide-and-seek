// "Coldwood Farm": the authored 132 x 132 m estate from the COLDWOOD Farm Map Pack (original, procedurally authored; see ASSETS.md),
// the Trial-mode map. The visuals are one GLB (public/models/map/coldwood_estate.glb, built by scripts/estate/glb.mjs, loaded by
// src/world/mapglb.js); everything gameplay-side comes from coldwood_data.js, which scripts/estate/import.mjs generates from the pack's
// data/gameplay.json + data/colliders.json with the ground flattened to y = 0 exactly as in the GLB (scripts/estate/field.mjs).
// Eight districts around a barn crossroads, a service ring road and cross lanes; north is -z, east +x:
//   barn (centre), chapel (NW), timber (N, by the north gate), farmhouse (NE), pump (E), marsh / Reedwater (SE), scrapyard (S, by the
//   south gate), hayfield (W). 8 relic candidates (6 live per round, picked by src/shared/trialpick.js), 2 gates (north / south), 5 cages,
//   20 hider starts, 16 vault windows (1.05 m sills, collider 1.2 m so only the vault action crosses them), 28 tall-grass patches whose
//   inset cores are the concealment rects. Same builder API as the other maps; colliders only (no b.box visuals: the GLB draws everything).
import { COLLIDERS, RELICS, GATES, CAGES, SPAWNS, SEEKER, VAULTS, GRASS, DISTRICTS } from './coldwood_data.js';

const B = 66; // the fence line
const zoneOf = (d) => ({ barn: { reverb: 'hall', surface: 'wood' }, chapel: { reverb: 'room', surface: 'concrete' }, pump: { reverb: 'room', surface: 'concrete' } }[d.id] || { reverb: 'outdoor', surface: 'grass' });

export const meta = {
  id: 'coldwood', name: 'Coldwood Farm', size: 132, blurb: 'A 132 m farm estate: barn, chapel ruin, timberworks, orchard house, pump station, reed pond, salvage yard and hayfield. Wire three fuses and get out.',
  players: { min: 4, max: 8, recommended: '6-8' }, thumbnail: '/thumbs/coldwood.webp',
  glb: '/models/map/coldwood_estate.glb', // client: the whole visible map (src/world/mapglb.js); the server never loads it
  // lighting: data/lighting_reference.json (hemisphere / directional / fog colours), x1.12 for its exposure; fog pulled in to 40-150 m so
  // the far side of a 132 m map is not one open sightline. Characters keep their own materials (nothing is brightened for them).
  fog: { color: 0x7d8979, near: 40, far: 150 }, sky: 'dusk', skyTint: { mid: 0x8e9a90, top: 0x6f7f88 }, // overcast: the reference background #7d8979 up to a cool grey
  ambient: { color: 0xd3dfc7, ground: 0x53513b, intensity: 1.6 * 1.12 }, sun: { color: 0xffe3b0, intensity: 2.8 * 1.12, dir: [-55, 75, -45], follow: true },
  seekerStart: { x: SEEKER.x, z: SEEKER.z, yaw: SEEKER.yaw },
  bounds: { x0: -B + 0.4, x1: B - 0.4, z0: -B + 0.4, z1: B - 0.4 },
  outdoor: { reverb: 'outdoor', surface: 'grass' },
  zones: [
    ...DISTRICTS.map((d) => { const box = { x0: d.x - d.w / 2, x1: d.x + d.w / 2, z0: d.z - d.d / 2, z1: d.z + d.d / 2 }; return { name: d.name, ...box, box, ...zoneOf(d) }; }),
    ...GRASS.map((g) => { const box = { x0: g.outer.x0, x1: g.outer.x1, z0: g.outer.z0, z1: g.outer.z1 }; return { name: `grass ${g.id}`, ...box, box, reverb: 'outdoor', surface: 'grass' }; }),
  ],
};

export const materials = {};
export const mix = [['grass', 2], ['barn', 1], ['ruin', 1], ['junk', 1]];

// AI hiding spots (single-player AI + tests): two points in every grass core, plus the hider starts tagged by their district
const near = (x, z) => DISTRICTS.reduce((a, d) => (Math.hypot(d.x - x, d.z - z) < Math.hypot(a.x - x, a.z - z) ? d : a));
const KIND = { barn: 'barn', chapel: 'ruin', farmhouse: 'ruin', scrapyard: 'junk', timber: 'junk', pump: 'junk' };
export const spots = [
  ...GRASS.flatMap((g) => { const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2, alongX = g.x1 - g.x0 > g.z1 - g.z0, o = (alongX ? g.x1 - g.x0 : g.z1 - g.z0) / 4;
    return [-1, 1].map((s) => ({ x: +(alongX ? cx + s * o : cx).toFixed(2), z: +(alongX ? cz : cz + s * o).toFixed(2), kind: 'grass', crouch: true })); }),
  ...SPAWNS.map((h) => ({ x: h.x, z: h.z, kind: KIND[near(h.x, h.z).id] || 'grass', crouch: true })),
];
export const spawns = SPAWNS.map((h) => [h.x, h.z]);

export const trial = {
  relics: RELICS.map((r) => [r.x, r.z]), relicIds: RELICS.map((r) => r.id),
  gates: GATES.map((g) => [g.x, g.z]), cages: CAGES.map((c) => [c.x, c.z]),
  grass: GRASS.map((g) => ({ x0: g.x0, x1: g.x1, z0: g.z0, z1: g.z1 })), // the inset cover cores: concealment + the server's trial.grass
  vaults: VAULTS.map((v) => ({ x: v.x, z: v.z, ax: v.ax, w: v.w, h: v.h, sill: v.sill })),
  hiderSpawns: spawns, seekerStart: meta.seekerStart,
  scenery: true, // the GLB already has the relic stations, gates and cages: the client FX only adds the lamps / rings / silhouettes
};

// lantern posts (the GLB's Lantern_Posts instances): one warm point light each; capLights keeps the nearest 2-16 per preset
const LANTERNS = COLLIDERS.filter((c) => c.id.startsWith('lantern_post')).map((c) => [(c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2]);

export function build(b) {
  for (const c of COLLIDERS) { const { id, ...box } = c; void id; b.collider(box); }
  for (const [x, z] of LANTERNS) b.light(x + 0.5, 2.6, z, 14, 11, 0xffb060);
  b.light(0, 3.2, 2, 22, 14, 0xffb060); // barn workbench (relic R8): the barn interior is otherwise the darkest room on the map
}
