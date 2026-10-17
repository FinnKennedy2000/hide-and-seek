# hide-and-seek

Personal project. Commit as **Finn Kennedy <fpkm2000@gmail.com>** (set in this repo's git config). Push to
`github.com/FinnKennedy2000/hide-and-seek` using the `FinnKennedy2000` gh account token, not the work account.

- Client: ES modules in `src/`, bundled by Vite (`npm run build` -> `dist/`; Three.js 0.170.0 from npm) → Vercel project
  `hide-and-seek` on the personal account (`vercel.json`: framework vite, output `dist`). `public/` holds static files copied as-is.
- Server: `server/index.js` (Node + `ws`) serves `dist/` and the `/ws` multiplayer endpoint → Railway project
  `hide-and-seek`, single replica in EU West (rooms are in memory, so never run more than 1 replica). `railway.json` builds with Vite.
  `src/shared/` (worlddata, maps, protocol) is imported by both the client and the server.
- Dev: `npm run dev` (Vite on :5173, proxies `/ws` to the Node server: run `npm start` too). Tests: `npm run smoke` (Playwright, SwiftShader
  Chromium; needs `npx playwright install chromium` once), `npm run test:server`. New map = `src/shared/maps/<id>.js` + one import and one entry in `maps/index.js`.
- Commit and push as work lands; deploy both after pushing.
- Server tests (`npm run test:server` does this): run the server with `HIDE_SECS=1 SEEK_SECS=20 PORT=<port>` and kill it by PID, never `pkill -f`.
  Test clients must walk (the server drops moves faster than 9 m/s).
- Plan for the bigger build: `docs/PLAN-v2.md`.
