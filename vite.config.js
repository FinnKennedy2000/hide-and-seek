// `npm run dev` serves the client on :5173 and proxies /ws to the Node server (`npm start`, PORT 3000 by default).
// `npm run build` writes dist/, which server/index.js and Vercel serve. (CommonJS because the root package.json is CommonJS for server/.)
module.exports = {
  server: { proxy: { '/ws': { target: `ws://localhost:${process.env.PORT || 3000}`, ws: true } } },
  // three.js in its own long-cached chunk (game code changes every deploy, three does not); post-processing addons load with the game
  build: { chunkSizeWarningLimit: 1200, rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/three/') || id.includes('node_modules/three-mesh-bvh/') ? 'three' : undefined) } } },
};
