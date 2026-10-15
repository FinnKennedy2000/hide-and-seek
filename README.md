# Hide & Seek

A quick 3D hide-and-seek game for Chrome. Procedural house and garden at dusk, Three.js from a CDN, synthesized WebAudio sound, no assets and no build step.

## Modes
- **Seek**: 5 AI hiders hide during a 10s blackout. Find them all in 120s. Get within 3m, look at one, press **E** or click. They peek and rustle, and may bolt if you get too close.
- **Hide**: hide during a 20s countdown, then survive 90s. The seeker has a vision cone and hears noise. Sprinting is loud, crouching is quiet. Stay in his sight for 0.6s and you're caught.

- **Online**: 2-8 players per room. Press ONLINE, enter a name, then Create room or Join with a 4-letter code (or open an invite link `?room=ABCD`). The host presses Start. One seeker (two if 6+ players) is frozen at the front door behind a blackout for the 30s hide phase, then hunts for 150s. In **Classic** mode, tagging a hider (E / click within 3m, in view) turns them into a seeker. Seekers win when every hider is tagged, hiders win if anyone is still free at the end. Scoring: hiders +1 per 10s survived and +5 for surviving, seekers +3 per tag. Sprinting and hard landings are heard by everyone, positionally.

- **Prop Hunt** (online, host picks the mode in the lobby next to Classic): hiders are third-person and blend in; seekers are first-person with a 6-shot paint blaster.
  - Hiders: **F** look at a prop within 4m to become it (0.5s puff, 3s cooldown; F again with nothing targeted reverts), **G** camouflage (tint toward the surface you touch), **R** rotation lock + mouse wheel for 45 degree turns, **T** taunt (+2 score, 10s cooldown, everyone hears it). Tells: disguised movement is 60% speed and makes a scrape noise; idle props wobble every 20-40s.
  - Seekers: click shoots, **R** reloads (1.2s). 6 per mag, 2 spare mags. A miss costs 8 health (100 total); at 0 you are out and spectate in free-cam. A hit tags the hider (they become a seeker with one mag), gives +3 and an extra mag (+6 shots). One ammo crate (+6) appears mid-round. Hiders win on timeout or when every seeker is out of health, or out of ammo with no crate left.
  - Everyone picks a colour, hat (none/cap/beanie/bucket/crown) and outfit (plain/stripes/dots/overalls) in the lobby; the server validates the enums.
  - Hit detection is server-side: origin within 1.5m of the seeker, unit direction, 0.25s fire gap, a box per hider sized by the prop it is copying, and the shared collider list for wall occlusion.

## Controls
WASD move, mouse look, Shift sprint, Space jump, C crouch, E / click tag, Esc or P pause. Pause (and the backtick boss key, from anywhere, which also mutes) shows a fake analytics dashboard; resume, quit and leave-room are in its avatar menu. Online keeps running behind it. Games go fullscreen with keyboard lock so Ctrl+W/T do not leave the tab, and closing the tab mid-round asks for confirmation.

## Run
```
npm install
npm start        # http://localhost:3000 (PORT env var respected)
```
Needs internet for the Three.js CDN (pinned to 0.170.0). Single-player works from any static file server pointed at `public/`; online needs `npm start`.

## Architecture
- `public/`: static client (no build step). `game.js` is the world, player controller, AI and audio; `net.js` the WebSocket client (the Railway URL constant lives at its top; `?server=wss://host/ws` overrides); `online.js` lobby, round flow and HUD; `remote.js` avatars (character or disguised prop) and interpolation; `worlddata.js` the deterministic world layout (colliders, disguisable props, ray helper) imported by both client and server; `character.js` procedural characters (`char.js` adapts them); `prophunt.js` + `blaster.js` the Prop Hunt client; `bossscreen.js` the fake work screen. `public/package.json` marks the folder as ES modules so Node can import `worlddata.js`.
- `server/index.js`: Node server that serves `public/`, `GET /health`, and a WebSocket endpoint at `/ws` on the same port. It is authoritative for rooms, roles, phases, timers, tags and scores. Clients send position at ~15Hz; the server broadcasts snapshots at ~15Hz and clients interpolate with a 100ms buffer.
- Deploy: the client is static on Vercel (`vercel.json` serves only `public/`); the server runs on Railway (`npm start`). Off Railway/localhost the client connects to the Railway WebSocket URL.
- Test knobs: `HIDE_SECS` and `SEEK_SECS` env vars shorten the round phases.

### Protocol (JSON `{t, ...}`)
Client to server: `create {name}`, `join {name, code}`, `leave`, `start`, `mode {mode: classic|prophunt}` (host, lobby), `cosmetic {color?, hat?, outfit?}` (lobby), `pos {x,y,z,yaw,pitch,c}`, `tag {target}` (classic), `noise {k: sprint|land|scrape}`, and Prop Hunt: `disguise {propId|null}`, `camo {c}`, `taunt`, `shoot {ox,oy,oz,dx,dy,dz}`, `reload`, `grab`.
Server to client: `room {code, you, host, phase, mode, players[{id,name,color,hat,outfit,total}]}`, `err {msg}`, `round {mode, seekers, spawns, hide, seek}`, `phase {phase, tl}`, `snap {tl, hl, p}`, `tagged {by, target, hl}`, `noise {id, k, x, z}`, `end {winner, mode, players[{..., tags, shots, hits, surv}]}`, and Prop Hunt: `disguise {id, propId}`, `camo {id, c}`, `taunt {id, x, z}`, `shot {by, hit, x,y,z, ox,oy,oz}`, `out {id}`, `ammo {mag, res, hp, rl}` (to the owner), `pickup {x, z}`, `picked {by}`.
