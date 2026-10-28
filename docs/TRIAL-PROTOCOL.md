# Trial mode wire contract (PROTOCOL 5). Server and client MUST match this exactly.

Mode id `trial` (add to MODES on the server and MODE_NAMES `TRIAL` on the client; it is the default mode for new rooms). Max 8 players, 1 seeker, rest hiders. Binary snapshots and `pos` are unchanged.

## Constants (server owns them; the client gets what it needs in `round`)
RELICS_TOTAL 6 (random subset of map.trial.relics), NEED 3, RELIC_SECS 6, GATE_SECS 3, CAGE_FREE_SECS 4, CAGE_TIME 40, INJURED_BOOST 2 (s of x1.25 speed), SWING_RANGE 2.4, LUNGE_RANGE 3.4, SWING_CONE 60deg, SWING_CD 1.0 (hit) / 1.6 (miss), TRIAL_SECS 360, HIDE_SECS 15 (seeker frozen at start, as today), TERROR_R 24, INTERACT_R 2.2, SCREAM_P 0.25 per 2 s while channelling a relic.
Classes (`cls`): `tracker`, `phantom`, `trapper`, `charger`. Power cooldowns: tracker 30 (scent burst: pulse hiders within 28 m for 3 s), phantom 25 (cloak 6 s), trapper none but 3 traps carried (+1 regained when a trap is sprung), charger 20 (rush 1.6 s, then 1 s slow recovery).
Speeds the client uses (P.mul multiplier on motion.js base walk 3.9 / sprint 6.8): seeker 1.0 (walk and sprint, hiders walk the same 3.9: hiders are caught by sprinting seekers), phantom cloaked 1.15, charger rush 1.8, injured hider 1.25 for INJURED_BOOST s then 1.0, trapped 0, caged 0. Server speed cap: MAX_SPEED 9 m/s normally; 13 while `rush`.

## Client -> server
- `cls {cls}` lobby only; any of the 4 ids or `random`. Stored on the player; the seeker uses theirs (bots pick random).
- `interact {k:'start'|'stop', what:'relic'|'gate'|'cage', i}`  i = index into the round's relics / gates / cages arrays. The server validates: hider alive & free, within INTERACT_R of the target (cage: also target hider caged), relic not done / gates open / etc. Progress accrues server-side only while the player stays in range, keeps holding (client sends `stop` on release) and is not hit; moving away auto-cancels. One channel per player.
- `swing` seeker attack (server uses its own last known pos/yaw/pitch). Replies `swing {by, hit}` broadcast.
- `power` seeker power: tracker burst / phantom cloak toggle (cloak again to end early) / trapper place trap at feet / charger rush. Server checks cooldown, replies with `power` state.
- `vault {x,z}` optional no-op hint the client sends at vault start (server may ignore).

## Server -> client
- `round` (existing fields) plus, when mode==='trial': `cls` (the seeker's class id), `relics: [{i,x,z}]` (the 6 chosen, i is 0..5), `gates: [{i,x,z}]`, `cages: [{i,x,z}]`, `grass: [{x0,x1,z0,z1}]`, `vaults: [{x,z,ax}]`, `need: 3`, `trialSecs`. Hiders spawn at map.trial.hiderSpawns, seeker at map.trial.seekerStart. Seeker is frozen for HIDE_SECS.
- `prog {what,i,p}` p 0..1, broadcast to all at <=5 Hz while a channel is active and once more with p=0 on cancel (relic keeps its progress when cancelled; regress at 0.1/s only when nobody is on it - server detail), p=1 when done.
- `collected {i, n, need, by}` broadcast when a relic completes, exactly once per relic (n = relics done so far; the UI calls them fuses, wire names unchanged). Server also sends the seeker `alert {kind:'relic', x, z, ttl}` and the collector `exposed {ttl}`. Gates open only when n >= need; a gate channel is only accepted while open, and `escaped` is only ever granted by completing the 3 s gate channel in range. Everything (relics, alerts, states, cages, traps, cooldowns, bot memory) is reset by the next `round`.
- `alert {kind:'relic'|'scream'|'gate'|'trap'|'cage'|'hit', x, z, ttl}`: seeker only (kind 'gate' goes to everyone when gates open or when a gate starts opening: x,z = gate). `ttl` = seconds the beacon lives (default 6; scream 3). x,z are fixed at the moment of the event; the server never sends an update for an alert and never tracks the collector afterwards. Client draws the beacon at x,z for `ttl` s + an HUD edge arrow. Bot seekers get the same fact in `b.lastAlert`.
- `exposed {ttl}` to the hider(s) who just completed a relic (the UI says "fuse"): the seeker was alerted to that spot for `ttl` s (6). Sent once per relic, never for a duplicate completion.
- `gates {open:true}` broadcast when n===need (also in resume `round` as `gatesOpen`).
- `hurt {id, st, cage?}` broadcast: st in `injured` (hit once or trap), `caged` (cage = cage index; player teleported by the next snapshot, client plays caged pose), `free` (rescued -> injured), `out` (eliminated), `escaped`. Also `swing {by, hit: id|0}`.
- `terror {k}` to hiders only, k 0..1 (1 = on top of you), sent when the 0.1-rounded value changes (max 5 Hz); 0 once when leaving the radius. Phantom cloaked: always 0.
- `marks [{x,z}]` to the tracker only, appended (max 40 kept client-side): scratch marks hiders leave while sprinting (every 0.5 s) or injured (every 0.8 s, blood).
- `pulse [{id,x,z}]` to the seeker for scent burst (3 s beacons). Also sent for trap springs? No: that is `alert trap`.
- `power {cls, cd, on, n}` to the seeker whenever its power state changes: cd seconds left, on = power currently active (cloak/rush), n = traps carried (trapper) else 0. Broadcast `cloak {id,on}` to everyone (fx only; hiders still receive no position for a cloaked seeker beyond 3 m... actually none, except within 3 m).
- `trap {i,x,z,gone?}` to the seeker only: placed / sprung (gone:1). `trapped {id, i}` broadcast when sprung (hider id, held 2.5 s).
- `end {winner:'hiders'|'seekers', mode:'trial', players:[{id,name,color,role,score,total,tags, st:'escaped'|'out'|'free'|'caged'|null}], escaped, out}`.
- Scores: relic done +3 (channeller), gate escape +5, rescue +4, hit +2 (seeker), cage +3 (seeker), escape of last... keep simple; hiders `score` also +1 per 10 s alive as today.
- resume (`round {resume:1,...}`) must carry relics progress/done flags: `relics: [{i,x,z,p,done}]`, `gatesOpen`, and `states: {id: st}`.
- Reuse `phase`, `snap`, `room`, `noise`, `conn`, `err`.

## Concealment (server, `visible()`)
For receiver r = seeker and other o = hider with o inside any `grass` rect: hidden (not visible, regardless of LOS) when distance > R, where R = 2.5 if o.c > 0.6 and o speed < 1; 4 if o.c > 0.6 and moving; 9 if standing; no concealment if o is sprinting (speed > 5.5) or injured-boosted or the seeker has `reveal`. Speed derived server-side from successive `pos`. Hiders always see other hiders; a cloaked seeker is invisible to hiders (not sent) beyond 3 m.

## Class ids -> display (client)
tracker "The Tracker", phantom "The Phantom", trapper "The Trapper", charger "The Brute".
