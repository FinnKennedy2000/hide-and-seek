# Polish pass (branch `polish/coldwood`, from `dbd-rebuild`)

## Diagnosis (baseline: docs/polish/before/)
Seekers: human (online, picks a class) or bot (trialbots.js). Hiders: human or bot. Trial is only reachable via Online -> Create room -> Fill with bots.
What holds it back, from the running game:
1. **Characters clash with the world**: pale grey toy-robots with riveted helmets and bright colour pips in a dusk horror farm; light, uniformly lit, read from 40 m. Floating "Bot 4" name label over teammates.
2. **Sparse, flat set dressing**: 13 props on a 66 m map, flat-shaded low-poly trees/fences, little storytelling or practical lighting.
3. **Hiding feels unfair/unproven**: concealment is a server rule in `visible()` (hidden flag, distance bands), not something a human seeker sees. Grass is short tufts that do not cover a crouched body; no verified "seeker view".
4. **Pursuit**: a hider was injured ~10 s in with no warning; HUD tint is heavy; the bot seeker is not perception-based (needs checking against trialbots.js).
5. **Map**: one 66 m field; needs districts, a loop budget, and measured travel times.
6. Known open issues: duplicate `updateTrialFx` call; 2 failing legacy server tests (house shot-through-wall, forged-pong rewind) not yet compared against main.

## Plan
A. Visual direction: overgrown logging compound at dusk (sawmill, yard, reeds, rocky service road). Restrained fog, graded light, lamps.
B. Characters: muted workwear, no outline/rim/label on concealed players, feet grounded, crouch pose.
C. Grass: tall dense instanced fields that survive every quality preset; fade-near-camera must not hide/show opponents.
D. Perception: seeker bots see via FOV + multi-point LOS + grass density; see/hear/investigate/chase states; last-known-position memory.
E. Map: 5 districts, alt routes, 2 separated exits, vaults + 1 door; measured travel times.
F. Loop: 3 fuses, per-collection alert that expires, escape gating tests, reset tests.
G. Feel/audio/perf: movement, camera collision, footsteps, ambience, reduce-shake option, perf numbers.
H. Browser playtest of every scenario with evidence; tests; review agents.
