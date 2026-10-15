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

## Gameplay additions
- **Prop-hunt variant.** Hiders disguise as a prop and seekers lose health for wrong guesses. This is the most-loved twist on hide and seek.
- **Seeker tools,** each on a cooldown: a sound ping, a flashlight that reveals glints, and a short sprint.
- **Hider tools:** a taunt for bonus points, a decoy noise, and a short dash after being spotted.
- **Tagged hiders join the seekers** (infection rule), so rounds snowball.
- **Maps:** the v1 house rebuilt properly, a school after hours, and a supermarket. Each map is a glTF plus a JSON file for spawns, hiding hints and a navmesh.
- **Better bot AI:** a navmesh using recast-navigation-js, hiding-spot scoring based on cover and distance from the seeker, and memory of the last-seen position.

## Phases (each one ships live)
1. **Restructure.** Port v1 to Vite+TS modules (world, player, ai, ui, audio) with no behaviour change. Add a Playwright smoke test that plays 10s of each mode headless with no console errors.
2. **Feel.** Rapier character controller, stamina, crouch/peek, tuned camera, and real SFX. Do a playtest pass.
3. **Art.** Rebuild the house map from glTF kits, with baked lightmaps and a quality-settings menu.
4. **Multiplayer.** Colyseus server on Railway, rooms by code or link, server-authoritative tagging, interpolation, and bots filling empty slots.
5. **Prop-hunt + second map.**
6. **Meta.** Names, scoreboard and cosmetics stored in localStorage (no accounts in v2).

## Agent split (Sonnet subagents, one module per agent, parallel from Phase 2)
world/maps · player+physics · AI/navmesh · netcode server · UI/HUD · audio. I own the integration, review and deploys.

## Open questions
- Is multiplayer the headline, or should v2 stay single-player and spend the effort on polish?
- Is prop-hunt in scope?
- Is a custom domain wanted?
