# Hide & Seek

A quick 3D hide-and-seek game for Chrome. Procedural house and garden at dusk, Three.js from a CDN, synthesized WebAudio sound, no assets and no build step.

## Modes
- **Seek**: 5 AI hiders hide during a 10s blackout. Find them all in 120s. Get within 3m, look at one, press **E** or click. They peek and rustle, and may bolt if you get too close.
- **Hide**: hide during a 20s countdown, then survive 90s. The seeker has a vision cone and hears noise. Sprinting is loud, crouching is quiet. Stay in his sight for 0.6s and you're caught.

- **Online**: 2-8 players per room. Press ONLINE, enter a name, then Create room or Join with a 4-letter code (or open an invite link `?room=ABCD`). The host presses Start. One seeker (two if 6+ players) is frozen at the front door behind a blackout for the 30s hide phase, then hunts for 150s. Tagging a hider (E / click within 3m, in view) turns them into a seeker. Seekers win when every hider is tagged, hiders win if anyone is still free at the end. Scoring: hiders +1 per 10s survived and +5 for surviving, seekers +3 per tag. Sprinting and hard landings are heard by everyone, positionally.

## Controls
WASD move, mouse look, Shift sprint, Space jump, C or Ctrl crouch, E / click tag, Esc pause (single-player).

## Run
```
npm install
npm start        # http://localhost:3000 (PORT env var respected)
```
Needs internet for the Three.js CDN (pinned to 0.170.0). Single-player works from any static file server pointed at `public/`; online needs `npm start`.

## Architecture
- `public/`: static client (no build step). `game.js` is the world, player controller, AI and audio; `net.js` the WebSocket client (the Railway URL constant lives at its top; `?server=wss://host/ws` overrides); `online.js` lobby, round flow and HUD; `remote.js` remote avatars and interpolation.
- `server/index.js`: Node server that serves `public/`, `GET /health`, and a WebSocket endpoint at `/ws` on the same port. It is authoritative for rooms, roles, phases, timers, tags and scores. Clients send position at ~15Hz; the server broadcasts snapshots at ~15Hz and clients interpolate with a 100ms buffer.
- Deploy: the client is static on Vercel (`vercel.json` serves only `public/`); the server runs on Railway (`npm start`). Off Railway/localhost the client connects to the Railway WebSocket URL.
- Test knobs: `HIDE_SECS` and `SEEK_SECS` env vars shorten the round phases.

### Protocol (JSON `{t, ...}`)
Client to server: `create {name}`, `join {name, code}`, `leave`, `start`, `pos {x,y,z,yaw,pitch,c}`, `tag {target}`, `noise {k: sprint|land}`.
Server to client: `room {code, you, host, phase, players}`, `err {msg}`, `round {seekers, spawns, hide, seek}`, `phase {phase, tl}`, `snap {tl, hl, p}`, `tagged {by, target, hl}`, `noise {id, k, x, z}`, `end {winner, players}`.
