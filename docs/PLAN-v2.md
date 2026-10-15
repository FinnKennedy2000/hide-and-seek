# Hide & Seek v2: plan (draft, for sign-off)

v1 is one 938-line `game.js` built from boxes and capsules. It has two single-player modes against AI and nothing has been playtested. v2 aims to look and play like a real game, while still running from a URL in Chrome.

## Goals
1. **Multiplayer first.** 2–8 players in a room by link: one or more seekers, everyone else hides. Bots fill any empty slots. This is what makes hide and seek fun.
2. **Real art.** Use glTF models, PBR materials and baked lighting instead of primitives.
3. **Sticks around.** Multiple maps, rounds, scoring and cosmetic unlocks.
4. **Holds 60fps** on a mid-range laptop and degrades gracefully below that.

## Stack
| Concern | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript | v1 has no build step, which caps it. Splitting into modules makes agent-parallel work possible. |
| Render | Three.js with WebGPURenderer (WebGL2 fallback) | Keeps v1 knowledge. WebGPU ships in Chrome. |
| Physics / collision | Rapier (WASM) | Replaces hand-rolled AABB. Gives capsule controllers, slopes and stairs. |
| Netcode | Colyseus room server on **Railway** | Authoritative server, rooms by code, and Railway already runs v1. |
| Static client | **Vercel** | CDN for assets. The client talks to Railway over WebSocket. |
| Assets | CC0 glTF (Kenney, Quaternius, Poly Haven), compressed with Draco and KTX2 via gltf-transform | Licensing is clean and downloads stay small. |
| Audio | Howler, or plain WebAudio with real recorded SFX | |

## Characters
- [~] Done procedurally instead of glTF (no assets): chunky primitive characters with idle/walk/run/crouch/jump/taunt/hit. Original plan: rigged, animated glTF characters replace the capsules. Use CC0 Quaternius / Kenney character packs with idle, walk, run, crouch, jump, hit and taunt clips, played through a Three.js AnimationMixer with blend trees.
- [x] Customisation: outfit colours, hats and accessories, picked in the lobby and synced in multiplayer. Faces are expressive (blink, look-at).
- [x] Third-person camera for hiders, who need to see themselves to blend in. First-person for seekers, who need to aim.

## Core loop: disguise vs. gun (now the main mode)
**Hiders blend in:**
- [x] **Copy a prop.** Look at any prop (chair, plant, bin, lamp) and press F to become it, using the same mesh, scale and material. Disguising takes about 0.5s with a puff effect and has a cooldown.
- [x] **Camouflage.** (colour only, no texture copy) Press G to sample the surface you're touching and paint yourself in its colour and texture. This lets you blend into a wall or a hedge as a person.
- [x] **Rotate lock.** Lock your prop's rotation so it lines up with nearby real props. A wonky chair gives you away.
- [x] **Tells balance it.** (wobble, slow and audible movement; no shadow tell) Disguised hiders cast slightly different shadows, an idle hider "settles" now and then, and moving while disguised is slow and audible.
- [x] **Taunt** (bonus points, makes a sound); [ ] **decoy:** drop a fake copy of your current prop.

**Seeker has a gun with limited ammo:**
- [x] A cartoon paint/dart blaster, not a realistic firearm. The magazine is small (6 shots) with a few spare mags per round, roughly 18 shots in total.
- [x] Shooting a hider tags them, or damages them if there's a health variant, with a paint splat that reveals them.
- [x] **A wrong shot costs ammo and some seeker health.** At 0 health the seeker is out for the round. This is what stops seekers spraying every object.
- [x] Each successful tag refunds 2 shots. An ammo pickup in the map spawns once per round.
- [x] (no lag compensation yet) Hit detection is server-authoritative. The client sends the shot ray, the server raycasts against its own collision copy with a small lag-compensation window, and broadcasts hit or miss plus the splat.
- [ ] Seeker tools on cooldown: a sound ping and a short "scan" that makes moving props glint.

**Rules:** [x] tagged hiders join the seekers as extra guns (infection), so rounds snowball. Hiders win if anyone survives the timer or every seeker runs out of health or ammo.
- **Maps:** the v1 house rebuilt properly, a school after hours, and a supermarket. Each map is a glTF plus a JSON file for spawns, hiding hints and a navmesh.
- **Better bot AI:** a navmesh using recast-navigation-js, hiding-spot scoring based on cover and distance from the seeker, and memory of the last-seen position.

## Phases (each one ships live)
1. **Restructure.** Port v1 to Vite+TS modules (world, player, ai, ui, audio) with no behaviour change. Add a Playwright smoke test that plays 10s of each mode headless with no console errors.
2. **Feel.** Rapier character controller, stamina, crouch/peek, tuned camera, and real SFX. Do a playtest pass.
3. **Art.** Rebuild the house map from glTF kits, with baked lightmaps and a quality-settings menu.
4. **Multiplayer.** Colyseus server on Railway, rooms by code or link, server-authoritative tagging, interpolation, and bots filling empty slots.
5. **Characters + disguise vs. gun.** Rigged characters and customisation, prop copy, camouflage, the blaster with ammo and health economy, and server hit detection. Then a second map.
6. **Meta.** Names, scoreboard and cosmetics stored in localStorage (no accounts in v2).

## Agent split (Sonnet subagents, one module per agent, parallel from Phase 2)
world/maps · player+physics · AI/navmesh · netcode server · UI/HUD · audio. I own the integration, review and deploys.

## Decided
- Multiplayer is the headline. The Railway server is being built now as the base.
- The core mode is disguise vs. gun: hiders copy props or camouflage, and the seeker has a limited-ammo blaster.

## Open questions
- Is a custom domain wanted?
- On a seeker's wrong shot: health penalty plus ammo, or ammo only?
