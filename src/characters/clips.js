// Clip names inside public/models/characters/robot.glb (see tools/build-model.mjs). tests/chars/clips.test.js checks they all exist.
export const CLIP = {
  idle: 'Idle', walk: 'Walking', run: 'Running', jump: 'Jump',
  taunt: 'Wave',      // upper-body only (leg/body tracks are stripped at load so it layers over locomotion)
  tagged: 'Death',    // full body, holds the last frame until the next round
  victory: 'Dance',
};
export const MODEL_URL = '/models/characters/robot.glb';
