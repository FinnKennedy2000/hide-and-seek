// One requestAnimationFrame loop running ordered systems. order: input 0, net 10, player 20, ai 30, anim 40, camera 50, audio 60, render 100.
// Systems with equal order run in registration order. A throwing system never stops the loop (the next frame still runs).
const systems = [];
import { settings } from './settings.js';
let started = false, last = 0, t = 0, acc = 0;

export function addSystem({ name, order = 50, update }) { // -> remove()
  const s = { name, order, update };
  let i = systems.length; while (i > 0 && systems[i - 1].order > order) i--;
  systems.splice(i, 0, s);
  return () => { const k = systems.indexOf(s); if (k >= 0) systems.splice(k, 1); };
}

// settings.fpsCap (60 | 30): frames arriving sooner than 1/cap are skipped, elapsed time keeps accumulating so dt stays correct.
// A 120 Hz screen therefore runs update + render at 60 Hz; at 30 only every second (or fourth) frame runs.
function tick(now) {
  requestAnimationFrame(tick);
  const cap = 1 / settings.fpsCap;
  acc += (now - last) / 1000; last = now;
  if (acc < cap - 0.0025) return; // 2.5 ms tolerance so a 60 Hz screen is not halved by timer jitter
  const dt = Math.min(acc, 0.05); acc = Math.min(acc - cap, cap) > 0 ? Math.min(acc - cap, cap) : 0; t += dt;
  for (const s of [...systems]) s.update(dt, t);
}

export function start() {
  if (started) return;
  started = true; last = performance.now();
  requestAnimationFrame(tick);
}
