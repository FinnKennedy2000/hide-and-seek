import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, SMAAEffect, FXAAEffect, BloomEffect, ToneMappingEffect, ToneMappingMode,
  VignetteEffect, NoiseEffect, ChromaticAberrationEffect, LUT3DEffect, LookupTexture, BlendFunction,
} from 'postprocessing';
import { renderer, scene, camera } from './renderer.js';

// Per-map colour grade as a procedural 3D LUT (no asset to ship): lift / gain / contrast / saturation.
const GRADES = {
  dusk: { gain: [1.05, 1.0, 0.93], lift: [0.012, 0.0, 0.016], contrast: 1.06, sat: 1.12 },
  night: { gain: [0.92, 0.98, 1.1], lift: [0.0, 0.006, 0.022], contrast: 1.08, sat: 0.95 },
};
const luts = {};
export function lutFor(key) {
  if (luts[key]) return luts[key];
  const g = GRADES[key] ?? GRADES.dusk, S = 16, d = new Float32Array(S * S * S * 4);
  for (let b = 0, i = 0; b < S; b++) for (let gg = 0; gg < S; gg++) for (let r = 0; r < S; r++, i += 4) {
    const c = [r, gg, b].map((v, k) => Math.min(1, Math.max(0, ((v / (S - 1) - 0.5) * g.contrast + 0.5) * g.gain[k] + g.lift[k])));
    const l = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
    for (let k = 0; k < 3; k++) d[i + k] = Math.min(1, Math.max(0, l + (c[k] - l) * g.sat));
    d[i + 3] = 1;
  }
  return (luts[key] = new LookupTexture(d, S));
}

// cfg: {aa:'fxaa'|'smaa', bloom, lut, vignette, grain, ca, ao}; ao = N8AOPostPass constructor or null.
// Returns {composer, lutFx, caFx}: lutFx swaps the grade, caFx.offset is driven by render.hit().
export function buildPipeline(cfg, lutKey, N8AOPostPass) {
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  if (cfg.ao && N8AOPostPass) {
    const ao = new N8AOPostPass(scene, camera, window.innerWidth, window.innerHeight);
    Object.assign(ao.configuration, { aoRadius: 2.2, distanceFalloff: 1, intensity: 2.5, halfRes: true, gammaCorrection: false });
    composer.addPass(ao);
  }
  const fx = [];
  if (cfg.bloom) fx.push(new BloomEffect({ intensity: 0.55, luminanceThreshold: 1.2, luminanceSmoothing: 0.25, mipmapBlur: true, levels: 4, radius: 0.7 })); // HDR threshold: only emissives / sun glints bloom
  fx.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
  const lutFx = cfg.lut ? new LUT3DEffect(lutFor(lutKey)) : null; if (lutFx) fx.push(lutFx);
  if (cfg.vignette) fx.push(new VignetteEffect({ offset: 0.3, darkness: 0.55 }));
  if (cfg.grain) { const n = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true }); n.blendMode.opacity.value = 0.12; fx.push(n); }
  const caFx = cfg.ca ? new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.3 }) : null; if (caFx) fx.push(caFx);
  composer.addPass(new EffectPass(camera, ...fx));
  composer.addPass(new EffectPass(camera, cfg.aa === 'smaa' ? new SMAAEffect() : new FXAAEffect())); // AA on the display-referred image, last
  return { composer, lutFx, caFx };
}
