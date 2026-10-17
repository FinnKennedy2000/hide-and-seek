// Render facade. Stub for the render workstream (Agent R replaces applyQuality / setScale with the real per-preset configs; on a merge
// conflict take R's file). The minimal behaviour here exists so perf's tiering and governor have something to drive:
// applyQuality toggles shadows + bloom + MSAA by the perf budget, setScale scales the render resolution.
import { renderer, composer, bloom, PR } from './renderer.js';
import { budget } from '../perf/budget.js';

let scale = 1, prCap = PR;
function applyRes() {
  const pr = Math.min(PR, prCap) * scale, w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false); composer.setPixelRatio(pr); composer.setSize(w, h);
}
addEventListener('resize', applyRes); // renderer.js's own resize runs first at full ratio; this re-applies the scale

export const render = {
  applyQuality(level) { // 'potato' | 'low' | 'med' | 'high' | 'ultra'
    const b = budget.of(level);
    renderer.shadowMap.enabled = b.shadows;
    bloom.enabled = b.bloom;
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) { const s = b.bloom ? 4 : 0; if (rt.samples !== s) { rt.samples = s; rt.dispose(); } }
    prCap = b.pr; applyRes();
    renderer.shadowMap.needsUpdate = true;
  },
  setScale(s) { scale = s; applyRes(); }, // render-resolution scale
  stats() { const r = renderer.info.render; return { calls: r.calls, tris: r.triangles, fps: 0 }; }, // calls/tris: last render pass only (perf.stats() has whole-frame totals)
  setMap(meta) {},         // called with the map meta when a map is built
};
