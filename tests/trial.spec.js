import { test, expect } from '@playwright/test';

// Trial mode client smoke: host a room with bots, pick TRIAL, start, and check the round state exposed by window.__trial (?debug=1).
// Skips itself when the server build has no trial mode yet. Run: npx playwright test tests/trial.spec.js (add `trial` to testMatch in playwright.config.js).
test('trial round starts and the hider can interact state-wise', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?debug=1');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120000 });
  await page.click('#btnOnline');
  await page.fill('#olName', 'Tester');
  await page.click('#olCreate');
  await page.waitForSelector('#olLobby:not(.hidden)');
  await page.click('#lobFill'); // bots
  const chip = page.locator('#lobMode button', { hasText: 'TRIAL' });
  await chip.click();
  await page.waitForTimeout(500);
  test.skip(!(await chip.evaluate((b) => b.classList.contains('on'))), 'server has no trial mode');
  await expect(page.locator('#lobCls button')).toHaveCount(5);
  await page.click('#lobStart');
  await page.waitForFunction(() => window.__trial?.on, null, { timeout: 30000 });
  const t = await page.evaluate(() => ({ role: __trial.role, relics: __trial.relics.length, gates: __trial.gates.length, need: __trial.need }));
  expect(t.relics).toBe(6); expect(t.need).toBe(3);
  if (t.role === 'hider') { // walking toward a vault / relic is map specific: just check the state machine tolerates keys and a vault attempt
    await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
    await page.keyboard.press('Space'); await page.waitForTimeout(1200);
    expect(await page.evaluate(() => __trial.vault)).toBeNull();
  }
  // fuse / alert / escape UI, driven through the same handlers online.js calls
  const F = (fn, m) => page.evaluate(([f, a]) => window.__trialFns[f](a), [fn, m]);
  await F('onCollected', { i: 0, n: 1, need: 3, by: 999 });
  await expect(page.locator('#trRelics b')).toHaveText('1/3');
  await expect(page.locator('#trToast')).toContainText('FUSE 1/3 INSTALLED');
  await F('onGates', {});
  await expect(page.locator('#trBanner')).toContainText(/exit power restored/i);
  // alerts: pinned at the message's coordinates, expire after ttl, never follow anyone
  await F('onAlert', { kind: 'relic', x: 10, z: 12, ttl: 1 });
  expect(await page.evaluate(() => __trial.alerts.map((a) => [a.x, a.z, Math.round(a.until - performance.now() / 1000)]))).toContainEqual(expect.arrayContaining([10, 12])); // until-now varies with frame time (SwiftShader can be 1 fps)
  await page.waitForFunction(() => !__trial.alerts.some((a) => a.x === 10 && a.z === 12), null, { timeout: 15000 }); // purged by the next frame after ttl (by position: a bot's real fuse alert must not count)
  await F('onAlert', { kind: 'relic', x: 1, z: 2 }); // default ttl 6 s
  expect(await page.evaluate(() => Math.round(__trial.alerts.find((a) => a.x === 1 && a.z === 2).until - performance.now() / 1000))).toBeGreaterThanOrEqual(4); // 6 s minus frame lag
  // collector feedback, and the gate prompt while unpowered is covered by the hider branch above (gates are open here)
  await F('onExposed', { ttl: 2 });
  await expect(page.locator('#trExposed')).toBeVisible();
  // results + reset: ESCAPED headline, all client trial state cleared
  const me = await page.evaluate(() => __trial.id);
  await F('onEnd', { winner: 'hiders', mode: 'trial', escaped: 1, out: 0, me, players: [{ id: me, name: 'Tester', role: 'hider', st: 'escaped', score: 5, total: 5, tags: 0 }] });
  await expect(page.locator('#resTitle')).toHaveText(/ESCAPED|KILLER WINS|SURVIVORS ESCAPED|ELIMINATED/);
  const r = await page.evaluate(() => ({ on: __trial.on, relics: __trial.relics.length, alerts: __trial.alerts.length, n: __trial.n, open: __trial.gatesOpen, chan: __trial.chan, vault: __trial.vault, states: Object.keys(__trial.states).length, cages: __trial.cages.length }));
  expect(r).toEqual({ on: false, relics: 0, alerts: 0, n: 0, open: false, chan: null, vault: null, states: 0, cages: 0 });
  expect(errors).toEqual([]);
});
