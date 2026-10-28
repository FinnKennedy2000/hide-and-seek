// Character API: GLB models with procedural fallback (see char.js / glb.js / character.js).
export * from './char.js';
import * as chars from './char.js';
if (typeof window !== 'undefined') { window.__chars = { ...chars }; chars.preloadGlb(); } // tests/chars.spec.js; start the model download at once
