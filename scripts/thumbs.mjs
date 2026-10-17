// Renders the 320x180 map-picker thumbnails headlessly: node scripts/thumbs.mjs [mapId...]
// Starts `vite` on port 3605 (or THUMB_PORT), opens the game in headless Chromium (SwiftShader), asks the live modules to build each map,
// hides roofs / ceilings, renders one frame from a fixed vantage point and lets the browser encode it as webp into public/thumbs/<id>.webp.
// meta.thumbnail in each map file points at /thumbs/<id>.webp (Vite serves public/ at the site root).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const PORT = process.env.THUMB_PORT || 3605;
// camera = [x, y, z] position, look = [x, y, z] target, fov in degrees
const VIEWS = {
  house: { camera: [0, 22, 26], look: [0, 0, 0], fov: 55 },
  lateshop: { camera: [0, 30, 36], look: [0, 0, -2], fov: 55 },
  school: { camera: [0, 36, 24], look: [0, 0, 1], fov: 50 },
  museum: { camera: [0, 34, 26], look: [0, 0, 0], fov: 50 },
  funfair: { camera: [0, 40, 30], look: [0, 0, 0], fov: 54 },
  office: { camera: [0, 21, 14], look: [0, 0, 0], fov: 50 },
};
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['school', 'museum', 'funfair', 'office'];
fs.mkdirSync('public/thumbs', { recursive: true });
const vite = spawn('node', ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 500)); }
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/`);
  await page.waitForSelector('#btnSeek');
  for (const id of ids) {
    const v = VIEWS[id];
    const url = await page.evaluate(async ({ id, v }) => {
      const { setWorld } = await import('/src/world/build.js');
      const { renderer, scene, camera } = window.__hs;
      const { mat } = await import('/src/world/materials.js');
      setWorld(id);
      const hide = new Set(Object.keys(mat).filter((n) => /ceiling|roof/i.test(n)).map((n) => mat[n]));
      scene.traverse((o) => { if (o.isMesh && hide.has(o.material)) o.visible = false; });
      scene.fog = null; // overview shots: no distance fog, a little extra fill so night maps read at 320 px
      scene.traverse((o) => { if (o.isHemisphereLight) o.intensity *= 1.8; });
      camera.fov = v.fov; camera.aspect = 16 / 9; camera.near = 0.5; camera.far = 600; camera.updateProjectionMatrix();
      camera.position.set(...v.camera); camera.lookAt(...v.look);
      renderer.render(scene, camera);
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      c.getContext('2d').drawImage(renderer.domElement, 0, 0, 320, 180); // same task as render(): the drawing buffer is still valid
      return c.toDataURL('image/webp', 0.85);
    }, { id, v });
    fs.writeFileSync(`public/thumbs/${id}.webp`, Buffer.from(url.split(',')[1], 'base64'));
    console.log(`public/thumbs/${id}.webp`, fs.statSync(`public/thumbs/${id}.webp`).size, 'bytes');
  }
  if (errors.length) console.warn('page errors:', errors.join('\n'));
} finally { await browser?.close(); vite.kill('SIGTERM'); }
