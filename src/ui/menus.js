import { $, clamp } from '../core/util.js';
import { P, G, hooks, inGame } from '../core/state.js';
import { keys, releaseAll, requestLock } from '../core/input.js';
import { settings } from '../core/settings.js';
import { canvas } from '../render/renderer.js';
import { setWorld } from '../world/build.js';
import { MAPS } from '../shared/maps/index.js';
import { hiders } from '../ai/hiders.js';
import { seekerGroup } from '../ai/seeker.js';
import { setMuted, applyVol } from '../audio/sfx.js';
import { show } from './hud.js';
import { showBoss, hideBoss, bossOn } from './bossscreen.js';
import { startGame, tryTag } from '../modes/singleplayer.js';

// title screen, pause / boss screen, keyboard + mouse input, fullscreen
export function toMenu() { setWorld(spMap); G.phase = 'menu'; G.paused = false; leaveFull(); show('end', false); show('hud', false); show('title', true); $('blackout').classList.remove('on'); document.exitPointerLock?.(); seekerGroup.visible = false; hiders.forEach((h) => { h.mesh.visible = false; }); }
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
    onCues: () => { settings.set('cues', !settings.cues); renderOpts(); },
    onVol: () => { const v = settings.volume; settings.set('volume', v >= 0.99 ? 0 : Math.min(1, Math.floor(v * 4 + 1e-9) / 4 + 0.25)); renderOpts(); },
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
  if (e.target.tagName === 'INPUT') return; // typing in the online name / room-code fields
  if (e.ctrlKey || e.metaKey || e.altKey) { if (inGame()) e.preventDefault(); return; } // game keys never double as browser shortcuts
  if (inGame() && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'KeyE', 'KeyF', 'KeyG', 'KeyR', 'KeyT', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(e.code)) e.preventDefault();
  if ((e.code === 'KeyP' || e.code === 'Tab') && !e.repeat && inGame()) { if (G.mode === 'online') openBoss(); else pause(); return; }
  keys[e.code] = true;
  if (!e.repeat && G.mode === 'online') hooks.key?.(e.code);
  if (e.code === 'KeyE' && !e.repeat) tryTag();
  if (e.code === 'Escape') pause();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { releaseAll(); pause(); });
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || G.paused) return;
  P.yaw -= e.movementX * settings.sens; P.pitch = clamp(P.pitch - e.movementY * settings.sens, -1.5, 1.5);
});
addEventListener('mousedown', () => {
  if (bossOn()) return;
  if (G.phase !== 'play' && G.phase !== 'countdown') return;
  if (G.paused) return;
  if (document.pointerLockElement !== canvas) requestLock(); else if (G.mode === 'online') hooks.fire?.(); else tryTag();
});
addEventListener('wheel', (e) => { if (G.mode === 'online' && !G.paused) hooks.wheel?.(Math.sign(e.deltaY)); }, { passive: true });
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== canvas) pause(); });
function renderOpts() { $('optCues').textContent = `SOUND CUES: ${settings.cues ? 'ON' : 'OFF'}`; $('optCues').classList.toggle('on', settings.cues); $('optVol').value = Math.round(settings.volume * 100); applyVol(); }
$('optCues').onclick = () => { settings.set('cues', !settings.cues); renderOpts(); };
$('optVol').oninput = (e) => { settings.set('volume', clamp(Number(e.target.value) / 100, 0, 1)); applyVol(); };
renderOpts();
// single-player map choice on the title screen (the lobby has its own picker in online.js)
export let spMap = 'house'; // single-player map choice (read by modes/singleplayer.js as a live binding)
function renderMapPick() {
  const box = $('spMap'); box.textContent = '';
  for (const [id, m] of Object.entries(MAPS)) {
    const b = document.createElement('button'); b.className = 'chip' + (id === spMap ? ' on' : ''); b.textContent = m.meta.name.toUpperCase();
    b.onclick = () => { spMap = id; setWorld(id); $('titleSub').textContent = m.meta.blurb; renderMapPick(); };
    box.append(b);
  }
}
renderMapPick();
$('btnSeek').onclick = () => startGame('seek'); $('btnHide').onclick = () => startGame('hide');
$('btnAgain').onclick = () => startGame(G.mode); $('btnMenu').onclick = toMenu;
