import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// UI tests: keyboard-only walk through every menu screen, an axe-core scan of the menus, and a throttled loading screen.
const AXE = fs.readFileSync(path.join(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const visible = (page, sel) => page.locator(sel).isVisible();
const errors = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/');
  await page.waitForSelector('#btnSeek');
  await page.waitForSelector('#loading', { state: 'hidden', timeout: 120000 }); // boot asset loading (audio samples) shows the loading screen first
});
test.afterEach(() => expect(errors, errors.join('\n')).toEqual([]));

test('keyboard only: every menu screen is reachable and Esc goes back', async ({ page }) => {
  const focusId = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.className || '');
  await expect.poll(focusId).toBe('btnSeek');          // focus lands on the first menu item
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await expect.poll(focusId).toBe('btnSettings');
  // Settings: all four tabs via arrows, Esc back to title
  await page.keyboard.press('Enter');
  await expect(page.locator('#settings')).toBeVisible();
  for (const name of ['Controls', 'Audio', 'Accessibility', 'Graphics']) {
    await page.keyboard.press('ArrowRight');
    if (name === 'Graphics') break;
    await expect(page.locator('#setTabs [aria-selected="true"]')).toHaveText(name === 'Controls' ? /Controls/ : name === 'Audio' ? /Audio/ : /Accessibility/);
  }
  await expect(page.locator('#setTabs [aria-selected="true"]')).toHaveText('Graphics');
  await page.keyboard.press('Escape');
  await expect(page.locator('#title')).toBeVisible();
  await expect(page.locator('#settings')).toBeHidden();
  // Online: Enter, Esc back
  await page.locator('#btnOnline').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#olMenu')).toBeVisible();
  await expect.poll(focusId).toBe('olName');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); // first Esc may only blur the name field
  await expect(page.locator('#title')).toBeVisible();
  // Map picker reachable by keyboard and selectable
  await page.locator('#spMap button').first().focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Enter');
  await expect(page.locator('#spMap button[aria-checked="true"]')).toHaveCount(1);
  // Rebind jump to J from the keyboard, then reset
  await page.locator('#btnSettings').focus(); await page.keyboard.press('Enter');
  await page.locator('#tab-controls').click();
  await page.locator('[data-bind="jump"] button').focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('Escape'); // cancels listening, stays on the screen
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('[data-bind="jump"] button').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('KeyJ');
  await expect(page.locator('[data-bind="jump"] button')).toHaveText('J');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('hs-opts')).binds.jump)).toBe('KeyJ');
  await page.keyboard.press('Escape');
  await expect(page.locator('#title')).toBeVisible();
});

test('axe-core: no serious or critical violations on the menus', async ({ page }) => {
  await page.addScriptTag({ content: AXE });
  const scan = async (label) => {
    const r = await page.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`));
    expect(r, `${label}: ${r.join('\n')}`).toEqual([]);
  };
  await scan('title');
  await page.click('#btnSettings');
  for (const t of ['graphics', 'controls', 'audio', 'access']) { await page.click(`#tab-${t}`); await scan(`settings/${t}`); }
  await page.keyboard.press('Escape');
  await page.click('#btnOnline'); await scan('online');
  for (const s of ['lobby', 'results', 'conn']) { await page.evaluate((n) => window.__hsUi.showScreen(n), s); await scan(s); }
});

test('loading screen: real progress rises monotonically over 5 s and the menu stays usable', async ({ page }) => {
  await page.route('**/__slow/*', async (route) => { const n = Number(route.request().url().split('/').pop()); await new Promise((r) => setTimeout(r, n * 1000)); route.fulfill({ status: 200, contentType: 'audio/ogg', body: 'not audio' }); });
  const samples = await page.evaluate(async () => {
    const out = [], bar = document.getElementById('loadBar');
    const t = setInterval(() => { if (!document.getElementById('loading').classList.contains('hidden')) out.push(Number(bar.getAttribute('aria-valuenow'))); }, 100);
    await window.__hsUi.preload('slow', [1, 2, 3, 4, 5].map((n) => ({ key: `s${n}`, url: `/__slow/${n}`, type: 'audio' })));
    await new Promise((r) => setTimeout(r, 800)); clearInterval(t); return out;
  });
  expect(samples.length).toBeGreaterThan(20);
  for (let i = 1; i < samples.length; i++) expect(samples[i], `sample ${i}`).toBeGreaterThanOrEqual(samples[i - 1]);
  expect(samples[0]).toBeLessThan(50); expect(samples.at(-1)).toBe(100);
  await expect(page.locator('#loading')).toBeHidden();
  await page.click('#btnSettings'); await expect(page.locator('#settings')).toBeVisible();
});
