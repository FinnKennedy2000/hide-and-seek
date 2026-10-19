import { $, clamp } from '../core/util.js';
import { G, hooks, inGame } from '../core/state.js';
import { canon, releaseAll, requestLock } from '../core/input.js'; // input.js owns the key state, mouse look, ADS and focus-loss release
import { settings } from '../core/settings.js';
import { canvas } from '../render/renderer.js';
import { setWorld } from '../world/build.js';
import { MAPS } from '../shared/maps/index.js';
import { hiders } from '../ai/hiders.js';
import { seekerGroup } from '../ai/seeker.js';
import { setMuted, applyVol } from '../audio/sfx.js';
import { show, toast } from './hud.js';
import { renderMapPicker, randomMapId } from './mappicker.js';
import { bus, EV } from '../core/bus.js';
import { showBoss, hideBoss, bossOn } from './bossscreen.js';
import { startGame, tryTag } from '../modes/singleplayer.js';

// title screen, pause / boss screen, keyboard + mouse input, fullscreen
export function toMenu() { setWorld(spMap); G.phase = 'menu'; G.paused = false; leaveFull(); show('end', false); show('hud', false); show('settings', false); show('title', true); $('onboard').classList.add('hidden'); $('blackout').classList.remove('on'); document.exitPointerLock?.(); seekerGroup.visible = false; hiders.forEach((h) => { h.mesh.visible = false; }); }
// Fullscreen + keyboard lock so Ctrl+W / Ctrl+T etc. reach the game instead of the browser (needs a user gesture)
export function enterFull() {
  try { document.documentElement.requestFullscreen?.()?.then(() => navigator.keyboard?.lock?.()).catch(() => {}); } catch { /* unsupported */ }
}
function leaveFull() {
  try { navigator.keyboard?.unlock?.(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch { /* ignore */ }
}
// pause = the fake "work" screen. Single-player freezes; online keeps running in the background.
function openBoss() {
  releaseAll();
  setMuted(true); document.exitPointerLock?.();
  showBoss({
    onResume: closeBoss,
    onQuit: () => { hideBoss(); setMuted(false); G.paused = false; toMenu(); },
    onLeave: G.mode === 'online' && hooks.leave ? () => { hideBoss(); setMuted(false); hooks.leave(); } : null,
    labels: () => ({ cues: `Sound cues: ${settings.cues ? 'on' : 'off'}`, vol: `Volume: ${settings.volume ? Math.round(settings.volume * 100) + '%' : 'muted'}` }),
    onCues: () => { settings.set('cues', !settings.cues); },
    onVol: () => { const v = settings.volume; settings.set('volume', v >= 0.99 ? 0 : Math.min(1, Math.floor(v * 4 + 1e-9) / 4 + 0.25)); },
  });
}
function closeBoss() { hideBoss(); setMuted(false); G.paused = false; if (inGame()) requestLock(); }
function pause() { if (G.mode === 'online' || bossOn()) return; if (inGame() && !G.paused) { G.paused = true; openBoss(); } }
// block leaving the tab by accident while a round or room is live
addEventListener('beforeunload', (e) => { if (inGame() || hooks.inRoom?.()) { e.preventDefault(); e.returnValue = ''; } });

// ----- input
addEventListener('keydown', (e) => {
  if (e.code === 'Backquote') { // instant boss key, from anywhere (also while typing)
    e.preventDefault();
    if (bossOn()) return closeBoss();
    if (G.mode !== 'online' && inGame()) G.paused = true;
    return openBoss();
  }
  if (bossOn()) { if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Tab') { e.preventDefault(); closeBoss(); } return; }
  if (e.code === 'F3') { e.preventDefault(); settings.set('perfHud', !settings.perfHud); return; }
  if (e.target.tagName === 'INPUT') return; // typing in the online name / room-code fields
  if (e.ctrlKey || e.metaKey || e.altKey) { if (inGame()) e.preventDefault(); return; } // game keys never double as browser shortcuts
  if (inGame() && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'KeyE', 'KeyF', 'KeyG', 'KeyR', 'KeyT', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(canon(e.code) ?? e.code)) e.preventDefault();
  if ((e.code === 'KeyP' || e.code === 'Tab') && !e.repeat && inGame()) { if (G.mode === 'online') openBoss(); else pause(); return; }
  const code = canon(e.code);
  if (!e.repeat && G.mode === 'online') hooks.key?.(code);
  if (code === 'KeyE' && !e.repeat) tryTag();
  if (e.code === 'Escape') pause();
});
addEventListener('blur', () => { releaseAll(); pause(); });
addEventListener('mousedown', (e) => {
  if (e.button !== 0 || bossOn()) return;
  if (G.phase !== 'play' && G.phase !== 'countdown') return;
  if (G.paused) return;
  if (document.pointerLockElement !== canvas) requestLock(); else if (G.mode === 'online') hooks.fire?.(); else tryTag();
});
addEventListener('wheel', (e) => { if (G.mode === 'online' && !G.paused) hooks.wheel?.(Math.sign(e.deltaY)); }, { passive: true });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas) pause(); });
bus.on(EV.SETTINGS, ({ key }) => { if (key === 'volume' || key === 'sfx' || key === 'music' || key === 'ui') applyVol(); });
// single-player map choice on the title screen (the lobby has its own picker in online.js)
export let spMap = 'house'; // single-player map choice (read by modes/singleplayer.js as a live binding)
function choose(id) { spMap = id; setWorld(id); $('titleSub').textContent = MAPS[id].meta.blurb; renderMapPick(); }
function renderMapPick() { renderMapPicker($('spMap'), { current: spMap, onPick: choose }); }
renderMapPick();
$('spRandom').onclick = () => { const id = randomMapId(); choose(id); toast(`Random pick: ${MAPS[id].meta.name}`, 'info'); };
$('btnSeek').onclick = () => startGame('seek'); $('btnHide').onclick = () => startGame('hide');
$('btnAgain').onclick = () => startGame(G.mode); $('btnMenu').onclick = toMenu;
