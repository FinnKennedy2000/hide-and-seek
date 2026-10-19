// Title / menu backdrop: a slow camera fly-through of the live map, plus the "podium stage" shot for results.
// Cheap by design: on potato / low the scene is only re-rendered a few times a second (the canvas keeps the last frame),
// and reduced motion freezes the camera. skipRender() is asked by the render system each frame.
import { camera } from '../render/renderer.js';
import { bounds } from '../world/build.js';
import { G } from '../core/state.js';
import { settings } from '../core/settings.js';

const INTERVAL = { potato: 1 / 6, low: 1 / 15 }; // seconds between backdrop renders; other presets render every frame
let acc = 0, stage = null; // stage: {pos, look} when the podium is being shown

// Fly-through: an ellipse hugging the map's outside, dollying in and out and bobbing in height, looking at a point that wanders near the centre.
export function backdropCam(dt) {
  if (stage) { camera.position.copy(stage.pos); camera.lookAt(stage.look); camera.fov = 34; camera.updateProjectionMatrix(); return; }
  if (!settings.reducedMotion) G.orbit += dt * 0.06;
  const t = G.orbit, hx = (bounds.x1 - bounds.x0) / 2, hz = (bounds.z1 - bounds.z0) / 2, cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.z0 + bounds.z1) / 2;
  const k = 1.1 + 0.18 * Math.sin(t * 1.7);
  camera.position.set(cx + Math.cos(t) * hx * k, 4.5 + 3.5 * Math.sin(t * 1.3 + 1), cz + Math.sin(t) * hz * k);
  camera.lookAt(cx + Math.sin(t * 0.7) * hx * 0.25, 2.2, cz + Math.cos(t * 0.9) * hz * 0.25);
  camera.fov = 58; camera.updateProjectionMatrix();
}
// true => do not render this frame (menu / results phases only)
export function skipRender(dt) {
  if (G.phase !== 'menu' && G.phase !== 'end') { acc = 0; return false; }
  const iv = INTERVAL[settings.quality];
  if (!iv) return false;
  acc += dt;
  if (acc < iv) return true;
  acc = 0; return false;
}
export function setStage(s) { stage = s; }
export const stageActive = () => !!stage;
