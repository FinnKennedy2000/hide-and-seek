// Audio facade + runtime: bus listeners, per-frame zone / music update. Imported once from main.js; the sound code itself is in sfx.js.
import { bus, EV } from '../core/bus.js';
import { addSystem } from '../core/loop.js';
import { G, P, inGame, SEEK_TIME } from '../core/state.js';
import { clamp } from '../core/util.js';
import { settings } from '../core/settings.js';
import { S } from '../ai/seeker.js';
import { eng, updateZone, resume, _debug } from './engine.js';
import { music } from './music.js';
import { play, initAudio, loadForMap, setMuted, applyVol, stopAudio, sfx } from './sfx.js';
import { KINDS, parseSound } from './kinds.js';

// audio.play(kind, pos?, vol?): kind is a key of KINDS (kinds.js); pos {x,z[,y]} makes it positional and fires the visual cue.
export const audio = { play, init: initAudio, stop: stopAudio, setMuted, kinds: Object.keys(KINDS) };
export { sfx, setMuted, applyVol, initAudio };

let impulse = 0; // short-lived tension from nearby shots / tags / taunts, decays 0.25 per second
const near = (m, r) => Number.isFinite(m?.x) && Math.hypot(m.x - P.x, m.z - P.z) < r;
bus.on(EV.SOUND, (m) => { const s = parseSound(m); if (s) play(s.kind, s.pos, s.vol); }); // network input: validated before the cue and the audio
bus.on(EV.SHOT, (m) => { if (near(m, 18)) impulse = Math.max(impulse, 0.7); });
bus.on(EV.TAGGED, () => { music.stinger('tag'); impulse = Math.max(impulse, 0.5); });
bus.on(EV.ROUND, () => { if (eng.ctx) loadForMap(); });
// create the context on the first gesture, and bring it back after any suspension / interruption (alt-tab, power save, iOS) on the next one
const wake = () => { if (!eng.ctx || eng.ctx.state !== 'running') initAudio(); };
for (const ev of ['pointerdown', 'keydown', 'touchend']) document.addEventListener(ev, wake, { passive: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement) resume(); });

let zoneT = 0;
addSystem({
  name: 'audio', order: 60,
  update(dt) {
    if (window.__hs && !window.__hs.audio) window.__hs.audio = { bus, EV, settings, master: () => eng.target.master ?? null, state: () => eng.ctx?.state, voices: _debug.voices }; // tests/smoke.spec.js
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
