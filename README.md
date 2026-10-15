# Hide & Seek

A quick 3D hide-and-seek game for Chrome. Procedural house and garden at dusk, Three.js from a CDN, synthesized WebAudio sound, no assets and no build step.

## Modes
- **Seek**: 5 AI hiders hide during a 10s blackout. Find them all in 120s. Get within 3m, look at one, press **E** or click. They peek and rustle, and may bolt if you get too close.
- **Hide**: hide during a 20s countdown, then survive 90s. The seeker has a vision cone and hears noise. Sprinting is loud, crouching is quiet. Stay in his sight for 0.6s and you're caught.

## Controls
WASD move, mouse look, Shift sprint, Space jump, C or Ctrl crouch, E / click tag, Esc pause.

## Run
```
npm start        # http://localhost:3000 (PORT env var respected)
```
Needs internet for the Three.js CDN (pinned to 0.170.0). Any static file server also works.
