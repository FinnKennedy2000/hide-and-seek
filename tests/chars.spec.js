import { test, expect } from '@playwright/test';

// Characters: (1) 10 glTF characters add <= 40 draw calls and no errors, (2) with the model URL blocked the procedural fallback
// shows up with a toast and no pageerror. Characters are placed in the empty sky above the map so only they are measured.
const LIMIT = 40;

async function measureTen(page) {
  await page.waitForFunction(() => window.__chars && ['ready', 'failed'].includes(window.__chars.rigStatus()), null, { timeout: 30_000 });
  return page.evaluate(async () => {
    const { renderer, scene, camera, G, THREE } = window.__hs, c = window.__chars;
    document.getElementById('title').style.display = 'none';
    G.phase = 'test'; G.paused = true; // the game loop leaves the camera alone
    camera.position.set(0, 61, 10); camera.lookAt(0, 61, 0); camera.updateMatrixWorld(true);
    const calls = () => { renderer.info.reset(); renderer.render(scene, camera); return renderer.info.render.calls; };
    const hats = ['cap', 'beanie', 'bucket', 'crown', 'none'];
    const base = calls();
    const chars = [];
    for (let i = 0; i < 10; i++) {
      const ch = c.makeChar(0x336699 + i * 0x111111, { hat: hats[i % 5], pattern: ['plain', 'stripes', 'dots', 'overalls'][i % 4], seeker: i < 3 });
      ch.position.set(-9 + i * 2, 60, 0); scene.add(ch); chars.push(ch);
    }
    for (let f = 0; f < 30; f++) chars.forEach((ch, i) => c.animate(ch, 1 / 30, { speed: i * 0.6, crouch: i === 3 ? 1 : 0, air: i === 4, pitch: 0.3 }));
    chars[5].ch.play('taunt'); chars[6].ch.play('tagged'); chars[7].ch.play('victory'); chars[8].ch.play('hit');
    for (let f = 0; f < 10; f++) chars.forEach((ch) => c.animate(ch, 1 / 30, { speed: 1 }));
    const withTen = calls();
    const kinds = [...new Set(chars.map((ch) => ch.ch.kind))];
    return { base, withTen, kinds };
  });
}

function trackErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

test('10 glTF characters: no errors, draw-call increase <= 40', async ({ page }) => {
  const errors = trackErrors(page);
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text() + m.location().url)) errors.push(`console.error: ${m.text()}`); });
  await page.goto('/');
  await page.waitForSelector('#btnSeek');
  const r = await measureTen(page);
  console.log('rig characters', JSON.stringify(r), 'increase', r.withTen - r.base);
  expect(r.kinds).toEqual(['rig']);
  expect(r.withTen - r.base).toBeLessThanOrEqual(LIMIT);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('model URL blocked: procedural fallback, toast, no pageerror', async ({ page }) => {
  const errors = trackErrors(page);
  await page.route('**/models/characters/**', (route) => route.abort());
  await page.goto('/');
  await page.waitForSelector('#btnSeek');
  await page.waitForFunction(() => /Character models failed/.test(document.getElementById('toast')?.textContent || ''), null, { timeout: 30_000 });
  const r = await measureTen(page);
  console.log('procedural characters', JSON.stringify(r), 'increase', r.withTen - r.base);
  expect(r.kinds).toEqual(['procedural']);
  expect(errors, errors.join('\n')).toEqual([]);
});
