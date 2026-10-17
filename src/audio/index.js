// Audio facade. Stub for the audio workstream: forwards to the synthesized sfx table.
import { sfx } from './sfx.js';

export const audio = {
  // kind: an sfx key ('step', 'shoot', 'taunt', ...); pos {x,z} makes it positional; vol only applies to 'step'
  play(kind, pos, vol) { if (kind === 'step') sfx.step(vol ?? 0.25, pos); else sfx[kind]?.(pos, vol); },
};
