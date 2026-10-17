import { test, expect } from '@playwright/test';

// Movement and input feel, in the real game: blur stops the player; reload + boss key still resolves via the server ammo sync.
const errors = (page, list) => {
  page.on('pageerror', (e) => list.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text() + (m.location().url || ''))) list.push(`console.error: ${m.text()}`); });
};

test('holding W then window blur stops the player within 100 ms', async ({ page }) => {
  const errs = []; errors(page, errs);
  await page.goto('/');
  await page.waitForSelector('#btnHide');
  await page.click('#btnHide'); // HIDE mode: the player can move during the countdown
  await page.waitForTimeout(500);
  await page.waitForFunction(() => window.__phys() === 'rapier', null, { timeout: 60000 }); // Rapier WASM loaded and driving the player
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1000);
  const speed = () => page.evaluate(() => Math.hypot(window.__P.vx, window.__P.vz));
  await page.waitForFunction(() => Math.hypot(window.__P.vx, window.__P.vz) > 1.5, null, { timeout: 30000 }); // slow SwiftShader frames: just prove it is moving
  expect(await speed(), 'moving while W is held').toBeGreaterThan(1.5);
  // timed inside the page: under SwiftShader the Playwright round trip alone can exceed 100 ms
  const r = await page.evaluate(() => { const t0 = performance.now(); window.dispatchEvent(new Event('blur')); return { v: Math.hypot(window.__P.vx, window.__P.vz), ms: performance.now() - t0 }; });
  expect(r.v, 'stopped right after blur').toBeLessThan(0.05);
  expect(r.ms).toBeLessThan(100);
  const p0 = await page.evaluate(() => [window.__P.x, window.__P.z]);
  await page.waitForTimeout(300);
  const p1 = await page.evaluate(() => [window.__P.x, window.__P.z]);
  expect(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), 'no drift after blur').toBeLessThan(0.01);
  await page.keyboard.up('KeyW');
  expect(errs, errs.join('\n')).toEqual([]);
});

test('R reload, boss key for 2 s, boss key again: reloading resolves via the server ammo sync', async ({ browser }) => {
  test.setTimeout(300_000);
  const errs = [];
  const mk = async () => { const ctx = await browser.newContext(); const page = await ctx.newPage(); errors(page, errs); await page.goto('/'); return { ctx, page }; };
  const a = await mk(), b = await mk();
  await a.page.click('#btnOnline'); await a.page.fill('#olName', 'Ann'); await a.page.click('#olCreate');
  await a.page.waitForSelector('#lobCode');
  const code = (await a.page.textContent('#lobCode')).trim().slice(-4);
  await b.page.click('#btnOnline'); await b.page.fill('#olName', 'Bob'); await b.page.fill('#olCode', code); await b.page.click('#olJoin');
  await expect(a.page.locator('#lobList li')).toHaveCount(2);
  await a.page.locator('#lobMode button', { hasText: 'PROP HUNT' }).click();
  await expect(a.page.locator('#lobStart')).toBeEnabled();
  await a.page.click('#lobStart');
  const role = (p) => p.evaluate(() => window.__ph?.on && window.__ph.role);
  await expect.poll(async () => (await role(a.page)) && (await role(b.page)), { timeout: 60000 }).toBeTruthy();
  const s = (await role(a.page)) === 'seeker' ? a.page : b.page;
  await s.waitForFunction(() => window.__ph.phase === 'seek', null, { timeout: 60000 });
  await s.evaluate(() => { document.activeElement?.blur(); window.__phFire(); });
  await s.waitForFunction(() => window.__ph.mag < 6, null, { timeout: 30000 }); // server confirmed the shot (ammo sync)
  await s.waitForTimeout(350); // fire gap
  await s.keyboard.press('KeyR');
  expect(await s.evaluate(() => window.__ph.reloading), 'optimistic reloading flag').toBe(true);
  await s.keyboard.press('Backquote');
  await s.waitForTimeout(2000);
  await s.keyboard.press('Backquote');
  await s.waitForFunction(() => !window.__ph.reloading && window.__ph.mag === 6, null, { timeout: 30000 });
  expect(errs, errs.join('\n')).toEqual([]);
  await a.ctx.close(); await b.ctx.close();
});
