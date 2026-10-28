# Assets

Every third-party asset: source URL and licence. CC0 or MIT only, no brands or logos. One section per workstream; append, never reorder.

## Characters (Task 3)

| File | Source | Licence | Notes |
| --- | --- | --- | --- |
| `public/models/characters/robot.glb` | RobotExpressive.glb, three.js repo `examples/models/gltf/RobotExpressive/` (tag r170): https://github.com/mrdoob/three.js/tree/r170/examples/models/gltf/RobotExpressive | CC0 1.0. Model by Tomas Laulhe (Quaternius, https://quaternius.com), modified by Don McCurdy (face morph targets, FBX2GLTF conversion, material cleanup). The upstream README states "CC0 1.0". | Rebuilt with `src/characters/tools/build-model.mjs`: 12 rigid parts and 2 skinned hands merged into one skinned mesh (1 draw call), single vertex-coloured material with a per-vertex tint mask, simplified to about 3.2k triangles, 7 of 14 clips kept (Idle, Walking, Running, Jump, Death, Dance, Wave), face morphs dropped, meshopt-compressed (EXT_meshopt_compression). The model has no textures, so there is nothing to resize. 463 KB source, about 240 KB shipped. |

Hats and the seeker headband/goggles are generated in code (`src/characters/gear.js`), not downloaded.

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
