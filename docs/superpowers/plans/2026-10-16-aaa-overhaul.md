# Hide & Seek AAA Overhaul: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development. Each workstream runs as its own Sonnet agent in its own git worktree. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current prototype into a game that looks, sounds and feels AAA in Chrome. That means a modern rendering pipeline, real animated characters, art-directed maps, tight movement and gunplay, spatial audio and music, a polished UI, and cheat-resistant netcode. Online play, both modes (Classic and Prop Hunt), both maps and the boss screen must keep working throughout.

**Architecture:**
- Move from a no-build ES-module folder to **Vite + vanilla JS (ES2022, JSDoc types)**. One `src/` tree is split by responsibility, so each workstream owns its own folders.
- A tiny engine core (`src/core/`) defines the contracts every workstream codes against: the frame loop, the event bus, game state, settings and asset loading.
- World layout data stays deterministic and shared with the Node server (`src/shared/`). That keeps prop ids, colliders and spawns identical on client and server.

**Tech stack:**
- Client: three@0.170.0 (npm), Vite 5, `postprocessing` (pmndrs) 6.36.x.
- Physics: `@dimforge/rapier3d-compat` 0.14.x for the character controller and physics props.
- Assets: KTX2/Draco via three addons.
- Server: Node 20 + `ws`.
- Tests: Playwright (headless Chromium, SwiftShader) for the browser smoke test, plus Node scripts for the server.

**Spec:** `docs/PLAN-v2.md` (vision) plus the user's requests in this session (summarised under Global Constraints).

## Global Constraints

- Runs in desktop Chrome from a URL with no install. Client on Vercel (`hide-and-seek-red.vercel.app`), server on Railway EU West, **1 replica** (rooms are in memory).
- **Performance budget:**
  - "High" preset: ≥60 fps at 1080p on an integrated GPU (Intel Iris Xe class). "Low" preset: ≥60 fps on a 2018 laptop.
  - ≤ 300 draw calls in the worst view on either map.
  - First load ≤ 15 MB over the wire, and the menu interactive in ≤ 4 s on a fast connection.
- **Assets:** CC0 or MIT only, each logged in `ASSETS.md` with source URL and licence. No Mixamo or other restricted licences. No brand names or logos. The fake work dashboard keeps its fictional company.
- **Keep existing behaviour:** the classic/prophunt rules, the server-authoritative tagging and shooting, the anti-teleport check (9 m/s), the 10 s connect timeout, the boss key (backtick), and visual sound cues for every positional sound, with no cue beyond audible range. Also keep:
  - Hiders never see other hiders in Prop Hunt.
  - Seekers never see hiders' name tags.
  - A hit earns a full mag.
  - A miss costs 8 hp.
- **Keyboard safety:** no Ctrl-based binds, fullscreen plus keyboard lock in a round, and `beforeunload` only while a round or room is active.
- **Commits:** author `Finn Kennedy <fpkm2000@gmail.com>`, with no AI attribution anywhere. Push to `FinnKennedy2000/hide-and-seek`. Every push to `main` auto-deploys to both hosts.
- **Order of work:** deploy first, test after. Each merged workstream ships straight away, and the fuller tests run after the deploy. A syntax check plus `npm run smoke` must pass before any push to `main`.

## Review Focus

1. **Mixed client versions in one room** during a rolling deploy. The server must reject a client whose `PROTOCOL` version differs, with a "Refresh to update" message, instead of desyncing. *Test:* Task 7.
2. **A low-end GPU or WebGL context loss** (a laptop on battery, or a tab switch). The game must drop quality automatically and recover from `webglcontextlost` without a blank screen. *Test:* Task 2.
3. **Assets failing to load** (CDN hiccup, ad-blocker). Each asset group needs a fallback: a procedural character or a flat material, with a toast, never a stuck loading bar. *Test:* Task 1 (loader) and Task 3 (characters).
4. **High latency (200 ms+) and packet jitter.** Shots must still register via lag compensation, other players must not rubber-band, and nobody should get kicked by the anti-teleport check. *Test:* Task 7.
5. **Alt-tab or pointer-lock loss mid-round,** and the boss key during a reload or disguise. Input must not stick (no stuck W, no stuck reload) and audio must restore on return. *Test:* Task 5.

---

## Phase 0: Foundation (1 agent, blocking, about 1–2 h)

### Task 1: Vite migration, engine core and smoke harness

**Owner:** Agent F (Foundation). **Skills:** threejs-core, threejs-ops, threejs-performance.

**Files:**
- Create: `vite.config.js`, `src/main.js`.
- Create the core modules: `src/core/{loop.js, bus.js, state.js, settings.js, assets.js, input.js}`.
- Create: `src/shared/{worlddata.js, maps/house.js, maps/lateshop.js, protocol.js}`.
- Create: `tests/smoke.spec.js`, `tests/server/*.test.js` (move `mp-test*.js` from the scratchpad into the repo).
- Move `public/*.js` into `src/` by responsibility. This is a mechanical move only, with no behaviour change:
  - `game.js` splits into `src/world/build.js`, `src/player/controller.js`, `src/ai/{hiders,seeker,nav}.js`, `src/render/renderer.js`, `src/audio/sfx.js`, `src/ui/{hud,menus}.js`.
  - The online modules go to `src/net/`, `src/modes/{classic,prophunt}.js` and `src/ui/bossscreen.js`.
- Modify:
  - `package.json`: scripts `dev`, `build`, `start`, `smoke`, `test:server`.
  - `vercel.json`: `"framework": "vite", "outputDirectory": "dist", "buildCommand": "npm run build", "installCommand": "npm ci"`.
  - `server/index.js`: serve `dist/` and import from `../src/shared/`.
  - `railway.json`: build `npm ci && npm run build`, start `npm start`.

**Interfaces (produced; every later task consumes them):**
```js
// src/core/bus.js
export const bus = { on(type, fn) /* -> off() */, emit(type, payload) };
// Event types (frozen names): 'sound' {kind, x, y, z, vol, by}, 'shot' {by, hit, x, y, z},
// 'tagged' {by, target}, 'disguise' {id, propId}, 'round' {mode, map, role}, 'phase' {phase}, 'end' {winner}, 'quality' {level}
// src/core/loop.js
export function addSystem({ name, order, update(dt, t) }) /* -> remove() */; // order: input 0, net 10, player 20, ai 30, anim 40, camera 50, audio 60, render 100
// src/core/settings.js
export const settings; // {quality:'low'|'med'|'high'|'ultra', fov, sens, volume, cues, invertY}; settings.set(k, v) emits 'settings'
// src/core/assets.js
export async function loadGroup(name, entries /* [{key,url,type:'gltf'|'ktx2'|'audio'|'hdr'}] */, onProgress) /* -> Map; a failed entry resolves to null and emits 'assetFail' */
// src/shared/worlddata.js — unchanged API: buildWorld(v, mapId), MAPS, rayBox
// src/shared/protocol.js
export const PROTOCOL = 3; // bumped whenever messages change
```

- [ ] **Step 1:** Write `tests/smoke.spec.js` (Playwright, `--use-gl=swiftshader`). It loads `/`, starts SEEK on each map, runs 5 s, asserts zero `pageerror` / `console.error` (ignoring `favicon`), and records `renderer.info.render.calls` to `test-results/perf.json`. Run it against the current `public/` served by `node server/index.js`. Expected: PASS (baseline).
- [ ] **Step 2:** Move `mp-test.js`, `mp-test2.js` and `mp-test3.js` into `tests/server/`. Add `npm run test:server`, which starts a server on a random port with `HIDE_SECS=1 SEEK_SECS=20`, runs all three, and kills it by PID. Expected: 23/50/24 pass.
- [ ] **Step 3:** Add Vite, move the files, and add the core modules. Rewire the imports with no behaviour change.
- [ ] **Step 4:** Run `npm run build && npm start`, then `npm run smoke` against `http://localhost:3000` and `npm run test:server`. Expected: all PASS, with draw calls within ±5% of baseline.
- [ ] **Step 5:** Commit and push to `main`. Verify the Vercel build log shows `vite build`, Railway is healthy, and both URLs serve the same `index-*.js` hash.

---

## Phase 1: Parallel workstreams (6 Sonnet agents, each in its own worktree on branch `ws/<name>`)

Each workstream owns only the listed folders. Changes outside them must be requested from the integrator (me) and are not made directly. Each agent rebases on `main` and runs `npm run smoke` before handing back. The integrator merges one branch at a time, smoke-tests and pushes.

### Task 2: Rendering and lighting (Agent R)

**Skills:** threejs-lighting, threejs-postprocessing, threejs-shaders, threejs-materials, threejs-performance.

**Files:** owns `src/render/**`, `src/world/materials.js`, and the `public/env/` HDRIs.

**Interfaces:**
- Consumes: `settings.quality` and the `bus` events `'quality'` and `'round'` (for the map).
- Produces:
  - `render.init(canvas)`, `render.setMap(meta)` for per-map grading, fog and sky, and `render.addFlicker(light)`.
  - `render.stats()` → `{calls, tris, fps}`.

**Deliver:**
- ACES/AgX tone mapping and an sRGB pipeline. PMREM environment lighting from a CC0 HDRI per map: a dusk sky for the house, a night street for Late Shop.
- Shadows: cascaded shadows (CSM addon) for the house sun. Contact-hardening for interior lights is used only on "ultra".
- A `postprocessing` pipeline: SMAA, then N8AO or GTAO, then selective bloom, colour grading with a LUT per map, vignette, film grain on "high" and above, and a small chromatic aberration only on hit.
- Quality presets with auto-detect (first 3 s FPS probe) and a dynamic resolution scale that keeps 60 fps.
- Recovery after `webglcontextlost` / `restored`.

**Tests:**
- [ ] The smoke test asserts the frame-average draw calls stay ≤ 300 on both maps for each preset (log to `perf.json`).
- [ ] A forced context loss (`WEBGL_lose_context`) restores within 2 s with no `pageerror` (Review Focus 2).
- [ ] With the FPS mocked low for 3 s, `settings.quality` drops one level and `'quality'` fires.

### Task 3: Characters and animation (Agent C)

**Skills:** threejs-animation, threejs-loaders, threejs-materials.

**Files:** owns `src/characters/**` and `public/models/characters/`.

**Interfaces:**
- Consumes: `assets.loadGroup` and `bus` `'round'`.
- Produces: the same API as today's `character.js`, so callers don't change.
  ```js
  createCharacter({color, hat, outfit, seeker}) -> {root, update(dt,{speed,crouch,airborne,lookYaw,aimPitch}), play('taunt'|'hit'|'tagged'|'victory'), setSeeker(b), setTint(c,a), dispose()}
  ```
  It also adds `aimPitch` (upper-body aim) and `play('tagged'|'victory')`.

**Deliver:**
- Rigged glTF characters from a CC0 pack (e.g. Quaternius "Ultimate Animated Character Pack" or three.js `RobotExpressive.glb`; licence verified and logged), retargeted to a shared skeleton.
- An AnimationMixer with a 1D locomotion blend (idle, walk, run), a crouch layer, jump start/loop/land, an additive upper-body aim and blaster hold for seekers, and taunt, hit, tagged and victory clips.
- Foot IK on slopes is optional and "ultra" only.
- Per-player colour through a mask texture, attached hat meshes, and a seeker headband with goggles.
- LOD: full rig within 15 m, reduced update rate beyond 30 m, frustum-culled mixers paused.
- The procedural `character.js` is kept as the fallback when the glTF fails (Review Focus 3).

**Tests:**
- [ ] A Node unit test (with three and a GLTFLoader DOM shim) checks that every clip name used exists in the loaded file.
- [ ] A smoke step spawns 10 characters, asserts no errors, and shows the draw-call increase ≤ 40.
- [ ] Blocking the model URL in Playwright shows the fallback character and a toast, with no `pageerror`.

### Task 4: World art and maps (Agent W)

**Skills:** threejs-geometry, threejs-materials, threejs-scenes, threejs-loaders.

**Files:** owns `src/world/**` (except `materials.js`), `src/shared/maps/**` and `public/textures/`.

**Interfaces:**
- Consumes: the `buildWorld(v, mapId)` contract. Layout changes must keep it deterministic. The server reads colliders, props and spawns from the same file.
- Produces: an unchanged `MAPS` registry, plus `meta.zones` (`[{name, box, reverb}]`) for audio and `meta.lightProbes`.

**Deliver:**
- A PBR texture set (CC0 from ambientCG or Poly Haven, KTX2-compressed, ≤ 1K) for walls, floors, wood, metal, tiles, grass and asphalt.
- Trim and detail: skirting, door frames, window frames with glass, ceilings, light fittings and clutter decals.
- Baked AO via vertex colours computed at build time.
- Props get bevelled geometry (RoundedBoxGeometry) and better silhouettes.
- **House remaster:** interior dressing, a garden with instanced grass and a hedge maze corner.
- **Late Shop remaster:** branded-free signage, products as instanced shelves, and the lorry interior made navigable. Fix the 3 unreachable spots and the 2 lorry spots that overlap colliders.
- Every prop stays a disguisable `b.prop` with a stable id order (append-only within a map, so the ids of existing props don't shift).

**Tests:**
- [ ] `tests/world/reachability.test.mjs`: a flood fill from `seekerStart` reaches every spot and spawn on both maps, no spot or spawn sits inside a collider, and `build` is deterministic (two builds deep-equal).
- [ ] `tests/world/propids.test.mjs`: the prop ids and names of `main`'s first N props are unchanged (a snapshot file).
- [ ] The smoke draw calls on both maps stay within budget.

### Task 5: Movement, camera and gunplay feel (Agent G)

**Skills:** threejs-physics, threejs-camera.

**Files:** owns `src/player/**`, `src/camera/**`, `src/modes/prophunt.js` (client feel only), `src/fx/**` and `src/core/input.js`.

**Interfaces:**
- Consumes: the world colliders, `bus`, `settings`, and the `blaster` server protocol (unchanged).
- Produces: `player.state` → `{x, y, z, vx, vz, yaw, pitch, crouch, airborne, sprint, stamina}`, read by net, characters and audio.

**Deliver:**
- A Rapier kinematic character controller replacing the AABB push-out:
  - Autostep 0.3 m and slopes ≤ 40°.
  - Coyote time 0.1 s, jump buffering, and acceleration and friction curves.
  - Stamina-limited sprint, crouch-slide on sprint plus C, and the prop-hunt radii kept.
- Camera:
  - First person: FOV kick, a head-bob setting, landing dip, a strafe roll of 1.5°, and the sensitivity, FOV and invert settings.
  - Third person: a spring arm with collision and a shoulder swap (Q).
- Gunplay:
  - A spring-based recoil and viewmodel sway.
  - A hitmarker with a sound, a splat decal that matches the surface normal, impact particles, and screen-shake presets.
  - ADS-lite on right mouse (zoom 1.25×, lower spread).
- Input: centralised in `input.js` with rebinding stored in `settings`. Clear all keys on `blur`, `visibilitychange` and pointer-lock loss (Review Focus 5).

**Tests:**
- [ ] `tests/player/controller.test.mjs` (Node with rapier-compat):
  - Walk into a wall and get stopped at radius ±0.02.
  - Step up a 0.25 m stair.
  - Can't climb a 0.6 m box without jumping.
  - Sprint drains stamina and regenerates.
- [ ] A smoke step holds W, then dispatches `blur` and asserts the player stops within 100 ms.
- [ ] A smoke step presses R to reload, then the backtick (boss key), waits 2 s, presses backtick again, and asserts `reloading` resolves via the server ammo sync.

### Task 6: Audio and music (Agent A)

**Skills:** threejs-audio.

**Files:** owns `src/audio/**` and `public/audio/`.

**Interfaces:**
- Consumes: the `bus` events `'sound'`, `'shot'`, `'tagged'` and `'phase'`, `player.state`, and `meta.zones`.
- Produces: `audio.play(kind, pos?, vol?)`. It **always** emits the visual cue through the existing cue hook, so captions keep working.

**Deliver:**
- CC0 sample sets (Kenney audio packs or freesound CC0) for footsteps per surface (wood, tile, grass, concrete), the blaster, hits, splats, the UI and props.
- An `AudioListener` / `PositionalAudio` graph with HRTF panning.
- Occlusion: a low-pass filter when the line of sight is blocked, using the same raycast as `losClear`.
- Per-zone convolution reverb with synthesised IRs (small room, big hall, outdoors).
- Dynamic music: calm hide-phase bed, tension layer by proximity for hiders and by time left for seekers, a stinger on "spotted" and tag, and victory and defeat stingers.
- Ducking under the boss screen.
- Volume buses (master, music, sfx, ui) in settings.

**Tests:**
- [ ] `tests/audio/cues.test.mjs`: every `kind` that `audio.play` accepts maps to a cue glyph and caption (no silent kinds).
- [ ] A smoke step emits a `'sound'` at 5 m and at 60 m, and asserts one cue (the near one) is in the DOM.
- [ ] A smoke step mutes via settings and asserts master gain is 0 while cues still appear.

### Task 7: Netcode, server and anti-cheat (Agent N)

**Files:** owns `server/**`, `src/net/**` and `src/shared/protocol.js`.

**Interfaces:**
- Consumes: `player.state` and the shared world.
- Produces: the same message types plus `hello {protocol}` → `err 'Refresh to update'` on a mismatch. Snapshots become delta-compressed binary (`ArrayBuffer`, 14 bytes per player). `bus` gets `'net'` events.

**Deliver:**
- **Protocol versioning** (Review Focus 1).
- **Interest management:** a seeker receives a hider's position only when the server's coarse visibility test (LOS against the world colliders, within 40 m) passes or a sound was made. This fixes the wallhack disclosure.
- **Lag compensation:** a 1 s position history per player at 30 Hz. Shots rewind to `serverTime − rtt/2`, capped at 250 ms.
- **Client side:** client-side prediction for the local player with server reconciliation (a soft correct under 0.5 m, a snap above). Remote interpolation uses jitter-buffered timing.
- **Bots** fill empty slots online using the AI from `src/ai/`, run server-side on the shared nav grid.
- **Reconnect** into a live round within 30 s by token, which keeps your role and score.
- **Server metrics** at `/metrics` (rooms, players, tick ms).

**Tests:**
- [ ] The existing `tests/server/*` pass (adjusted only for the binary snapshot decoder).
- [ ] New in `tests/server/netcode.test.js`:
  - A client with protocol 2 gets `err` with "Refresh".
  - With 200 ms of simulated latency plus 50 ms of jitter (a proxy in the test), a shot at a hider moving at 3.9 m/s registers a hit, and a client walking at 6.8 m/s is never dropped by the 9 m/s check (Review Focus 4).
  - A hider behind a wall is absent from the seeker's snapshots and present once in LOS.
  - Drop and reconnect with the token restores role and score.
  - A room with 1 human plus "fill bots" starts with ≥ 4 players.

### Task 8: UI, UX and onboarding (Agent U)

**Skills:** impeccable (craft/polish), frontend-design.

**Files:** owns `src/ui/**`, `index.html` and `src/styles/**`.

**Interfaces:**
- Consumes: `settings`, `bus` (`round`, `phase`, `end`, `tagged`, `shot`, `assetFail`, `quality`, `net`) and `render.stats()`.
- Produces: `ui.toast(text, tone)`, `ui.showScreen(name)` and `ui.loading(progress, label)`.

**Deliver:**
- A distinctive art direction carried through all screens: a title screen with a live 3D backdrop camera fly-through, the main menu, play (single/online), a settings screen with graphics, controls, audio and accessibility tabs, the lobby, a loading screen with real progress from `assets`, and the results with a podium using the `victory` animation.
- HUD redesign: role banner, timer, ammo and health widget, minimal crosshair with hit feedback, kill feed, and sound-cue ring restyled to the new art direction.
- A first-play onboarding overlay per role, shown once and stored in settings.
- The boss screen is kept, using the fictional company.
- Keyboard and controller-navigable menus, visible focus states, a reduced-motion setting, and colour-blind-safe role colours.

**Tests:**
- [ ] The smoke test walks through every menu screen by keyboard only. Each screen is reachable and Esc goes back.
- [ ] An axe-core scan of the menus shows no serious or critical violations.
- [ ] A 5 s loading screen test with throttled network shows progress increasing monotonically, and the menu becomes interactive.

---

## Phase 2: Integration, review and ship (integrator, which is me, plus review agents)

### Task 9: Merge, review, perf pass

- [ ] Merge the branches in this order: W → R → C → G → A → N → U. After each merge, run `npm run build && npm run smoke && npm run test:server`, then push to `main` so it deploys.
- [ ] Run the `pr-review-toolkit:silent-failure-hunter` and `code-review` agents on the full diff (per CLAUDE.md), and fix the findings that matter.
- [ ] Performance pass: `perf.json` within budget on both maps for each preset.
- [ ] A live check on the deployed URLs: a 2-page online Prop Hunt round on each map with no console errors.
- [ ] Update `README.md`, `ASSETS.md` and `docs/PLAN-v2.md`.

## Agent split (8 Sonnet agents: 1 foundation, then 7 in parallel)

| Agent | Workstream | Starts |
|---|---|---|
| F | Foundation (Task 1) | now |
| R | Rendering and lighting (Task 2) | after F merges |
| C | Characters and animation (Task 3) | after F |
| W | World art and maps (Task 4) | after F |
| G | Movement, camera, gunplay (Task 5) | after F |
| A | Audio and music (Task 6) | after F |
| N | Netcode and server (Task 7) | after F |
| U | UI/UX (Task 8) | after F |

Phase 1 runs 7 agents in parallel, each in its own worktree. Expected wall clock: about 1–2 h for Foundation, then about 2–4 h for the parallel phase. Merge and ship happen continuously as branches land.
