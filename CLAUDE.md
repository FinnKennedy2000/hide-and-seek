# hide-and-seek

Personal project. Commit as **Finn Kennedy <fpkm2000@gmail.com>** (set in this repo's git config). Push to
`github.com/FinnKennedy2000/hide-and-seek` using the `FinnKennedy2000` gh account token, not the work account.

- Client: static ES modules in `public/` (Three.js 0.170.0 via import map, no build step) → Vercel project
  `hide-and-seek` on the personal account (`vercel.json` forces static; `framework: null`).
- Server: `server/index.js` (Node + `ws`) serves `public/` and the `/ws` multiplayer endpoint → Railway project
  `hide-and-seek`, single replica in EU West (rooms are in memory, so never run more than 1 replica).
- Commit and push as work lands; deploy both after pushing.
- Server tests: run the server with `HIDE_SECS=1 SEEK_SECS=20 PORT=<port>` and kill it by PID, never `pkill -f`.
  Test clients must walk (the server drops moves faster than 9 m/s).
- Plan for the bigger build: `docs/PLAN-v2.md`.
