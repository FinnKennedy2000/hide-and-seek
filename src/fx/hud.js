// Hit-marker sound. The hit-marker and stamina widgets themselves live in src/ui/hud.js (bus-driven, styled with the rest of the HUD).
import { bus, EV } from '../core/bus.js';
import { sfx } from '../audio/sfx.js';

bus.on(EV.HITMARKER, () => (sfx.hitmark ?? (() => sfx.tick(true)))()); // the audio workstream can add sfx.hitmark; until then a short tick
