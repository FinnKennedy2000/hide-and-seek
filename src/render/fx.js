import * as THREE from 'three';
import { rnd } from '../core/util.js';
import { scene } from './renderer.js';
import { budget } from '../perf/budget.js';

export const fx = [];
let live = 0; // particles alive; capped per quality tier (perf budget)
export function burst(x, y, z, color, n = 28, life = 0.8, spread = 2, size = 0.12) {
  n = Math.min(n, budget.cur.particles - live); if (n <= 0) return; live += n;
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { pos.set([x, y, z], i * 3); vel.push(rnd(-spread, spread), rnd(0.5, 2) * spread, rnd(-spread, spread)); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false }));
  p.frustumCulled = false; scene.add(p); fx.push({ p, vel, life, l0: life, n });
}
export function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i], a = f.p.geometry.attributes.position; f.life -= dt;
    for (let k = 0; k < a.count; k++) { f.vel[k * 3 + 1] -= 9 * dt; a.setXYZ(k, a.getX(k) + f.vel[k * 3] * dt, Math.max(0, a.getY(k) + f.vel[k * 3 + 1] * dt), a.getZ(k) + f.vel[k * 3 + 2] * dt); }
    a.needsUpdate = true; f.p.material.opacity = Math.max(0, f.life / f.l0);
    if (f.life <= 0) { scene.remove(f.p); f.p.geometry.dispose(); f.p.material.dispose(); live -= f.n; fx.splice(i, 1); }
  }
}
