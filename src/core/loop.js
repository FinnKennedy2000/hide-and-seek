// One requestAnimationFrame loop running ordered systems. order: input 0, net 10, player 20, ai 30, anim 40, camera 50, audio 60, render 100.
// Systems with equal order run in registration order. A throwing system never stops the loop (the next frame still runs).
const systems = [];
let started = false, last = 0, t = 0;

export function addSystem({ name, order = 50, update }) { // -> remove()
  const s = { name, order, update };
  let i = systems.length; while (i > 0 && systems[i - 1].order > order) i--;
  systems.splice(i, 0, s);
  return () => { const k = systems.indexOf(s); if (k >= 0) systems.splice(k, 1); };
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
  for (const s of [...systems]) s.update(dt, t);
}

export function start() {
  if (started) return;
  started = true; last = performance.now();
  requestAnimationFrame(tick);
}
