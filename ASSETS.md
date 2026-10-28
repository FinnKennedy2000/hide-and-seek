# Assets

Every third-party asset: source URL and licence. CC0 or MIT only, no brands or logos. One section per workstream; append, never reorder.

## Characters
FIELD character asset pack (`public/models/characters/*.glb`): original models, textures and starter animations generated for this project in Blender
(pack provenance: START_HERE.txt, no downloaded or ripped assets, no third-party attribution). Loaded by `src/characters/glb.js`; the procedural workwear
humans (`src/characters/character.js`) are the fallback when a model fails to load. Lossless size pass with `@gltf-transform/cli` 4.5.1:
`dedup`, `prune`, `webp --lossless true --effort 100` (base-colour sRGB and normal maps stay pixel-identical; geometry and animation untouched).

| File | Role | Original | Shipped |
| --- | --- | --- | --- |
| `moss_hider.glb` | hider | 2.12 MB | 1.45 MB |
| `tracker_seeker.glb` | tracker | 3.74 MB | 2.38 MB |
| `phantom_seeker.glb` | phantom | 1.74 MB | 0.93 MB |
| `trapper_seeker.glb` | trapper | 3.40 MB | 2.14 MB |
| `brute_seeker.glb` | charger (the Brute) | 3.92 MB | 2.37 MB |

Total 19.24 MB -> 11.57 MB (-40%).

## Audio (public/audio/*.ogg), all CC0 (Creative Commons Zero), by Kenney (https://kenney.nl), copied unmodified
- Impact Sounds 1.0, https://kenney.nl/assets/impact-sounds: footstep_wood / footstep_grass / footstep_concrete (step_*), impactPlate_light (step_tile), impactPunch_medium (hit), impactSoft_heavy (land), impactWood_light (prop_wood), impactMetal_light (prop_metal)
- Sci-fi Sounds 1.0, https://kenney.nl/assets/sci-fi-sounds: laserSmall (shot), slime (splat), doorOpen (prop_door)
- Interface Sounds 1.0, https://kenney.nl/assets/interface-sounds: scratch (scrape), click (empty), tick, confirmation (found, pickup), maximize (go), select (ui), error (ui_error)
- Licence text in each pack: License.txt, "Creative Commons Zero, CC0". Total 496 KB.
- Music is original and synthesised at runtime (src/audio/music.js); no files.

## World textures (public/textures/<set>/{c,n,r}_{1024,512}.webp)

Source: ambientCG (https://ambientcg.com), licence CC0 1.0 (https://docs.ambientcg.com/license/). Downloaded as the 1K-JPG packs,
converted to WebP (colour, OpenGL normal, roughness; 1024 and 512). The `tile` colour map is brightened 2.8x for the lit shop floor.

| Set | ambientCG asset | Used for |
| --- | --- | --- |
| wall | PaintedPlaster017 | interior and exterior walls |
| floor | WoodFloor041 | house plank floor |
| wood | Wood049 | furniture, fences, crates |
| metal | Metal032 | fridges, fences, racking |
| tile | Tiles108 | shop floor |
| grass | Grass004 | house garden ground |
| asphalt | Asphalt031 | car park |

## Environment lighting (Task 2)

- public/env/dusk.hdr: Venice Sunset 1k HDRI (Greg Zaal), https://polyhaven.com/a/venice_sunset, CC0
- public/env/night.hdr: St Peters Square Night 1k HDRI, https://polyhaven.com/a/st_peters_square_night, CC0

## Coldwood Farm (trial mode): props and ground textures

Poly Haven (https://polyhaven.com) assets are CC0 1.0 (https://polyhaven.com/license). Downloaded through api.polyhaven.com/files/<id> (glTF 1k), then
decimated (meshoptimizer simplify), textures resized and re-encoded as WebP, written as plain GLB (no meshopt/draco) with `@gltf-transform`. Files in
`public/models/props/`, loaded by `src/world/models.js`.

| File | Source (Poly Haven id) | Notes |
| --- | --- | --- |
| `rocks.glb` | rock_moss_set_01 | ~3.5k tris, 512 textures |
| `log.glb` | dead_tree_trunk_02 | ~2.5k tris, 256 textures |
| `barrel_red.glb` | Barrel_01 | ~0.9k tris |
| `barrel_blue.glb` | barrel_03 | ~0.7k tris, 256 textures |
| `tarp_car.glb` | covered_car | ~2.4k tris, car under a tarp (the wreck) |
| `wheel.glb` | rusted_wheel_rim_01 | ~0.8k tris |
| `iron_gate.glb` | large_iron_gate | ~2.5k tris |
| `lantern.glb` | Lantern_01 | ~1.2k tris |
| `jerrycan.glb` | metal_jerrycan | ~0.7k tris |
| `pine.glb`, `pine_small.glb`, `dead_tree.glb`, `hay_bale.glb`, `cage.glb` | generated procedurally (own work, vertex colours, no textures); CC0 | no download |

Ground textures (`public/textures/<set>/{c,n,r}_{1024,512}.webp`, Poly Haven 1k, CC0): `mud` = brown_mud_leaves_01, `dirt` = stony_dirt_path, `dryGrass` = withered_grass.
(Kenney's Nature Kit was the first choice but its download endpoint is gated, so it is not used.)

## Trial audio polish
No new files. Fuse stinger, grass rustle, distant creaks, wind / cricket ambience, heartbeat and channel hum are all synthesised at runtime (src/audio/trial.js, src/audio/sfx.js). Footsteps reuse the Kenney CC0 set listed above. The master bus now ends in a limiter (threshold -9 dB, ratio 20, x0.7 trim) so peaks stay under about -6 dBFS.

Coldwood Yard (polish pass): the layout reuses the models above. Sawmill, crane/gantry, water tower, log stacks, truck, rock banks, plank barriers and lamp posts are built from
`b.box` geometry in `src/shared/maps/coldwood.js` (own work, no files). No new downloads, so the prop payload is unchanged (1.0 MB of prop GLBs; all textures 6.2 MB, of which Coldwood loads only mud, dirt, dryGrass, wood, wall).
