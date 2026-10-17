import { rnd, lerp, pick, shuffle, fmt, cache, setText, $ } from '../core/util.js';
import { P, G, hooks, SEEK_COUNT, SEEK_TIME, HIDE_COUNT, HIDE_TIME, N_HIDERS, HIDER_COLORS } from '../core/state.js';
import { requestLock } from '../core/input.js';
import { scene } from '../render/renderer.js';
import { burst } from '../render/fx.js';
import { worldKey, meta, setWorld } from '../world/build.js';
import { MAPS } from '../shared/maps/index.js';
import { SPOTS } from '../ai/nav.js';
import { hiders, sendHider, tagTarget, updateHiders } from '../ai/hiders.js';
import { S, seekerGroup, updateSeeker } from '../ai/seeker.js';
import { initAudio, sfx } from '../audio/sfx.js';
import { toast, show } from '../ui/hud.js';
import { enterFull, spMap } from '../ui/menus.js';
import { makeChar, HATS, OUTFITS } from '../characters/index.js';
import { updatePlayer, noises } from '../player/controller.js';

// single-player round flow: reset / start / end, tagging, and the per-frame update for SEEK and HIDE
export function reset(mode) {
  G.mode = mode; G.t = 0; G.found = 0; G.stats = { bolts: 0, spotted: 0, loud: 0 }; G.paused = false;
  G.phase = 'countdown'; G.cd = mode === 'seek' ? SEEK_COUNT : HIDE_COUNT; G.lastCd = -1;
  const map = MAPS[worldKey], ss = meta.seekerStart, away = (r) => { const f = map.spawns.filter((s) => Math.hypot(s[0] - ss.x, s[1] - ss.z) > r); return pick(f.length ? f : map.spawns); };
  const [hx, hz] = away(6); // hide mode: you start at a spawn point, the seeker at the map's seeker start
  Object.assign(P, { x: mode === 'seek' ? ss.x : hx, y: 0, z: mode === 'seek' ? ss.z : hz, vx: 0, vz: 0, vy: 0, yaw: mode === 'seek' ? ss.yaw : 0, pitch: 0, crouch: 0, dist: 0 });
  noises.length = 0; P.dist = 0;
  for (const h of hiders) scene.remove(h.mesh);
  hiders.length = 0; SPOTS.forEach((s) => { s.owner = null; });
  seekerGroup.visible = false;
  if (mode === 'seek') {
    const chosen = map.mix.flatMap(([kind, n]) => shuffle(SPOTS.filter((s) => s.kind === kind)).slice(0, n)); // e.g. 3 house + 2 garden
    if (chosen.length < N_HIDERS) chosen.push(...shuffle(SPOTS.filter((s) => !chosen.includes(s))).slice(0, N_HIDERS - chosen.length));
    shuffle(chosen).forEach((spot, i) => {
      const mesh = makeChar(HIDER_COLORS[i], { hat: pick(HATS), pattern: pick(OUTFITS) }); scene.add(mesh);
      const [sx, sz] = away(4);
      const h = { mesh, x: sx, z: sz, heading: Math.PI, state: 'run', s: 1, found: false, nextPeek: 0, peekT: 0, fleeCd: 4, spot: null, path: null, pi: 0, speed: 5.5, color: HIDER_COLORS[i] };
      sendHider(h, spot, 5.5); hiders.push(h);
    });
  } else {
    Object.assign(S, { x: ss.x, z: ss.z, heading: Math.PI, state: 'count', path: null, pi: 0, timer: 0, detect: 0, lastSeen: null, lostT: 0 });
    S.visited.clear(); seekerGroup.visible = true;
  }
  $('blackout').classList.toggle('on', mode === 'seek');
  setText('modeLabel', mode === 'seek' ? 'SEEK' : 'HIDE');
  $('found').style.display = mode === 'seek' ? '' : 'none'; $('seekerState').style.display = mode === 'hide' ? '' : 'none';
  $('detectWrap').classList.remove('show'); $('crosshair').classList.remove('hot'); $('prompt').classList.remove('show');
  $('timer').classList.remove('low');
  $('blackmsg').textContent = mode === 'seek' ? 'THE HIDERS ARE RUNNING...' : '';
  setText('timer', fmt(mode === 'seek' ? SEEK_TIME : HIDE_TIME)); cache.found = null; cache.banner = null;
}
export function startGame(mode) {
  initAudio(); enterFull();
  setWorld(spMap);
  reset(mode);
  show('title', false); show('end', false); show('hud', true);
  requestLock();
}
export function endGame(win, title, sub) {
  G.phase = 'end';
  document.exitPointerLock?.();
  (win ? sfx.win : sfx.lose)();
  $('blackout').classList.remove('on'); $('detectWrap').classList.remove('show');
  $('endTitle').textContent = title; $('endTitle').style.color = win ? '#80ed99' : '#ff4d5e'; $('endSub').textContent = sub;
  const st = G.mode === 'seek'
    ? [['TIME', fmt(G.t)], ['FOUND', `${G.found}/${N_HIDERS}`], ['BOLTS', G.stats.bolts]]
    : [['SURVIVED', `${Math.floor(G.t)}s`], ['SPOTTED', G.stats.spotted], ['LOUD STEPS', G.stats.loud]];
  $('endStats').innerHTML = st.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
  show('hud', false); show('end', true);
}
export function tryTag() {
  if (G.mode === 'online') return hooks.tag?.();
  const h = tagTarget(); if (!h) return;
  h.found = true; h.state = 'found'; h.popT = 0.3; G.found++;
  if (h.spot) { h.spot.owner = null; h.spot = null; }
  sfx.found(); burst(h.x, 0.8, h.z, h.color);
  toast(G.found === N_HIDERS ? 'ALL FOUND!' : `FOUND ${G.found}/${N_HIDERS}`, '#ffb44d');
  if (G.found === N_HIDERS) setTimeout(() => G.phase === 'play' && endGame(true, 'YOU FOUND THEM ALL', `Cleared in ${fmt(G.t)}`), 700);
}
let hb = 0;
export function update(dt) {
  const seek = G.mode === 'seek';
  // phases
  if (G.phase === 'countdown') {
    G.cd -= dt;
    const n = Math.ceil(G.cd);
    if (n !== G.lastCd) {
      G.lastCd = n;
      if (seek) { const b = $('bigcount'); b.textContent = Math.max(n, 0); b.classList.remove('tick'); void b.offsetWidth; b.classList.add('tick'); }
      if (n > 0) sfx.tick(n <= 3);
    }
    if (G.cd <= 0) {
      G.phase = 'play'; G.t = 0; sfx.go();
      if (seek) { hiders.forEach((h) => { if (h.state === 'run') { h.x = h.spot.x; h.z = h.spot.z; h.state = 'hide'; h.nextPeek = rnd(4, 9); h.s = 0.55; } }); $('blackout').classList.remove('on'); toast('FIND THEM ALL!', '#ffb44d'); }
      else toast('READY OR NOT, HERE HE COMES', '#ffb44d');
      setText('banner', '');
    } else if (!seek) setText('banner', `SEEKER IS COUNTING... ${n}   -   FIND A HIDING SPOT`);
  } else if (G.phase === 'play') {
    G.t += dt;
    const left = (seek ? SEEK_TIME : HIDE_TIME) - G.t;
    setText('timer', fmt(left)); $('timer').classList.toggle('low', left <= 15);
    if (left <= 0) { if (seek) endGame(false, "TIME'S UP", `You found ${G.found} of ${N_HIDERS}.`); else endGame(true, 'YOU SURVIVED', `The seeker never found you in ${HIDE_TIME}s.`); return; }
  }
  const frozen = seek && G.phase === 'countdown';
  const { crouching } = updatePlayer(dt, !frozen);
  if (seek) {
    updateHiders(dt);
    setText('found', `FOUND ${G.found} / ${N_HIDERS}`);
    const t = tagTarget();
    $('crosshair').classList.toggle('hot', !!t); $('prompt').classList.toggle('show', !!t);
  } else {
    updateSeeker(dt);
    const lab = { count: 'COUNTING', patrol: 'SEARCHING', look: 'LOOKING AROUND', investigate: 'INVESTIGATING A NOISE', chase: 'CHASING YOU' }[S.state];
    setText('seekerState', 'SEEKER: ' + lab); $('seekerState').style.color = S.state === 'chase' ? '#ff4d5e' : S.state === 'investigate' ? '#ffd166' : '#fff';
    $('detectWrap').classList.toggle('show', S.detect > 0.02); $('detectFill').style.width = `${Math.min(1, S.detect) * 100}%`;
    setText('detectLabel', crouching ? 'SPOTTED (crouched)' : 'SPOTTED');
    if (S.detect > 0.05) { hb -= dt; if (hb <= 0) { sfx.hb(); hb = lerp(0.8, 0.25, S.detect); } }
  }
}
