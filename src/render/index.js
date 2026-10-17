// Render facade. Stub for the render workstream: applyQuality / setScale / setMap are no-ops until it lands.
import { renderer } from './renderer.js';

export const render = {
  applyQuality(level) {},  // 'low' | 'med' | 'high' | 'ultra'
  setScale(s) {},          // render-resolution scale
  stats() { const r = renderer.info.render; return { calls: r.calls, tris: r.triangles, fps: 0 }; }, // calls/tris: last render pass only
  setMap(meta) {},         // called with the map meta when a map is built
};
