# Trial mode: Dead by Daylight style rebuild (branch `dbd-rebuild`)

One **seeker** (picks a class) hunts up to 7 **hiders**. Hiders collect **3 relics** (6 spawn around the map) to power the exit gates, then escape through a gate. The seeker is alerted whenever a relic is collected. Built on the existing room / snapshot / lag-comp netcode; classic and prop-hunt stay as extra modes.

## Rules
- Hiders: 2 health states. Hit once = **injured** (blood marks, faster for 2 s). Hit while injured = **caged** (teleported to a cage, 40 s, then eliminated). A free teammate holds E at the cage for 4 s to free them (back as injured). 
- Relic: hold E ~6 s within 2.2 m. While channelling there is a risk pop (25% every 2 s) that screams: a `scream` alert, seeker sees a beacon at the spot. Completing one fires an alert to the seeker (beacon 5 s + HUD edge arrow).
- Exit: after 3 relics both gates open (alert to everyone). Hold E 3 s at a gate to escape.
- **Grass** (map zones): a crouched, still hider in grass is invisible to the seeker beyond 2.5 m (4 m while crouch-walking, 9 m standing, never when sprinting). Server-enforced in `visible()`.
- **Vaults**: low walls (1.2 m, not jumpable). Space near one vaults over it: 0.5 s for hiders, 1.0 s for the seeker. Client-side scripted move, the server only sees normal position updates.
- **Terror radius**: hiders hear a heartbeat and see a vignette when the seeker is within 24 m (phantom cloaked = none).
- Win: hiders win if at least half (rounded up) escape; otherwise the seeker. Time limit 6 min (remaining hiders count as eliminated).

## Seeker classes
| id | name | power (Q / right click) |
|---|---|---|
| tracker | The Tracker | sees scratch marks hiders leave when sprinting; **Scent Burst** beacons all hiders within 28 m for 3 s (cd 30 s) |
| phantom | The Phantom | **Cloak** 6 s: invisible to hiders, no terror radius, +15% speed; attacking uncloaks (cd 25 s) |
| trapper | The Trapper | carries 3 **bear traps**, places at feet; a hider stepping on one is injured + held 2.5 s, seeker gets an alert (hiders can't see traps) |
| charger | The Brute | **Rush** 1.6 s at 1.8x speed, a swing during it lunges 3.4 m; 1 s slow recovery (cd 20 s) |

## Map contract
`src/shared/maps/<id>.js` additionally exports `trial = { relics: [[x,z]...8], gates: [[x,z]x2], cages: [[x,z]...4+], grass: [{x0,x1,z0,z1}...], vaults: [{x,z,ax}], hiderSpawns: [[x,z]...], seekerStart: {x,z,yaw} }`. Maps without `trial` are not selectable in trial mode. First map: **Coldwood Farm** (66x66 m): central barn (main building with window vaults), corn / tall-grass fields, car-wreck and fence loops, ruins, two gates at opposite edges. Layout rules researched from DBD community map-design guides: objectives spread evenly, no dead zones, mix of strong and weak loops, tall grass between structures, gates far apart.

## Protocol 5 (JSON; snapshots unchanged)
client -> server: `cls {cls}`, `interact {k:start|stop, what:relic|gate|cage, i}`, `swing`, `power`, (existing `pos`, `noise`).
server -> client: `round` (adds `cls`, `relics[{i,x,z}]`, `gates`, `cages`, `grass`, `need`), `prog {what,i,p}`, `collected {i,n,need,by}`, `alert {kind,x,z}` (seeker only unless noted), `gates {open}`, `hurt {id,st}` (st: injured|caged|free|out|escaped), `terror {k}`, `marks [..]`, `pulse [..]`, `power {cd,on,n}`, `trap`, `trapped`, `cloak`, `end` (adds escaped/out counts).

## Phases (each committed)
1. Branch, nav grid enlarged to 70 m, model loader + CC0 assets, Coldwood map.
2. Server trial mode (state machine, interactions, concealment, classes, bots) + node test.
3. Client: HUD, interactions, vaults, grass, powers, alerts, heartbeat, lobby class picker.
4. Visual polish (fog, lanterns, wind grass, shadows), smoke test, build, review, deploy.
