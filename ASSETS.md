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
