import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// Starts SEEK on every single-player map, runs 5 s, fails on any page/console error and records draw calls per frame.
// perf.json: { <map>: { callsPerFrame, trisPerFrame, frames } } (all render passes of a frame, shadow + bloom included).
const results = {};

test.afterAll(() => {
  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync('test-results/perf.json', JSON.stringify(results, null, 2));
});

test('SEEK on every map: no errors, records draw calls', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/favicon/i.test(m.text()) || /favicon/i.test(m.location().url || '')) return;
    errors.push(`console.error: ${m.text()}`);
  });
  await page.addInitScript(() => { // frame counter: the game has one rAF loop
    window.__frames = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((t) => { window.__frames++; cb(t); });
  });

  await page.goto('/');
  await page.waitForSelector('#btnSeek');
  const maps = await page.locator('#spMap button').count();
  expect(maps).toBeGreaterThanOrEqual(2);

  for (let i = 0; i < maps; i++) {
    await page.goto('/');
    await page.waitForSelector('#btnSeek');
    const chip = page.locator('#spMap button').nth(i);
    const name = (await chip.textContent()).trim();
    await chip.click();
    await page.click('#btnSeek');
    await page.waitForTimeout(3000);
    // measure over the last 2 s; renderer.info is cumulative with autoReset off
    await page.evaluate(async () => {
      const r = window.__hs?.renderer ?? (await import('/game.js')).renderer;
      r.info.autoReset = false; r.info.reset(); window.__f0 = window.__frames;
    });
    await page.waitForTimeout(2000);
    const m = await page.evaluate(async () => {
      const r = window.__hs?.renderer ?? (await import('/game.js')).renderer;
      const frames = window.__frames - window.__f0, { calls, triangles } = r.info.render;
      r.info.autoReset = true;
      return { frames, callsPerFrame: calls / Math.max(1, frames), trisPerFrame: triangles / Math.max(1, frames) };
    });
    results[name] = { ...m, callsPerFrame: Math.round(m.callsPerFrame * 10) / 10, trisPerFrame: Math.round(m.trisPerFrame) };
    console.log(name, JSON.stringify(results[name]));
    expect(m.frames, `${name}: game loop is rendering`).toBeGreaterThan(0);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
