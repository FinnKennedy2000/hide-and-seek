// `npm run dev` serves the client on :5173 and proxies /ws to the Node server (`npm start`, PORT 3000 by default).
// `npm run build` writes dist/, which server/index.js and Vercel serve. (CommonJS because the root package.json is CommonJS for server/.)
module.exports = {
  server: { proxy: { '/ws': { target: `ws://localhost:${process.env.PORT || 3000}`, ws: true } } },
  build: { chunkSizeWarningLimit: 1200 },
};
