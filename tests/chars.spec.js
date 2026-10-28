import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Characters in the real page: (1) GLB models are the primary path: scale, ground contact, +Z facing, crouch tops, no glow on hiders, held props,
// 10 characters add <= LIMIT draw calls; (2) with the model URLs blocked the procedural humans take over, visibly (console.error + failed status).
// Characters are placed in the empty sky above the map (y = 60) so only they are measured. Screenshots go to docs/polish/chars/.
const LIMIT = 40;
const SHOTS = path.join(process.cwd(), 'docs', 'polish', 'chars');

function trackErrors(page, { allow = [] } = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/i.test(m.text() + m.location().url) && !allow.some((r) => r.test(m.text()))) errors.push(`console.error: ${m.text()}`); });
  return errors;
}
const ready = (page) => page.waitForFunction(() => window.__chars && ['ready', 'failed'].includes(window.__chars.rigStatus()), null, { timeout: 60_000 });
const stage = (page) => page.evaluate(() => {
  const { scene, camera, G, THREE } = window.__hs;
  document.getElementById('title').style.display = 'none'; G.phase = 'test'; G.paused = true;
  const gnd = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x3c4636, roughness: 1 })); gnd.rotation.x = -Math.PI / 2; gnd.position.set(0, 60, 0);
  const key = new THREE.DirectionalLight(0xfff0d8, 3); key.position.set(3, 66, 6); key.target.position.set(0, 60, 0);
  scene.add(gnd, key, key.target, new THREE.AmbientLight(0xffffff, 1.6));
  camera.fov = 35; camera.aspect = 1100 / 700; camera.updateProjectionMatrix(); camera.position.set(2.2, 61.2, 5.2); camera.lookAt(0, 60.95, 0); camera.updateMatrixWorld(true);
});

// one character in one state; returns its measurements and leaves it in the scene for a screenshot
const place = (page, who, a) => page.evaluate(([who, a]) => {
  const { scene, THREE } = window.__hs, c = window.__chars;
  if (window.__cur) { scene.remove(window.__cur); c.disposeChar(window.__cur); }
  const ch = c.makeChar(0x336699, { seeker: who !== 'hider', cls: who === 'hider' ? null : who });
  ch.position.set(0, 60, 0); scene.add(ch); window.__cur = ch;
  for (let f = 0; f < 60; f++) c.animate(ch, 1 / 30, a);
  ch.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(ch, true), p = new THREE.Vector3(), q = new THREE.Vector3(), I = ch.ch;
  const glow = []; ch.traverse((o) => { if (o.isMesh && o.material.emissive && o.material.emissive.getHex() > 0) glow.push(o.name); });
  let toe = null; const fl = ch.getObjectByName('footL'), tl = ch.getObjectByName('toeL');
  if (fl && tl) { fl.getWorldPosition(p); tl.getWorldPosition(q); toe = +(q.z - p.z).toFixed(3); } // + = the toe points to +Z, the game's forward
  return { kind: I.kind, top: +(bb.max.y - 60).toFixed(3), minY: +(bb.min.y - 60).toFixed(3), headTop: +I.headTop().toFixed(3), glow, toe };
}, [who, a]);

async function shot(page, name) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), clip: { x: 300, y: 50, width: 500, height: 600 } });
}

test('GLB characters: scale, ground contact, facing, crouch, no glow on hiders, held props, screenshots', async ({ page }) => {
  const errors = trackErrors(page);
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/'); await page.waitForSelector('#btnSeek'); await ready(page);
  expect(await page.evaluate(() => window.__chars.rigStatus())).toBe('ready');
  await stage(page);

  const idle = await place(page, 'hider', {}); await shot(page, 'hider_idle');
  const walk = await place(page, 'hider', { speed: 1.4 }); await shot(page, 'hider_walk');
  const run = await place(page, 'hider', { speed: 6.8 }); await shot(page, 'hider_run');
  const crouch = await place(page, 'hider', { crouch: 1 }); await shot(page, 'hider_crouch');
  const crouchWalk = await place(page, 'hider', { crouch: 1, speed: 2 }); await shot(page, 'hider_crouchwalk');
  console.log('hider', JSON.stringify({ idle, walk, run, crouch, crouchWalk }));
  for (const r of [idle, walk, run, crouch, crouchWalk]) { expect(r.kind).toBe('glb'); expect(r.minY).toBeGreaterThan(-0.02); expect(r.minY).toBeLessThan(0.05); expect(r.glow, 'a hider must not glow').toEqual([]); expect(r.toe).toBeGreaterThan(0.05); }
  expect(idle.top).toBeGreaterThan(1.69); expect(idle.top).toBeLessThan(1.76); // START_HERE: 1.7235
  expect(crouch.top).toBeGreaterThan(1.12); expect(crouch.top).toBeLessThan(1.19); // 1.1541
  expect(crouchWalk.top).toBeGreaterThan(1.15); expect(crouchWalk.top).toBeLessThan(1.23); // 1.1941
  expect(Math.abs(idle.headTop - idle.top)).toBeLessThan(0.05); expect(Math.abs(crouch.headTop - crouch.top)).toBeLessThan(0.05);

  for (const cls of ['tracker', 'phantom', 'trapper', 'charger']) {
    const r = await place(page, cls, cls === 'phantom' ? { speed: 0 } : {}); await shot(page, `${cls}_idle`);
    if (cls !== 'phantom') { await place(page, cls, { speed: 1.4 }); await shot(page, `${cls}_walk`); const c = await place(page, cls, { crouch: 1 }); await shot(page, `${cls}_crouch`); expect(c.minY).toBeGreaterThan(-0.02); expect(r.toe).toBeGreaterThan(0.05); }
    else { await place(page, cls, { speed: 3 }); await shot(page, 'phantom_move'); }
    console.log(cls, JSON.stringify(r));
    expect(r.kind).toBe('glb'); expect(r.top).toBeGreaterThan(1.8); expect(r.top).toBeLessThan(2.2);
    if (cls === 'phantom') expect(r.glow.length, 'phantom eyes are the only glow').toBeGreaterThan(0); // seeker-only
  }

  // held prop: visible by default for trapper / brute / tracker, hidden by setHeld(false), no duplicate meshes
  const held = await page.evaluate(() => {
    const { scene } = window.__hs, c = window.__chars, out = {};
    for (const [cls, node] of [['tracker', 'Held_Lantern'], ['trapper', 'Held_BearTrap'], ['charger', 'Held_IronHammer']]) {
      const ch = c.makeChar(0x336699, { seeker: true, cls }); scene.add(ch);
      const nodes = []; ch.traverse((o) => { if (o.isSkinnedMesh && o.name === node) nodes.push(o); });
      const vis = () => nodes.filter((o) => o.visible).length;
      const a = vis(); c.setHeld(ch, false); const b = vis(); c.setHeld(ch, true);
      out[cls] = { nodes: nodes.length, shown: a, hidden: b, again: vis() }; scene.remove(ch); c.disposeChar(ch);
    }
    return out;
  });
  console.log('held', JSON.stringify(held));
  for (const h of Object.values(held)) { expect(h.nodes).toBeGreaterThan(0); expect(h.shown).toBe(h.nodes); expect(h.hidden).toBe(0); expect(h.again).toBe(h.nodes); }

  // concealed: no shadow; the muted tint restores; a tagged hider becomes a seeker in place
  const swap = await page.evaluate(() => {
    const c = window.__chars, ch = c.makeChar(0x336699, {}), root = ch.ch.root, out = {};
    const casts = () => { let n = 0; ch.traverse((o) => { if (o.isMesh && o.castShadow) n++; }); return n; };
    out.before = casts(); c.setConcealed(ch, true); out.concealed = casts(); c.setConcealed(ch, false); out.after = casts();
    c.setSeeker(ch, true, 'trapper'); out.sameRoot = ch.ch.root === root; out.kind = ch.ch.kind; c.setSeeker(ch, false); out.back = ch.ch.kind;
    return out;
  });
  expect(swap.before).toBeGreaterThan(0); expect(swap.concealed).toBe(0); expect(swap.after).toBe(swap.before); expect(swap.sameRoot).toBe(true); expect(swap.kind).toBe('glb'); expect(swap.back).toBe('glb');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('foot planting: at slow speeds the stance foot keeps the ground speed; reports the slip at game speeds', async ({ page }) => {
  await page.goto('/'); await page.waitForSelector('#btnSeek'); await ready(page); await stage(page);
  const r = await page.evaluate(() => {
    const { scene, THREE } = window.__hs, c = window.__chars, out = {};
    for (const [name, a] of [['walk0.5', { speed: 0.5 }], ['walk3.9', { speed: 3.9 }], ['run6.8', { speed: 6.8 }], ['crouch2', { crouch: 1, speed: 2 }], ['crouch0.15', { crouch: 1, speed: 0.15 }]]) {
      const ch = c.makeChar(0x336699, {}); scene.add(ch); ch.position.set(0, 60, 0);
      for (let f = 0; f < 90; f++) c.animate(ch, 1 / 60, a);
      const foot = ch.getObjectByName('footL'), p = new THREE.Vector3(), z = [];
      for (let f = 0; f < 120; f++) { c.animate(ch, 1 / 60, a); ch.updateMatrixWorld(true); foot.getWorldPosition(p); z.push(p.z); }
      // the model faces +Z and walks +Z: a planted foot moves back (-Z) at body speed. Mean speed over the frames where the foot moves back.
      const v = []; for (let i = 1; i < z.length; i++) { const d = -(z[i] - z[i - 1]) * 60; if (d > 0.02) v.push(d); }
      out[name] = +(v.reduce((x, y) => x + y, 0) / Math.max(1, v.length)).toFixed(2); scene.remove(ch); c.disposeChar(ch);
    }
    return out;
  });
  console.log('stance foot speed (m/s) vs ground speed', JSON.stringify(r));
  expect(r['walk0.5']).toBeGreaterThan(0.4); expect(r['walk0.5']).toBeLessThan(0.65); // 0.5 m/s: within ~25%
});

test('10 characters: no errors, draw-call increase <= 40', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/'); await page.waitForSelector('#btnSeek'); await ready(page);
  const r = await page.evaluate(async () => {
    const { renderer, scene, camera, G } = window.__hs, c = window.__chars;
    document.getElementById('title').style.display = 'none'; G.phase = 'test'; G.paused = true;
    camera.position.set(0, 61, 10); camera.lookAt(0, 61, 0); camera.updateMatrixWorld(true);
    const calls = () => { renderer.info.reset(); renderer.render(scene, camera); return renderer.info.render.calls; };
    const hats = ['cap', 'beanie', 'bucket', 'crown', 'none'];
    const base = calls(), chars = [];
    for (let i = 0; i < 10; i++) {
      const ch = c.makeChar(0x336699 + i * 0x111111, { hat: hats[i % 5], pattern: ['plain', 'stripes', 'dots', 'overalls'][i % 4], seeker: i < 4, cls: ['tracker', 'phantom', 'trapper', 'charger'][i] });
      ch.position.set(-9 + i * 2, 60, 0); scene.add(ch); chars.push(ch);
    }
    for (let f = 0; f < 30; f++) chars.forEach((ch, i) => c.animate(ch, 1 / 30, { speed: i * 0.6, crouch: i === 3 ? 1 : 0, air: i === 4, pitch: 0.3 }));
    chars[5].ch.play('taunt'); chars[6].ch.play('tagged'); chars[7].ch.play('victory'); chars[8].ch.play('hit');
    for (let f = 0; f < 10; f++) chars.forEach((ch) => c.animate(ch, 1 / 30, { speed: 1 }));
    return { base, withTen: calls(), kinds: [...new Set(chars.map((ch) => ch.ch.kind))] };
  });
  console.log('characters', JSON.stringify(r), 'increase', r.withTen - r.base);
  expect(r.kinds).toEqual(['glb']);
  expect(r.withTen - r.base).toBeLessThanOrEqual(LIMIT);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('model files blocked: procedural fallback, logged visibly, facing +Z, no pageerror', async ({ page }) => {
  const logged = [], errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logged.push(m.text()); });
  await page.route('**/models/characters/*.glb', (r) => r.abort());
  await page.goto('/'); await page.waitForSelector('#btnSeek'); await ready(page);
  expect(await page.evaluate(() => window.__chars.rigStatus())).toBe('failed');
  expect(logged.some((t) => /\[characters\] GLB models failed/.test(t)), logged.join('\n')).toBe(true);
  await page.setViewportSize({ width: 1100, height: 700 }); await stage(page);
  const r = await place(page, 'hider', { speed: 1.4 }); await shot(page, 'fallback_procedural_walk');
  const t = await place(page, 'trapper', {});
  expect(r.kind).toBe('procedural'); expect(t.kind).toBe('procedural');
  expect(r.top).toBeGreaterThan(1.6); expect(r.top).toBeLessThan(2.0);
  expect(errors, errors.join('\n')).toEqual([]);
});
