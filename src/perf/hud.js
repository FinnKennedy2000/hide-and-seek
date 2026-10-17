// F3 debug HUD: fps, frame ms, calls, tris, tier, scale. Plain DOM, updated 4x per second, nothing allocated while hidden.
export function createHud(read) {
  const el = document.createElement('pre');
  el.id = 'perfHud';
  el.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:6px 8px;background:rgba(0,0,0,.6);color:#9ff0a8;font:12px/1.35 ui-monospace,Consolas,monospace;z-index:99999;pointer-events:none;display:none;white-space:pre;border-radius:4px';
  document.body.appendChild(el);
  let on = false, acc = 0;
  addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); on = !on; el.style.display = on ? 'block' : 'none'; acc = 1; } });
  return {
    get on() { return on; },
    update(dt) {
      if (!on) return;
      acc += dt; if (acc < 0.25) return; acc = 0;
      const s = read();
      el.textContent = `${s.fps.toFixed(0)} fps   ${s.ms.toFixed(1)} ms${s.gpuMs ? ` (gpu ${s.gpuMs.toFixed(1)})` : ''}\ncalls ${s.calls}   tris ${s.tris}\ntier ${s.tier}${s.auto ? ' (auto)' : ''}   scale ${s.scale.toFixed(2)}${s.eco ? '   eco 30' : ''}`;
    },
  };
}
