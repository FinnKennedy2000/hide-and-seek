import { test, expect } from '@playwright/test';

// Disguise clones are rebuilt from each prop's source geometry (the world itself is merged per material): every prop of every
// map must still produce a clone whose size matches the prop's bounds and whose origin is on the floor at the footprint centre.
test('makePropClone works for every prop on every map, at both material tiers', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/'); await page.waitForSelector('#btnSeek');
  const maps = await page.locator('#spMap button').count();
  for (let i = 0; i < maps; i++) {
    await page.goto('/'); await page.waitForSelector('#btnSeek');
    await page.locator('#spMap button').nth(i).click(); await page.click('#btnSeek');
    await page.waitForFunction(() => window.__perf);
    for (const tier of ['high', 'potato']) {
      const bad = await page.evaluate((tier) => {
        const { THREE } = window.__hs, P = window.__perf; P.gov.enabled = false; P.gov.setTier(tier);
        const out = []; const bb = new THREE.Box3(), sz = new THREE.Vector3(), c = new THREE.Vector3();
        for (const pr of P.props) {
          const g = P.makePropClone(pr.id); g.updateMatrixWorld(true); bb.setFromObject(g);
          if (bb.isEmpty()) { out.push(`${pr.name}: empty`); continue; }
          bb.getSize(sz); bb.getCenter(c);
          const tol = 0.05, ok = (m, p) => m <= 1.4 * p + tol && m >= 0.6 * p - tol; // bounds in worlddata are analytic estimates (round meshes differ by up to ~20%)
          if (!ok(sz.x, pr.w) || !ok(sz.y, pr.h) || !ok(sz.z, pr.d)) out.push(`${pr.name}: size ${sz.x.toFixed(2)},${sz.y.toFixed(2)},${sz.z.toFixed(2)} vs ${pr.w.toFixed(2)},${pr.h.toFixed(2)},${pr.d.toFixed(2)}`);
          if (Math.abs(c.x) > 0.3 || Math.abs(c.z) > 0.3 || Math.abs(bb.min.y) > 0.3) out.push(`${pr.name}: origin off (${c.x.toFixed(2)}, ${bb.min.y.toFixed(2)}, ${c.z.toFixed(2)})`);
        }
        return { n: P.props.length, out };
      }, tier);
      expect(bad.n).toBeGreaterThan(10);
      expect(bad.out, `map ${i} ${tier}`).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});
