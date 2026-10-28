# Coldwood Farm estate import: results

Branch `map/coldwood-estate` (from `polish/coldwood` 07f120e). The 68 m Coldwood Yard is replaced by the authored 132 x 132 m estate from the
COLDWOOD Farm Map Pack, still map id `coldwood`. The old map stays in `src/shared/maps/coldwood_yard.js`, unregistered.

All runtime checks ran in Playwright Chromium with SwiftShader (software GL, the args from `playwright.config.js`) against the production
build (`vite build`, served by `server/index.js` on :8811). Input was real key events (W, Shift, C, E, Q, Space). There is no pointer lock, so
the harness sets `__P.yaw` / `__P.pitch` in place of the mouse. Positions were never set directly; the server would snap them back. Staged
players are ws clients moving at or under 6.5 m/s, and the server enforces its 9 m/s cap. Harness: `scratchpad/ep/*.js`, not in the repo.
Evidence is in `docs/polish/estate/`.

On walking runs (`SKY=1`), the render camera was pinned to look at the sky. Full-scene SwiftShader runs at about 1-3 fps, and the sky view
runs at about 50 fps. Movement, physics, input and the server do not depend on the camera. Every screenshot releases the camera first.

## Decisions

| Topic | Decision |
| --- | --- |
| Nav scale | `src/shared/nav.js` sizes its grid from the map bounds. Maps inside +-35 m keep the exact old 140 x 140 grid and BFS. The estate gets 268 x 268 cells at 0.5 m (72k cells), with A* (octile heuristic, binary heap), search buffers allocated once per grid, and string-pulling capped at 48 cells ahead. A 68 m path costs about 1.9 ms (200 paths: 374 ms; plain BFS was 5.5 ms). Memory is about 6 MB for the estate grid. `distField()` was added for spawn picks. |
| Terrain | The playable relief is -0.34 to +0.76 m (stdev 0.13 m). The ground is flattened to y = 0 inside the fence, so the controller and server stay flat-ground. One field (`scripts/estate/field.mjs`) re-seats the terrain vertices, every instance, every placed node, the merged building vertices, the colliders and the markers. The field fades out between 67 and 76 m, so the scenic hills keep their relief. At the pond only the raised bank is flattened, so the water stays flat in its hollow. The worst visual ground deviation anywhere a player can stand is 4.3 cm (`STATS.walkableGroundMaxDev`). |
| Payload | `coldwood_farm_web.glb` 24.6 MB / 4.02 M tris -> `public/models/map/coldwood_estate.glb` **5.50 MB** / 3.14 M tris. Steps: meshopt compression with quantization, WebP textures (max 1024), bark and prop simplification, and the scenic forest using trees with 55% of their leaf triangles. Instancing was regrouped into 44 m chunks. The tall grass is untouched. Total map payload is 5.5 MB. Characters (11.6 MB) are unchanged. The server never loads the GLB. Vite copies it from `public/`. |
| Colliders | Pack boxes and cylinders become the engine's AABBs (`scripts/estate/import.mjs`). Boxes at multiples of 90 degrees map exactly, including the cage bars' yaw. The 22 truly rotated boxes (vehicles, boulders) become AABB slices along their long axis, each at most 0.8 m long; this over-covers the true box by up to about 0.3 m. Cylinders become squares. Everything is at least 0.42 / 0.12 m. See-through shapes (cage bars, fence line, pond edge, closed gates) get `ns: 1` and are skipped by LOS only. Vault sills are 1.05 m visually but have a 1.2 m collider (jump 0.9 + step 0.3), so only the vault crosses them. The gates stay closed; escaping is the existing 3 s gate channel. The result is 393 colliders, and the server and client use the same list. |
| Relic pick | `src/shared/trialpick.js`. Every 6-of-8 subset is scored by its tightest cluster: the shortest walk that visits any 3 of its relics. The seed chooses among the subsets within 95% of the best score, which gives 10 sets. The tightest NE triple (R2/R3/R4, 86 m) is never live together. R3 sits out 70% of rounds. Rounds use a random seed; `TRIAL_SEED` pins it for tests. `round` now carries `seed` and the relic `id`. |
| Spawns | `pickSpawns`. A hider start needs a walking distance of at least 40 m from the seeker start and must be out of its sight (eye 1.6 m -> chest 1.0 m, within 60 m). Starts are spread at least 12 m apart, with the farthest used as a fallback. 15 of the 20 candidates qualify. |
| Grass | The authored GLB grass is the cover: 28 patches, 8983 clumps, at least 6.3 clumps/m2 in every core, blades from 1.50 m. It never casts shadows, is never distance-culled, and is identical at every preset. It gets the existing wind and hider-only near-fade shader. The server's `trial.grass` and the client concealment test use the inset cores. The procedural `grassfield` is not built for GLB maps. |
| Lighting | Uses `data/lighting_reference.json` as given: hemisphere `#d3dfc7`/`#53513b` 1.6, sun `#ffe3b0` 2.8 from (-55, 75, -45), both x1.12 for the reference exposure. The overcast sky tint is new (`meta.skyTint`). Fog is 40-150 m, against the reference's 155-320 m, so the far side of the map is not one open sightline. Character materials are untouched. The med-preset sun shadow follows the camera in 4 m steps (`meta.sun.follow`). The 10 lantern posts plus the barn get one point light each (11 in total), capped by preset. |
| Perf | The scenic forest and ground dressing are distance-culled at the preset's `fogCull`. The interior trees and buildings are never culled, so a seeker on a low preset sees no further than anyone else. The AABB fallback controller now substeps at 0.2 m, so a 12 m/s Brute rush at a low frame rate cannot tunnel through a 0.3 m wall. |

## Measurements (SwiftShader, 1280 x 720)

Frame times below are software rasterisation on this machine: p50 is 0.5-2.7 s per frame. They say nothing about a real GPU. Draw calls and
triangles are whole-frame `renderer.info` sums (shadow and post passes included), taken from `__perf.st`.

| View | low calls / tris | med calls / tris | high calls / tris |
| --- | --- | --- | --- |
| Broadest vista (NW corner, eye height, looking SE) | 536 / 2.27 M | 624 / 2.65 M | 722 / 3.22 M |
| Aerial overview (40 m) | 538 / 2.27 M | 599 / 2.53 M | 695 / 3.16 M |
| Dense grass (GRASS_25 at 3 m) | 36 / 0.29 M | 82 / 0.43 M | 105 / 0.70 M |
| Barn interior | 265 / 1.41 M | 332 / 1.65 M | 411 / 2.18 M |
| Busy (south yard to the barn, bots in the round) | 299 / 1.43 M | 389 / 1.83 M | 416 / 2.02 M |

Before the instancing regroup, high measured: vista 1098 calls, barn 502, busy 623 (`perf-med-before-regroup.json` holds the matching med numbers).

Travel at walk 3.9 / sprint 6.8 m/s (`tests/world/coldwood.test.mjs` prints these):
- Gate to gate: 128 m (32.9 s walk / 18.8 s sprint).
- Corner to corner: 174 m (44.7 / 25.6 s).
- Ring-road lap: 222 m (57 / 32.7 s).
- Relic spacing: nearest neighbour 43-47 m, pairs 43-124 m.
- Seeker start to relic: average 68 m (17.4 s walk).
- Hider start to nearest relic: at least 15.8 m.
- Hider start to nearest gate: average 53 m.

## Test table

| Scenario | Method | Observed | Evidence | Result |
| --- | --- | --- | --- | --- |
| Node suites | `npm run test:world`, `test:server`, `test:player`, `test:perf:unit` | 51/51 world, all server scripts pass (new-maps 42, trial 32), player all passed, perf 17/17 | terminal | PASS |
| `test:audio` | `node --test tests/audio/cues.test.mjs` | Fails with `document is not defined` (ui/hud.js -> render/index.js -> renderer.js). This file and that import chain were not touched on this branch. | terminal | FAIL (not from this branch) |
| `npm run smoke` | Playwright | Aborts at collection: duplicate test title in `tests/smoke.spec.js:26`, a file this branch does not change. `tests/trial.spec.js` alone passes. | terminal | FAIL (not from this branch); trial.spec PASS |
| Loads without errors / failed requests | boot at potato, low, high, ultra; all views at low/med/high | 0 pageerrors, 0 console errors/warnings, 0 failed requests. The GLB is 5,500,464 bytes, 200. 617 meshes, 56 grass meshes. | `boot-*.png`, `perf-*.json` | PASS |
| Missing textures / blank materials | visual review of 15 views, 3 presets | Textured terrain, barn, stations, gate, pond. No untextured or black objects seen. Not checked material by material. | `view-*.png`, `trav-*.png` | PASS (visual) |
| Traverse every district, the barn's 4 doors, both gates | hider sprints with real keys along nav paths through 14 stops (barn N/W/E/S doors and centre, hayfield, chapel, timber, north gate, farmhouse, pump, marsh, scrapyard, south gate), with the Rapier controller (low) and the AABB controller (potato) | All 14 reached on both controllers, 0 stalls. 1013 / 970 track samples, 0 inside any collider. | `traverse-*.json`, `trav-*.png` | PASS |
| Collisions at sprint and Brute rush | browser seeker as the Brute, Q rush (peak 12.24 m/s), straight into the barn wall, barn post, sliced tractor, sliced boulder, sliced pickup, cage bars, west fence, chapel and V01 sill; Rapier and AABB | Stopped at every obstacle, 0 of 720 samples inside a collider. One harness start point was inside a hay stack, so that ram was rerun from a clear spot. | `ram-*.json`, `ram-*.png` | PASS |
| Concealment from the seeker camera | browser = seeker (eye 1.6 m, first person, med); ws hider in GRASS_05 and GRASS_03 cores | Crouched still 6.1 m: hidden. Crouch-walk 6.1 m: hidden. Sprint 6.1 m: seen. Standing 6.1 m: seen. Crouched 3.6 m: hidden. Crouched 1.4 m: seen (close rule). Standing 22 m in grass: hidden. Crouched 22 m: hidden. Out of grass 7.8 m and 22.6 m: seen. South side, 4.5 m: crouched hidden, standing seen. | `conceal.json`, `conceal-*.png` | PASS (server rule) |
| Presets potato..ultra keep the grass | `__perf.gov.setTier`, `__glb.grassState()`, crouched hider at 1.8 m | Every preset: 56/56 grass meshes in the scene and visible, 19214 instances, 0 casting shadows. The hider is seen at the close range on every preset. | `conceal.json` `presets`, `preset-*.png` | PASS |
| 4 seeded relic selections | 8 rounds over the wire, `TRIAL_SEED` 1 and 5 | Seeds 1-8 gave 6 distinct sets, matching the node test's predictions. Seeds 2 and 3 coincide (10 sets exist). | `seeds.json`, coldwood.test output | PASS |
| Collect 3 and escape with real input | browser hider sprints to the 3 nearest live relics (R8, R6, R7), holds E, then reaches the south gate and holds E | n went 0 -> 1 -> 2 -> 3. The gates opened only after the 3rd. The seeker got exactly 3 relic alerts at the relic coordinates (ttl 6), then 2 gate alerts. `end`: hiders win, escaped 1. The results screen said SURVIVORS ESCAPED. | `objective.json`, `obj-*.png` | PASS |
| Vaults both directions | Space at V01, V03, V16, V05, V10, V12, V14, both ways | All 14 hops crossed (2.1-2.6 m), none landed inside a collider. In the first run, V05 was attempted from a position the harness never reached (no hop happened, which is correct); the retest passed. | `vaults.json`, `vaults-extra.json` | PASS |
| Vault refusals | another player on the landing spot; Space held 1.5 s; Space at a plain wall | Refused (no move, "No room to land"). Held Space gave exactly one hop. No move at the plain wall. | `vaults.json` | PASS |
| Vaults not mandatory | node test: every sill sealed | All relics, cages, gates and spawns are still reachable on foot. | coldwood.test | PASS |
| Full round loss and a clean restart | round runs out the clock (`SEEK_SECS=20`) with the hider in place; host restarts | KILLER WINS, `end` seekers/escaped 0. The next round starts with n 0, gates closed, 6 relics, 0 done, 0 alerts. | `loss.json`, `loss-result.png` | PASS |
| Captured / rescued hider escaping, cages | — | Not run on the estate in the browser. The cage and rescue flow is covered by `tests/server/trial.test.js` on the stub map, and cage centres are checked clear of colliders. | — | UNVERIFIED (estate runtime) |
| Tracker Scent Burst, Phantom cloak, Trapper traps on the estate | — | Not exercised at runtime. Class code and values are unchanged; only the Brute rush was driven. | — | UNVERIFIED |
| Concealment: 4 angles, light vs shadow, LOD crossing while moving | — | Only 2 angles (E, S), 2 patches and med quality were sampled. The camera was not swept through culling distances while watching a hider. | — | UNVERIFIED |
| Frame pacing on real hardware | — | Software GL only. | — | UNVERIFIED |
| Chrome extension playtest | — | Not used (the lead's Chrome window is throttled). Playwright Chromium was used as instructed. | — | UNVERIFIED |

## Known issues

- **Standing inside a core reads poorly at 6 m.** The blades reach 1.5-1.8 m and the seeker's eye is at 1.6 m, so the standing hider (whom
  the server does send at 6 m) was hard to make out in `conceal-G05-mid-stand.png`. The pack asks for standing bodies to stay readable. This
  needs a design call: shorter core blades, or a lower standing-concealment radius.
- **The 9 m standing rule hides standers at range.** `concealed()` hides even a standing hider in a core beyond 9 m (22 m case). That is the
  existing rule, kept as is.
- **The fuse loop can finish before the seeker is released.** Relics and gates can be completed during the hide phase. With the default
  30 s hide, three hiders splitting up could power the gates before the seeker moves; bots did exactly this in a 1500 s test phase.
  Pre-existing rule, not changed.
- **Some vault walls are slightly oversized.** The 0.15 m of invisible collider above each 1.05 m vault sill blocks a jump that looks possible.
- **Rotated boxes are approximated.** Rotated vehicles and boulders are stepped AABB approximations, up to about 0.3 m oversized at their
  corners.
- **R3 is rarely live.** R3 (Orchard House) is live in only 30% of rounds because of the spread rule.
- **Draw calls are high in the wide views.** Up to 722 on high. Most come from the remaining per-chunk instanced meshes times the shadow
  cascades. A further merge, or dropping props from the CSM casters, would cut this.
- **Leftover assets.** `public/models/props/*` and the mud/dirt/dryGrass textures are no longer used by any registered trial map, but they
  are still shipped.
