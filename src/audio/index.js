// Audio facade + runtime: bus listeners, per-frame zone / music update. Imported once from main.js; the sound code itself is in sfx.js.
import { bus, EV } from '../core/bus.js';
import { addSystem } from '../core/loop.js';
import { G, P, inGame, SEEK_TIME } from '../core/state.js';
import { clamp } from '../core/util.js';
import { settings } from '../core/settings.js';
import { S } from '../ai/seeker.js';
import { eng, updateZone, _debug } from './engine.js';
import { music } from './music.js';
import { play, initAudio, loadForMap, setMuted, applyVol, sfx } from './sfx.js';
import { KINDS } from './kinds.js';

// audio.play(kind, pos?, vol?): kind is a key of KINDS (kinds.js); pos {x,z[,y]} makes it positional and fires the visual cue.
export const audio = { play, init: initAudio, setMuted, kinds: Object.keys(KINDS) };
export { sfx, setMuted, applyVol, initAudio };

let impulse = 0; // short-lived tension from nearby shots / tags / taunts, decays 0.25 per second
const near = (m, r) => Number.isFinite(m?.x) && Math.hypot(m.x - P.x, m.z - P.z) < r;
bus.on(EV.SOUND, (m) => { if (KINDS[m?.kind] && Number.isFinite(m.x) && Number.isFinite(m.z)) play(m.kind, { x: m.x, y: m.y, z: m.z }, m.vol); });
bus.on(EV.SHOT, (m) => { if (near(m, 18)) impulse = Math.max(impulse, 0.7); });
bus.on(EV.TAGGED, () => { music.stinger('tag'); impulse = Math.max(impulse, 0.5); });
bus.on(EV.ROUND, () => { if (eng.ctx) loadForMap(); });
document.addEventListener('pointerdown', initAudio, { once: true }); // menu music + unlock without starting a round
document.addEventListener('keydown', initAudio, { once: true });

let zoneT = 0;
addSystem({
  name: 'audio', order: 60,
  update(dt) {
    if (window.__hs && !window.__hs.audio) window.__hs.audio = { bus, EV, settings, master: () => eng.master?.gain.value ?? null, voices: _debug.voices }; // tests/smoke.spec.js
    if (!eng.ctx) return;
    zoneT -= dt; if (zoneT <= 0) { zoneT = 0.25; updateZone(); }
    impulse = Math.max(0, impulse - dt * 0.25);
    let tension = 0;
    if (G.phase === 'play') {
      if (G.mode === 'hide') tension = clamp(1 - (Math.hypot(S.x - P.x, S.z - P.z) - 4) / 20, 0, 1) * (S.state === 'chase' ? 1 : 0.8); // hider: seeker proximity
      else if (G.mode === 'seek') tension = clamp((G.t / SEEK_TIME - 0.5) * 2, 0, 1); // seeker: second half of the clock
    }
    music.update(Math.max(tension, impulse), inGame() ? 1 : 0.6);
  },
});
