# Coldwood Farm: real-GPU frame rate at 1080p

Goal: at least 30 fps minimum, ideally 60, at 1080p on the dev laptop's Intel iGPU, with the tall grass (the concealment mechanic) and
its look unchanged at every preset.

**Result:**
- **Default settings (auto quality):** the best run was 60 fps with p99 ≤ 23.5 ms in every view at full 1920x1080 (it ended on `low`).
  In a run where the laptop's own Chrome was using up to 70% of the GPU, it fell back to `potato` at 0.6-0.67 scale and gave 49-60 fps.
- **`low` pinned at 1920x1080:** 60 fps in all 8 scenarios, max frame 38.6 ms.
- **`med` and `high` pinned at native 1080p:** still GPU-bound at 25-40 ms per frame, so 23-40 fps. They do not reach a 30 fps
  minimum at full resolution on this iGPU. The governor drops their render scale (to 0.6 at worst) to compensate.

All fps figures below were observed on the real GPU. None are estimates.

## Environment

| | |
| --- | --- |
| Machine | Intel Core Ultra 7 265U, Intel(R) Graphics (Arrow Lake-U Xe, 0x7D41), driver 32.0.101.8509, on AC, Windows "Balanced" power plan |
| Display | 1920x1200 panel at 100% (devicePixelRatio 1) |
| Browser | Windows Chrome 156.0.8078.48, `ANGLE (Intel, Intel(R) Graphics (0x00007D41) Direct3D11 vs_5_0 ps_5_0, D3D11)`, `EXT_disjoint_timer_query_webgl2` available |
| Viewport | 1920x1080 CSS px at DPR 1 (CDP `Emulation.setDeviceMetricsOverride`), so the canvas is 1920x1080 at scale 1 |
| Build | production `vite build`, served by `server/index.js` from WSL2 (`HIDE_SECS=1 SEEK_SECS=900`), with a real online TRIAL round and server bots |
| Load on the box | the user's own apps kept running (Firefox, Teams, the user's Chrome). At times the user's Chrome GPU process used up to ~70% of the 3D engine. |

What was ruled out as a measurement path:
- Playwright/SwiftShader is CPU rasterisation.
- The Claude-in-Chrome window is throttled.
- A headed Chrome window launched from WSL works (the first numbers came from one), but the window got minimised repeatedly, and a
  minimised tab gets no frames.

The numbers in this file therefore come from Windows Chrome in `--headless=new --enable-gpu --use-angle=d3d11`. That is the same
ANGLE/D3D11 path on the same iGPU, without a window (checked: same `UNMASKED_RENDERER` string, GPU timer queries work). The one difference
is that presentation goes through no DWM composition, so on a real window vsync pacing can differ slightly.

## Method

- **Benchmark.** `src/perf/bench.js` runs in the page and loads with `?debug=1&perf=1`.
  - Each run boots the page fresh at one preset and hosts an online TRIAL room with bots through the real lobby UI.
  - It then records frame intervals (from the game loop), `__perf.st.cpu` (JS plus GL submit), GPU ms (timer query), and draw calls and
    triangles (summed over every pass).
  - **Scenarios:**
    - `tour`: a 15 m/s fly-through of every district, started the moment the map appears. This catches first-entry hitches.
    - Fixed views, each 1.5 s settle plus 5 s recorded: `spawn`, `grassEdge` (3 m from GRASS_25), `grassIn` (crouched inside it),
      `vista` (NW corner looking SE), `barn` (interior).
    - `chase`: following the fastest-moving bot.
    - `tourWarm`: the same tour again, once everything has been seen.
  - **Runs:**
    - `auto`: auto quality with the governor live, as a player gets it.
    - Each pinned preset with the governor off, at the preset's start scale.
- **Driver.** `tests/perf/gpu-bench.mjs` (Node 22+ with no dependencies, run with Windows `node.exe`) launches its own Chrome profile with
  CDP and writes the result JSON.
- **Noise.** The laptop (15 W, shared CPU/GPU power budget, other apps on the GPU) swings GPU time by up to 2x between runs a few minutes
  apart. Cross-run before/after tables are therefore indicative only. GPU deltas for individual changes come from **same-session A/B**:
  the change was toggled at runtime in one live round, alternating 3-6 times per view, and medians were taken. That was done in the
  dev build with `__probe` helpers; `?batchab=1` keeps the batched sources so batching can be toggled.
- Raw JSON for every run is in `docs/polish/perf/*.json`.

## Before / after

"Before" is the build without these changes (`7650281`; `base-*` runs used `ddd5a3a`, which only adds trial-mode fixes), with only the benchmark copied in. "After" is this change. CPU p95 is `__perf.st.cpu`; it includes GL submit
and stalls.

### Auto quality (default settings)

Before = `base-auto.json`, after = `final-auto.json`, back to back.

| view | fps before -> after | p95 ms | p99 ms | max ms | draw calls | CPU p95 ms |
| --- | --- | --- | --- | --- | --- | --- |
| tour (first entry) | 46.6 -> 42.1 | 32 -> 35.6 | 67.2 -> 70.5 | 604 -> 907 (see below) | 549 -> 396 | 11.8 -> 10.9 |
| spawn | 58.6 -> 60 | 24.8 -> 18.3 | 31.9 -> 19.4 | 32.6 -> 22.6 | 455 -> 300 | 19.3 -> 5.7 |
| grassEdge | 51.6 -> 60 | 33.6 -> 17.8 | 77.7 -> 19 | 116 -> 20.8 | 65 -> 71 | 7.3 -> 3.4 |
| grassIn | 44.3 -> 60 | 36.4 -> 18.3 | 93.2 -> 19 | 136.6 -> 20.2 | 470 -> 296 | 20.3 -> 5.2 |
| vista | 58.3 -> 60 | 24.3 -> 19.1 | 29.3 -> 23.5 | 36.4 -> 24 | 525 -> 318 | 21.2 -> 9.8 |
| barn | 54.1 -> 60 | 32.4 -> 17.8 | 53.9 -> 18.7 | 117 -> 19.3 | 256 -> 182 | 20.7 -> 4 |
| chase | 57.2 -> 60 | 29.8 -> 18.3 | 35.2 -> 19.2 | 47.1 -> 19.4 | 297 -> 271 | 21 -> 4.6 |
| tourWarm | 55.9 -> 60 | 28.1 -> 18 | 49 -> 19.2 | 104.6 -> 21.3 | 480 -> 303 | 20.7 -> 4.5 |

Where each auto run ended up:

| Run | Ended on | Canvas | Notes |
| --- | --- | --- | --- |
| before, `before.json` | low @ 0.6 | 1152x648 | |
| before, `base-auto.json` | potato @ 0.67 | 1286x723 | |
| after, `final-auto.json` | low @ 1.0 | 1920x1080 | The 907 ms tour hitch is the menu benchmark's step up to `med` being given back, which is a full recompile. |
| after, `final-auto2.json` | low @ 0.6-0.7 | | With the boot benchmark changed to step down only: tour max 63 ms. |
| after, `final-auto3.json` | potato @ 0.67 | | Also with the p75 governor, during heavy GPU contention: 49-60 fps, tour max 88 ms. |

### `low`, both at scale 1 (1920x1080)

Before = `base-low1.json`, after = the `low` run of `final.json`. The before run was at scale 1 too: the old preset started at 0.8.

| view | fps before -> after | p99 ms | max ms | draw calls | CPU p95 ms | GPU mean ms |
| --- | --- | --- | --- | --- | --- | --- |
| tour (first entry) | 60.1 -> 60.1 | 20.3 -> 19.4 | 35.5 -> 38.6 | 470 -> 302 | 6.7 -> 4.1 | 6.9 -> 7.2 |
| spawn | 60 -> 60 | 21.9 -> 19.6 | 23 -> 20.1 | 438 -> 294 | 7.8 -> 5.8 | 8.1 -> 9.3 |
| grassEdge | 60 -> 60 | 19.9 -> 19.5 | 29.6 -> 26.8 | 63 -> 74 | 4.2 -> 2.8 | 8 -> 8.1 |
| grassIn | 55.7 -> 60 | 32.2 -> 21.4 | 82.8 -> 33.2 | 465 -> 306 | 21 -> 7.2 | 15.3 -> 10.4 |
| vista | 60 -> 60 | 23.8 -> 21 | 24.7 -> 24.7 | 525 -> 326 | 12.4 -> 7.1 | 12.1 -> 9.8 |
| barn | 60 -> 60 | 20.7 -> 20.1 | 23.3 -> 20.4 | 263 -> 185 | 6.3 -> 6.1 | 7.4 -> 8.6 |
| chase | 60 -> 60 | 20.3 -> 20.2 | 20.7 -> 30.4 | 377 -> 269 | 7.2 -> 6.3 | 5.8 -> 7.6 |
| tourWarm | 60 -> 60 | 20.2 -> 19.8 | 24 -> 20.9 | 468 -> 307 | 7.5 -> 4.5 | 6.9 -> 6.9 |

A second after run (`after2-low1.json`, in a hotter moment) gave 51.6-60 fps with p99 up to 42 ms.

### `med` / `high`, pinned, 1920x1080 (`before.json` -> `final.json`)

| view | med fps | med GPU ms | high fps | high GPU ms | high draw calls | high CPU p95 ms |
| --- | --- | --- | --- | --- | --- | --- |
| spawn | 34.7 -> 33 | 26.5 -> 28.3 | 35.1 -> 26 | 26.2 -> 36 | 629 -> 500 | 24.8 -> 13.6 |
| grassEdge | 35.7 -> 39.4 | 26.1 -> 23.6 | 38.1 -> 36.8 | 24.8 -> 25.3 | 143 -> 145 | 11.7 -> 5.9 |
| grassIn | 28.1 -> 28.2 | 33.3 -> 32.8 | 27.6 -> 23.9 | 33.9 -> 39.8 | 660 -> 497 | 27.1 -> 21 |
| vista | 30.9 -> 34 | 29.5 -> 27.2 | 29.9 -> 27 | 31.2 -> 35.5 | 733 -> 526 | 27.8 -> 10.9 |
| barn | 38.7 -> 32.8 | 24.1 -> 28.9 | 35.4 -> 28.3 | 26.1 -> 33.5 | 450 -> 374 | 17.7 -> 6.2 |
| chase | 59.1 -> 37 | 15 -> 25.3 | 43.9 -> 32.6 | 21.1 -> 27.5 | 339 -> 238 | 16 -> 13.5 |

These two runs are not comparable on GPU time. GPU ms of identical scenes moved by up to 2x between runs: the
`ab-{base,new}-{1,2}.json` interleaved runs of the two builds gave high grassIn 45 / 33 ms (before) against 36 / 49 ms (after).

Draw calls and CPU are reliable: high vista went from 733 to 526 calls and CPU p95 from 28 to 11 ms. On one earlier after run
(`after1.json`), med measured 38-60 fps.

### Same-session A/B (high, 1920x1080, GPU ms median of alternating samples)

| change | vista | grassIn | grassEdge | spawn | barn |
| --- | --- | --- | --- | --- | --- |
| grass depth prepass (final, near patches only), off -> on | 21.8 -> 22.0 | **54.7 -> 41.2** | 19.6 -> 16.3 | 22.9 -> 19.7 | 26.2 -> 28.4 |
| static batching (2000-tri limit), sources -> batches | 17.7 -> 18.9 GPU, 5.2 -> 4.3 CPU, 670 -> 532 calls | 23.5 -> 25.0, CPU 5.0 -> 4.3, 564 -> 484 | | 24.3 -> 23.4, CPU 6.9 -> 5.1, 540 -> 480 | 20 -> 22.5, CPU 5 -> 4.5 |
| (rejected) batching with a 25k-tri limit | GPU 43.7 -> 50.3, +0.7 M tris | 61.1 -> 67.8 | | | |

The batching GPU deltas are within noise (±3 ms). Earlier cost attribution, from high-preset toggles, noisy:
- whole grass: 8-12 ms
- post (bloom, SMAA): ~5-8 ms
- half resolution: -10 to -25 ms
- 12 to 2 point lights: 2-5 ms
- scenic forest: 2-5 ms
- the shadow pass: 1-3 ms

So high and med are bound by fill rate plus vertex load on this iGPU, not by one effect.

## What changed and why

1. **Static batching of the estate GLB** (`batchStatic` in `src/perf/helpers.js`, called from `src/world/mapglb.js`).
   - The problem: the pack splits props into 44 m chunks, and most chunk meshes are a few hundred triangles with one or two instances.
     381 of 617 draw calls came from such meshes, each one more per shadow cascade.
   - The fix: every non-grass, non-terrain, non-forest mesh with at most 2000 triangles (instances expanded) is baked to world space and
     merged per (top-level group, material, attribute layout, solid, 66 m cell).
   - The effect: 313 meshes become 103, and only 96k triangles lose their fine culling. A 25k limit took 381 down to 107 but added
     0.7 M triangles of lost culling plus shadow, and cost GPU time, so it was rejected.
   - It looks the same: same triangles, same materials (quantized attributes are converted to float first).
   - Merged solids keep `userData.solid`, so they stay camera blockers with a BVH.
   - Result: draw calls drop 30-40% on every preset, and `low` CPU p95 goes from 12-21 ms to 4-7 ms.
2. **Grass depth prepass** (`grassShader().prepass` in `src/world/grassfield.js`).
   - The problem: the lit grass shader has a `discard` (the hider near-fade), which disables early-z, so every overlapping blade fragment
     was fully lit.
   - The fix: a depth-only twin InstancedMesh shares geometry, instances, wind and the fade discard, and draws first (renderOrder -10).
     The lit pass then runs with `depthWrite` off, so only the front blade of each pixel is shaded.
   - Both programs declare `invariant gl_Position`, so the depths match exactly. A version with a polygon offset changed 0.3% of pixels
     and was rejected.
   - The twin only runs for patches whose bounding sphere is within 6 m of the camera (system at order 99, after every camera update).
     Far away, its extra vertex pass cost more than it saved.
   - Result: -13 ms in the crouched-in-grass view at high, -3 ms at the grass edge and spawn.
3. **Shader warm-up before the map is shown** (`render.warm(obj, patch)` in `src/render/index.js`, awaited in `mapglb.js`).
   - Before the GLB is added, it gets the preset's material swap, CSM wiring and grass patch, then `renderer.compileAsync` against the
     composer's input target. Programs are keyed on the target's colour space, so a compile for the screen would be redone.
   - Result: the first-entry tour went from a 447-575 ms freeze when the map appears to 22-38 ms max on `low` / `auto`.
   - Only 4 programs are still compiled during the tour (shadow-depth variants and a character/FX material at spawn).
4. **Governor** (`src/perf/governor.js`):
   - **Floor 0.6** (was 0.5). Below that the image is too soft to spot anyone.
   - **Each 1 s window is judged on its 75th-percentile frame**, not the mean. A compile or GC spike is not a fill-rate problem, and
     dropping the resolution would not fix it. A third of frames missing vsync still lowers the scale (test).
   - **Tier-up trial.** A tier the governor stepped up into that needs the scale at or below 0.8 within 2 min is given back and not
     retried, so the result is the lower tier at full resolution, not the higher one at 0.6. Hysteresis is unchanged: down above 18 ms,
     up below 13 ms for 5 s, one tier change per 8 s.
5. **The boot benchmark only steps down** (`src/perf/runtime.js`). It measures the title-screen backdrop, which is far cheaper than a
   round: on this iGPU it stepped up to `med`, which then either sat at 0.6 scale or fell back with a ~1 s mid-round recompile. Stepping
   up is left to the governor's 15 s of in-game headroom.
6. **`low` starts at scale 1** (`src/perf/budget.js`, was 0.8). With the CPU savings it holds 1080p at 60 fps here. The governor steps it
   down when a machine cannot.
7. **Tooling.**
   - `src/perf/bench.js`: the one-click benchmark.
   - `tests/perf/gpu-bench.mjs`: the CDP driver, with `--headless` and `--uncap`.
   - `helpers.summarize`, with tests.
   - `__camHold` moved to order 54, so the 10 Hz culling sees the held pose.
   - `?batchab=1` for the batching A/B.

8. **Hardening, after a silent-failure review.** Each fix below is re-verified: 0-pixel prepass diffs at `low` and `high`, bench
   end to end (`verify.json`: low at 1080p, 59.7-60 fps).
   - **Grass `depthWrite` is set per draw** (`onBeforeRender`). The 56 GLB grass meshes share 2 materials, so setting it on the
     material let a patch with no depth twin draw without depth, which could show a hider through it.
   - **The grass wind/fade uniforms are per page.** three only runs `onBeforeCompile` for a material's first program, so a revisited
     cached GLB kept stale uniforms.
   - **The shader warm-up is capped at 4 s and skipped on context loss.** `compileAsync` never rejects and can poll forever, which
     would have left the map unadded.
   - **The GLB build has a `.catch` that still adds what loaded.**
   - **`batchStatic` merges before it removes anything.** If a merge fails, the scene is left untouched; attribute item sizes are now
     part of the bucket key.
   - **The bench backs up the player's settings** in `localStorage['hs-bench-opts0']`. They are restored at the end, on failure, or at
     the next boot by `runtime.js` if a run was abandoned.
   - **Bench guards.** The bench refuses an unloaded map and flags hidden or timed-out samples. It caps reloads.
   - **Driver exit codes.** The driver exits 1 when there is no result, or when Chrome or the CDP connection dies.

Not changed, and why:
- **Grass blades, count, height, culling.** Grass is never distance-culled, never casts shadows, and has the same instances at every
  preset (`tests/world/grass.test.mjs`, coldwood audit).
- **Forest LOD / impostors.** Worth 2-5 ms on high in wide views. The source pack is needed to regenerate a simplified LOD with
  `scripts/estate/glb.mjs`, and runtime simplification would add load time. Next candidate.
- **Point-light count on high (12)** and **post-processing**: these change the look; left as they are.
- **Character LOD and animation rate, bot/snapshot CPU**: `src/characters`, `src/net` and the server belong to another workstream.
  `chase` CPU p95 is 4.6-13 ms, so they are not the bottleneck here.
- **Shadow update rate**: the shadow pass measured 1-3 ms, which is not worth the swimming artefacts.

## Grass and concealment checks

- `npm run test:world` (includes `tests/world/grass.test.mjs` and the coldwood grass audit) passes.
- **Seeker-view pixel comparison.** In one frame, with the same wind time, the frame was rendered with the prepass on and off and read
  back at 1920x1080. Views: grass edge, two seeker poses at 6 m and from the north, crouched inside, vista. The result was 0 differing
  pixels out of 2,073,600 in all 5 views, on both `low` (Lambert) and `high` (Standard + CSM).
- Same-settings control renders also differ by 0 pixels.
- The near-fade dither still works (`docs/polish/perf/prepass-grassEdge.png` is from this build).
- `__glb.grassState()` reports 56/56 grass meshes visible, 19,214 instances, 0 casting.
- Batching never touches grass (`isGrass` is skipped).

## Unverified

- **No real headed-window run of the final build.** The windows kept getting minimised, so the final numbers are headless (same GPU and
  ANGLE path, no DWM).
- **Thermals and contention.** GPU time varied up to 2x between runs. `auto` ended on low @ 1.0 in one run and potato @ 0.67 under
  contention in another.
- **The pixel-exactness of the prepass is proven on this Intel/D3D11 driver only.** `invariant gl_Position` makes it a spec guarantee
  on conforming drivers, but other GPUs were not tested. If a driver ignored it, the symptom would be missing grass pixels near the camera.
- **A governor tier change still recompiles every material synchronously (~0.5-0.9 s).** It happens at most a couple of times per
  session in auto mode.
- **Other maps and the procedural grass path were not benchmarked.** The prepass applies to them too.
- **Long-session stability was not measured** (GC trend over 10+ minutes). `heapMB` per view is recorded in the JSON.

## Reproduce on your Windows Chrome

**One click.** Open the game with `?debug=1&perf=1` in Chrome, for example `http://localhost:3000/?debug=1&perf=1` (after `npm run build`
and `npm start`) or the deployed site.
- Leave the window in front and do not minimise it: a hidden tab gets no frames, and the bench waits for it to become visible again.
- The page hosts a bot round, runs `auto`, `low`, `med` and `high` (it reloads itself between them, about 8 minutes in all), restores
  your settings, and shows a table with a **Copy results (JSON)** button.
- Options:
  - `&tiers=auto,low`: run only these.
  - `&secs=8`: longer samples.
  - `&scale=1`: pinned presets at full resolution.
  - `&uncap=1`: ignore the 60 fps cap. Only useful with Chrome started with `--disable-gpu-vsync --disable-frame-rate-limit`.

**Scripted.** From PowerShell in the repo (Node 22+), with the server running:

```
node tests/perf/gpu-bench.mjs --url "http://localhost:3000/?debug=1&perf=1" --out bench.json            # windowed Chrome
node tests/perf/gpu-bench.mjs --headless --url "http://localhost:3000/?debug=1&perf=1" --out bench.json # no window to minimise
```

From WSL, call Windows node directly so its arguments are not re-parsed by cmd:
`"/mnt/c/Program Files/nodejs/node.exe" tests/perf/gpu-bench.mjs ...` (WSL's localhost forwarding makes a WSL server reachable from
Windows Chrome). Start the server with `HIDE_SECS=1 SEEK_SECS=900` so the round starts at once and does not end mid-run.

**Reading the result.** Use p99 and max to judge hitches and `fps` for the mean. `cpuP95` above 16 ms means CPU-bound, and `gpuMean`
above 16 ms means GPU-bound.
