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
  expect(errors).toEqual([]);
});
