# Playtest results (Playwright, Chromium on SwiftShader/CPU, real key input; evidence in docs/polish/after/)

Caveats: SwiftShader gives 1-8 fps here (game dt is capped at 0.05 s, so the game runs slower than real time), numbers are NOT GPU-representative. Seeker/hider walking used real W/Shift/C/E key presses with yaw steered through `__P.yaw`; the "hider" in scenarios 2, 3, 4a was a ws client walking at <=5 m/s. Map-tour camera positions (7) were held with `__grassTest.set` (same camera, not walked).

| # | scenario | method | observed | evidence | result |
|---|---|---|---|---|---|
| 1 | loads, starts, movement, crouch, sprint, E | browser seeker + hider sessions, keys | loads, round starts, W moves player, C sets crouch to 1.0, E channelled a relic (chan set, prompt shown), no page errors after fix | s4h_*.png, s2b_* | PASS (mouse look UNVERIFIED: no pointer lock headless, yaw set via __P) ; Shift speed not separately measured (fps too low) |
| 2 | concealment, seeker view | seeker browser at 1.4-14 m from E/N/W, stage hider: open / standing / crouch-still / crouch-walk / sprint in grass | crouch-still hidden by server beyond 2.5 m, crouch-walk beyond 4 m, standing beyond 9 m, sprinting never; `__remotes` gone flag matched the rule in every settled sample. Visually: crouched body never pokes out; at 1.4 m looking down only a dark partial silhouette; standing head/shoulders show above grass at ~2.5 m; at 7 m even a standing/sprinting hider is invisible visually (server sends it, grass covers it, only tracker marks/noise point to it). No label/shadow/outline when hidden (avatar removed). | s2_*, s2b_*, s2c_*.png, scen2*.json | PASS; note: in the 2.5-9 m band the server is more generous to the seeker than the visuals. Some moving-state samples were stale for lag (retaken in s2b) |
| 3 | solid cover + pursuit | bot seeker (fill bots), ws hider breaks LOS round the sawmill, /botdebug (BOT_DEBUG env) | after LOS broke mem stayed at last seen (-17.4,6.1) while hider moved 7 m; bot went to mem, searched nearby grass ~13 s, then patrol | s3_bot_pursuit_trace.json | PASS (not a clean wall-only break: bot regained sight once it rounded the corner) |
| 4 | collect/alerts/escape | (a) ws hider live: gate at 0/1/2 fuses, collect, 3 -> escape, browser seeker UI; (b) browser human hider, real keys, E | gate with 0/1/2 fuses: no gate prog, no escape (live). Each fuse: collected msg once, hider got `exposed`, seeker alert (6 s, fixed coords) appeared then expired; EXIT POWERED banner at 3; gate hold 3 s -> `escaped`, round end hiders win. Human: "Gate unpowered" at 0 fuses, held E 6.3 s -> FUSE 1/3 toast, collector feedback visible, banner at 3/3, held E at gate 5.6 s -> escaped | s4_fuse*_alert/expired.png, s4_gates_open_seeker.png, s4_end_seeker.png, s4h_*.png, scen4a.json, s4h_human_run.log.json, s4_human_gate0_run1.log.json | PASS (human collected 1 fuse himself, a ws collector the other 2) |
| 5 | loss + restart | browser hider walks into bot seeker | injured at 21 s, caged at 29 s, results screen "SURVIVORS ESCAPED, 4 escaped 1 eliminated"; Play again: client n=0, alerts 0, states {}, gates closed, HUD 0/3, relics fresh; server bots hasAlert false, st free | s5_state_*.png, s5_results.png, s5_restarted.png | PASS |
| 6 | graphics presets | quality potato..ultra via hs-opts, autoQuality off, same seeker/hider spots | grass clumps 3563 / 96k tris identical at every preset; stand/crouch hidden-state identical; calls 100/100/218/210/249 | s6_<preset>_stand/crouch/wide.png, scen6.json | PASS |
| 7 | map districts | hold-camera tour, 15 shots | see issues below | s7_*.png | PASS (camera held, not walked) |
| 8 | performance | rAF sampling, renderer.info, console/requestfailed | spawn 3.8 fps, in dense grass 4.4 fps (225 ms mean, p95 500), open yard 5.2, sawmill 7.4, woods 4.3 at 960x540 (SwiftShader); 60-194 draw calls, 135-173k tris (autoQuality had fallen to potato); 0 console errors, 0 failed requests after fix | scen78 numbers in this table | Frame times PASS/UNREPRESENTATIVE; chase fps UNVERIFIED (not sampled) |

## Visual problems seen (map)
- Rocky route banks/boulders are big flat-shaded untextured boxes (cw_stone), read as blocky placeholders (s7_rocks_a/b). Not fixed (needs a rock texture or geometry).
- Gantry crane is plain ochre boxes; wrecked truck is a dark blob (s7_yard_*, s7_sawmill_a). Not fixed.
- Sawmill interior, woods, marsh, gates look fine; no floating objects or stretched UVs spotted; collision matched in the walked routes.

## Fixes made
- src/world/models.js: GLB prop parts kept morphAttributes with no morphTargetInfluences, so three threw `Cannot read properties of undefined (reading 'length')` (renderBufferDirect/WebGLMorphtargets) every frame, ~1300 errors per session; stripped morph targets. 0 errors in 5+ runs after.
- tests/trial.spec.js: alert-expiry assertions were racy (bot fuse alerts, frame lag); now by position and waitForFunction. 4/4 pass.
- src/ui/hud.js + src/audio/trial.js: trial alert captions said "Taunt" / "Disguise poof" / "Paint splat"; now Fuse installed / Gate powered / Scream / Cage / Hit.
- Debug hooks: window.__remotes (?debug=1) in src/net/remote.js, /botdebug in server/index.js only when BOT_DEBUG is set.

## Test suites
build OK; test:world 50/50; test:chars 9/9; trialbots 15/15; test:server all 8 files pass (this run); trial.spec 4/4. `npm run test:audio` fails on HEAD too (imports renderer.js, needs document in Node), unrelated.
