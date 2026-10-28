// Trial mode, local side (wire contract: docs/TRIAL-PROTOCOL.md). Hiders: third-person, hold E at relics / gates / cages, vault walls, crouch in grass.
// Seeker: first person, LMB swing, Q / RMB class power. The server is authoritative; this sends requests and renders the broadcasts.
import { P, DEBUG } from '../core/state.js';
import { keys } from '../core/input.js';
import { camera } from '../render/renderer.js';
import { sfx } from '../audio/sfx.js';
import { toast } from '../ui/hud.js';
import { updatePlayer } from '../player/controller.js';
import * as R from '../net/remote.js';
import { applyTps, applyFps, swapShoulder, resetArm } from '../camera/index.js';
import { addShake, clearShake } from '../fx/shake.js';

// The UI / FX / audio modules are written by another engineer: load them if present and call through `?.` so a missing module or function is a no-op.
const mods = import.meta.glob(['../ui/trialhud.js', '../fx/trialfx.js', '../audio/trial.js'], { eager: true });
const UI = mods['../ui/trialhud.js'] || {}, FX = mods['../fx/trialfx.js'] || {}, AU = mods['../audio/trial.js'] || {};

export const CLASSES = {
  tracker: { name: 'The Tracker', desc: 'Sees scratch marks hiders leave while sprinting. Power: Scent Burst reveals hiders within 28 m for 3 s (30 s cooldown).' },
  phantom: { name: 'The Phantom', desc: 'Power: Cloak for 6 s. Invisible to hiders, no terror radius, 15% faster. Attacking uncloaks (25 s cooldown).' },
  trapper: { name: 'The Trapper', desc: 'Carries 3 bear traps and places one at his feet. A hider who steps on one is injured and held for 2.5 s.' },
  charger: { name: 'The Brute', desc: 'Power: Rush for 1.6 s at 1.8x speed, a swing during the rush lunges 3.4 m. Then 1 s of slow recovery (20 s cooldown).' },
};
const INTERACT_R = 2.0, VAULT_R = 1.1, VAULT_ALONG = 1.8, VAULT_OUT = 1.6, VAULT_MAX_SPEED = 3.8; // client radius a bit under the server's 2.2
const now = () => performance.now() / 1000;
const DONE = new Set(['out', 'escaped']);

const T = { on: false, id: 0, role: 'hider', send() {}, nameOf: () => '?', teleport() {}, self: null, av: null, phase: 'hide', cls: null,
  relics: [], gates: [], cages: [], grass: [], vaults: [], need: 3, n: 0, gatesOpen: false, cageOcc: {}, states: {}, prog: {}, alerts: [], traps: new Map(), marks: [],
  st: 'free', boostT: 0, trapT: 0, chan: null, eLock: false, vault: null, vaultCd: 0, heading: 0, rotY: 0, fc: { x: 0, y: 2, z: 0 }, concealed: false,
  swingCd: 0, swingAge: 9, power: { cls: null, cd: 0, on: false, n: 0, at: 0 }, rushT: 0, recT: 0, terror: 0 };
export const trial = T;
if (DEBUG) window.__trial = T; // smoke tests only

const turnTo = (cur, tgt, rate) => cur + Math.max(-rate, Math.min(rate, ((tgt - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
const body = () => Object.assign(P, { r: 0.3, fixedPh: 0, mul: 1, mute: false });
const held = () => T.st === 'caged' || T.st === 'trapped' || T.trapT > 0;
const out = () => DONE.has(T.st);

// ctx: { id, role, send, nameOf, teleport(x,z), self: {color,hat,pattern}, m: the `round` message }
export function begin(ctx) {
  end();
  const m = ctx.m;
  Object.assign(T, { on: true, id: ctx.id, role: ctx.role, send: ctx.send, nameOf: ctx.nameOf, teleport: ctx.teleport, self: ctx.self, phase: m.phase || 'hide', cls: m.cls || null,
    relics: (m.relics || []).map((r) => ({ ...r, p: r.p || 0, done: !!r.done })), gates: m.gates || [], cages: m.cages || [], grass: m.grass || [], vaults: m.vaults || [], need: m.need || 3,
    gatesOpen: !!m.gatesOpen, cageOcc: {}, states: m.states || {}, prog: {}, alerts: [], marks: [], st: 'free', boostT: 0, trapT: 0, chan: null, eLock: false, vault: null, vaultCd: 0,
    heading: P.yaw + Math.PI, rotY: P.yaw + Math.PI, concealed: false, swingCd: 0, swingAge: 9, power: { cls: m.cls || null, cd: 0, on: false, n: 0, at: now() }, rushT: 0, recT: 0, terror: 0 });
  T.n = T.relics.filter((r) => r.done).length;
  for (const [id, s] of Object.entries(T.states)) if (+id === T.id) T.st = s === 'free' ? 'injured' : s;
  R.opts.cone = false; R.opts.hideHiders = false; camera.near = 0.05; camera.updateProjectionMatrix(); resetArm(); clearShake(); body();
  if (T.role === 'hider') T.av = R.makeAvatar(null, T.self.color, false, T.self.hat, T.self.pattern);
  FX.clearRoundProps?.(); FX.buildRoundProps?.({ relics: T.relics, gates: T.gates, cages: T.cages, vaults: T.vaults });
  UI.initTrialHud?.(); UI.resetTrialHud?.({ role: T.role, cls: T.cls, need: T.need, relics: T.relics, gates: T.gates, cages: T.cages });
  T.relics.forEach((r) => { if (r.p) { FX.setRelicProgress?.(r.i, r.p); UI.setRelicProgress?.(r.i, r.p); } if (r.done) { FX.relicDone?.(r.i); } });
  if (T.gatesOpen) { FX.openGates?.(); UI.gatesOpen?.(); }
  if (T.role === 'seeker') UI.setPower?.({ cls: T.cls, cd: 0, on: false, n: T.cls === 'trapper' ? 3 : 0 });
}
export function end() {
  if (!T.on) return;
  if (T.av) { R.disposeAvatar(T.av); T.av = null; }
  T.on = false; T.chan = null; T.vault = null; body(); P.r = 0.3; camera.near = 0.08; camera.updateProjectionMatrix();
  AU.chanLoop?.(false); AU.heartbeat?.(0); UI.hideTrialHud?.(); UI.setPrompt?.(null, null); UI.concealed?.(false); UI.terror?.(0);
  FX.clearRoundProps?.();
}
export const pose = () => (T.role === 'hider' ? { yaw: T.rotY - Math.PI, c: P.crouch } : { yaw: P.yaw, c: P.crouch });
export const isOut = out;
export const vaulting = () => !!T.vault;

// ---------- per-frame
export function frame(dt, frozen, phase) {
  T.phase = phase; T.vaultCd -= dt; T.swingCd -= dt; T.swingAge += dt;
  if (T.trapT > 0) T.trapT -= dt; else if (T.boostT > 0) T.boostT -= dt;
  if (T.rushT > 0) { T.rushT -= dt; if (T.rushT <= 0) T.recT = 1; } else if (T.recT > 0) T.recT -= dt;
  const seeker = T.role === 'seeker';
  // speed multiplier by state (server owns the real caps)
  P.mul = held() ? 0 : seeker ? (T.rushT > 0 ? 1.8 : T.recT > 0 ? 0.6 : T.power.cls === 'phantom' && T.power.on ? 1.15 : 1) : T.boostT > 0 ? 1.25 : 1;
  P.mute = !seeker && P.crouch > 0.5;
  if (out()) { updatePlayer(dt, false, false); return freeCam(dt); }
  if (T.vault) return vaultFrame(dt, seeker);
  const can = !frozen && !held();
  updatePlayer(dt, can, seeker);
  if (seeker) { UI.setPrompt?.(null, null); return alertsFrame(); }
  hiderFrame(dt, can);
}

function hiderFrame(dt, can) {
  const av = T.av, spd = Math.hypot(P.vx, P.vz);
  if (spd > 0.5) T.heading = turnTo(T.heading, Math.atan2(P.vx, P.vz), dt * 12);
  T.rotY = T.heading;
  av.root.position.set(P.x, P.y, P.z); av.root.rotation.y = T.rotY;
  Object.assign(av.anim, { speed: T.st === 'injured' ? spd * 0.75 : spd, crouch: P.crouch, air: P.air, vy: P.vy, lat: 0 });
  R.animAvatar(av, dt);
  if (T.st === 'caged') cageCam(); else applyTps(P, dt, 1.35 - 0.4 * P.crouch, 3.2);
  channelFrame(can);
  // concealed: crouched + still inside a grass rect (the server decides what the seeker actually sees; this is the hider's own feedback)
  const c = P.crouch > 0.6 && spd < 1 && T.grass.some((g) => P.x >= g.x0 && P.x <= g.x1 && P.z >= g.z0 && P.z <= g.z1);
  if (c !== T.concealed) { T.concealed = c; UI.concealed?.(c); }
  alertsFrame();
}

function cageCam() {
  const c = T.cages[T.cageIdx] || { x: P.x, z: P.z };
  camera.position.set(c.x + 2.2, 2.4, c.z + 2.8); camera.lookAt(c.x, 1, c.z);
}

function alertsFrame() {
  const t = now();
  T.alerts = T.alerts.filter((a) => a.until > t);
  for (const a of T.alerts) UI.edgeAlert?.(a.kind, a.x, a.z);
}

// hold E near a relic / gate / cage
function nearTarget() {
  let best = null, bd = INTERACT_R;
  const test = (what, list, ok) => { for (const o of list) { if (!ok(o)) continue; const d = Math.hypot(o.x - P.x, o.z - P.z); if (d < bd) { bd = d; best = { what, i: o.i, o, d }; } } };
  test('relic', T.relics, (o) => !o.done);
  if (T.gatesOpen) test('gate', T.gates, () => true);
  test('cage', T.cages, (o) => T.cageOcc[o.i] != null && T.cageOcc[o.i] !== T.id);
  return best;
}
const LABEL = { relic: 'COLLECT RELIC', gate: 'ESCAPE', cage: 'FREE TEAMMATE' };
function stopChan(lock) {
  if (!T.chan) return;
  T.send('interact', { k: 'stop', what: T.chan.what, i: T.chan.i }); T.chan = null; AU.chanLoop?.(false);
  if (lock) T.eLock = true;
}
function channelFrame(can) {
  if (!keys.KeyE) T.eLock = false;
  const tg = can ? nearTarget() : null;
  if (T.chan) {
    const o = (T.chan.what === 'relic' ? T.relics : T.chan.what === 'gate' ? T.gates : T.cages).find((q) => q.i === T.chan.i);
    if (!keys.KeyE || !can || !o || Math.hypot(o.x - P.x, o.z - P.z) > INTERACT_R + 0.3) stopChan(!!keys.KeyE);
  } else if (tg && keys.KeyE && !T.eLock) {
    T.chan = { what: tg.what, i: tg.i }; T.send('interact', { k: 'start', what: tg.what, i: tg.i }); AU.chanLoop?.(true);
  }
  const cur = T.chan || tg;
  if (!cur) return UI.setPrompt?.(null, null);
  const key = cur.what + cur.i, p = T.chan ? (T.prog[key] ?? 0) : null;
  UI.setPrompt?.(`${T.chan ? 'HOLD E' : 'HOLD E'} · ${LABEL[cur.what]}`, p);
}

// ---------- vaulting: a scripted hop across a wall; collisions are skipped (we skip motion.step) and y follows a sine arc
function findVault() {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
  for (const v of T.vaults) {
    const alongX = v.ax === 'x' || v.ax === 0, a = alongX ? P.x - v.x : P.z - v.z, c = alongX ? P.z - v.z : P.x - v.x, fc = alongX ? fz : fx;
    if (Math.abs(a) > VAULT_ALONG || Math.abs(c) > VAULT_R || Math.abs(fc) < 0.3) continue;
    const dir = fc > 0 ? 1 : -1;
    if (c * dir > 0.2) continue; // already past the wall, facing away
    const ec = (alongX ? v.z : v.x) + dir * VAULT_OUT;
    return { alongX, ec, c: alongX ? P.z : P.x, dist: Math.abs(ec - (alongX ? P.z : P.x)) };
  }
  return null;
}
function startVault() {
  if (T.vault || T.vaultCd > 0 || held() || out() || T.phase === 'hide' && T.role === 'seeker' || P.air) return;
  const v = findVault(); if (!v) return;
  stopChan(false);
  const seeker = T.role === 'seeker', dur = Math.max(seeker ? 1.0 : 0.5, v.dist / VAULT_MAX_SPEED), s = { x: P.x, z: P.z };
  const e = v.alongX ? { x: P.x, z: v.ec } : { x: v.ec, z: P.z };
  T.vault = { t: 0, dur, s, e }; T.vaultCd = 0.3;
  if (!seeker) T.heading = Math.atan2(e.x - s.x, e.z - s.z);
  T.send('vault', { x: Math.round(e.x * 100) / 100, z: Math.round(e.z * 100) / 100 });
  if (!seeker) T.send('noise', { k: 'land' });
  sfx.jump?.();
}
function vaultFrame(dt, seeker) {
  const v = T.vault; v.t += dt;
  const k = Math.min(1, v.t / v.dur);
  P.x = v.s.x + (v.e.x - v.s.x) * k; P.z = v.s.z + (v.e.z - v.s.z) * k; P.y = Math.sin(Math.PI * k) * 0.55;
  P.vx = (v.e.x - v.s.x) / v.dur; P.vz = (v.e.z - v.s.z) / v.dur; P.air = true;
  if (k >= 1) { T.vault = null; P.y = 0; P.vx = 0; P.vz = 0; P.vy = 0; P.air = false; P.airborne = false; }
  if (seeker) return applyFps(P, dt, { speed: Math.hypot(P.vx, P.vz), strafe: 0, sprint: false });
  const av = T.av; T.rotY = T.heading;
  av.root.position.set(P.x, P.y, P.z); av.root.rotation.y = T.rotY;
  Object.assign(av.anim, { speed: Math.hypot(P.vx, P.vz), crouch: 0, air: true, vy: 1, lat: 0 }); R.animAvatar(av, dt);
  applyTps(P, dt, 1.35, 3.2); alertsFrame();
}

function freeCam(dt) {
  const sp = (keys.ShiftLeft ? 16 : 8) * dt, cp = Math.cos(P.pitch), fc = T.fc;
  const fx = -Math.sin(P.yaw) * cp, fy = Math.sin(P.pitch), fz = -Math.cos(P.yaw) * cp;
  const mv = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), st = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  fc.x += fx * mv * sp + Math.cos(P.yaw) * st * sp; fc.y += fy * mv * sp + ((keys.Space ? 1 : 0) - (keys.KeyC ? 1 : 0)) * sp; fc.z += fz * mv * sp - Math.sin(P.yaw) * st * sp;
  fc.x = Math.max(-45, Math.min(45, fc.x)); fc.y = Math.max(0.3, Math.min(25, fc.y)); fc.z = Math.max(-45, Math.min(45, fc.z));
  camera.position.set(fc.x, fc.y, fc.z); camera.rotation.set(P.pitch, P.yaw, 0);
  UI.setPrompt?.(null, null);
}
export function tickFx(dt) { FX.updateTrialFx?.(dt); UI.tickTrialHud?.(dt, camera); }

// ---------- input
export function onKey(code) {
  if (!T.on || out()) return;
  if (code === 'Space') return startVault();
  if (code === 'KeyQ') return T.role === 'hider' ? swapShoulder() : power();
}
export function fire() {
  if (!T.on || T.role !== 'seeker' || T.phase !== 'seek' || T.swingCd > 0 || T.vault) return;
  T.swingCd = 1.6; T.swingAge = 0; T.send('swing'); AU.swingSound?.(); addShake(0.25);
}
function power() {
  if (T.role !== 'seeker' || T.phase !== 'seek') return;
  const pw = T.power, left = pw.cd - (now() - pw.at);
  if (pw.cls !== 'trapper' && left > 0 && !pw.on) return toast(`POWER READY IN ${Math.ceil(left)}s`, 'warn');
  T.send('power');
}
addEventListener('mousedown', (e) => { if (e.button === 2 && T.on && T.role === 'seeker' && document.pointerLockElement) power(); });

export function hints() {
  if (out()) return 'SPECTATING  -  WASD fly, Space/C up/down, Shift fast';
  if (T.role === 'seeker') {
    const pw = T.power, left = Math.max(0, Math.ceil(pw.cd - (now() - pw.at))), nm = CLASSES[T.cls]?.name || 'Seeker';
    return `${nm}  -  CLICK swing  -  Q / RIGHT CLICK power${pw.cls === 'trapper' ? ` (${pw.n} traps)` : left ? ` (${left}s)` : ' ready'}  -  Space vault`;
  }
  return T.st === 'caged' ? 'CAGED - wait for a teammate to free you' : 'Hold E: relics, gates, cages  -  Space vault  -  C crouch in grass  -  Shift sprint (loud)  -  Q swap shoulder';
}

// ---------- server messages
const setSt = (id, s) => { T.states[id] = s; UI.setPlayerState?.(id, T.nameOf(id), s); };
export function onHurt(m, feed) {
  const me = m.id === T.id, who = T.nameOf(m.id);
  if (m.st === 'caged') { T.cageOcc[m.cage] = m.id; FX.cageOccupied?.(m.cage, true); }
  else for (const k of Object.keys(T.cageOcc)) if (T.cageOcc[k] === m.id) { delete T.cageOcc[k]; FX.cageOccupied?.(+k, false); }
  setSt(m.id, m.st);
  if (me) {
    stopChan(false); T.vault = null; P.y = 0;
    if (m.st === 'caged') { T.st = 'caged'; T.cageIdx = m.cage; const c = T.cages[m.cage]; if (c) T.teleport(c.x, c.z); toast('CAGED - WAIT FOR A RESCUE', 'bad'); }
    else if (m.st === 'injured' || m.st === 'free') { T.st = 'injured'; T.boostT = 2; if (m.st === 'injured') { toast('INJURED - RUN!', 'bad'); AU.hitSound?.(); addShake(0.5); } else toast('YOU WERE FREED', 'good'); }
    else if (m.st === 'out') { T.st = 'out'; T.fc.x = camera.position.x; T.fc.y = camera.position.y; T.fc.z = camera.position.z; toast("YOU'RE OUT - SPECTATING", 'bad'); }
    else if (m.st === 'escaped') { T.st = 'escaped'; T.fc.x = camera.position.x; T.fc.y = camera.position.y + 2; T.fc.z = camera.position.z; toast('YOU ESCAPED!', 'good'); }
    if (T.av && out()) T.av.root.visible = false;
    return;
  }
  R.setRemoteState(m.id, m.st === 'free' ? 'injured' : m.st);
  feed?.(m.st === 'caged' ? `${who} was caged` : m.st === 'out' ? `${who} is out` : m.st === 'escaped' ? `${who} escaped` : m.st === 'free' ? `${who} was freed` : `${who} was hit`);
  if (m.st === 'injured' || m.st === 'caged') { const a = R.remotes.get(m.id); if (a) R.flinchAvatar(a); }
}
export function onTrapped(m) { if (m.id === T.id) { T.trapT = 2.5; T.st = 'trapped'; toast('TRAPPED!', 'bad'); AU.trapSound?.(P.x, P.z); stopChan(false); } else R.setRemoteState(m.id, 'trapped'); }
export function onProg(m) {
  T.prog[m.what + m.i] = m.p;
  if (m.what === 'relic') { const r = T.relics.find((q) => q.i === m.i); if (r) r.p = m.p; FX.setRelicProgress?.(m.i, m.p); UI.setRelicProgress?.(m.i, m.p); }
}
export function onCollected(m, feed) {
  const r = T.relics.find((q) => q.i === m.i); if (r) { r.done = true; r.p = 1; }
  T.n = m.n; FX.relicDone?.(m.i); UI.relicDone?.(m.n, m.need, T.nameOf(m.by)); feed?.(`${T.nameOf(m.by)} collected a relic (${m.n}/${m.need})`, '#80ed99');
  if (T.chan?.what === 'relic' && T.chan.i === m.i) { T.chan = null; AU.chanLoop?.(false); }
}
export function onGates() {
  T.gatesOpen = true; FX.openGates?.(); UI.gatesOpen?.(); AU.gateSound?.(); toast('THE GATES ARE OPEN!', 'good');
}
export function onAlert(m) {
  const secs = m.kind === 'scream' ? 3 : 5;
  T.alerts.push({ kind: m.kind, x: m.x, z: m.z, until: now() + secs });
  FX.beacon?.(m.x, m.z, secs, m.kind); AU.alertSound?.(m.kind, m.x, m.z); if (m.kind === 'scream') AU.scream?.(m.x, m.z);
}
export function onTerror(m) { T.terror = m.k; UI.terror?.(m.k); AU.heartbeat?.(m.k); }
export function onMarks(list) { for (const q of list) { T.marks.push(q); FX.mark?.(q.x, q.z, !!(q.b || q.blood)); } if (T.marks.length > 40) T.marks.splice(0, T.marks.length - 40); }
export function onPulse(list) { for (const q of list) FX.beacon?.(q.x, q.z, 3, 'pulse'); }
export function onPower(m) {
  const was = T.power; T.power = { cls: m.cls, cd: m.cd, on: !!m.on, n: m.n, at: now() };
  if (m.cls === 'charger' && m.on && !was.on) { T.rushT = 1.6; T.recT = 0; }
  UI.setPower?.({ cls: m.cls, cd: m.cd, on: m.on, n: m.n });
  if (m.cls === 'phantom' && m.on !== was.on) toast(m.on ? 'CLOAKED' : 'CLOAK ENDED', 'warn');
}
export function onCloak(m) { if (m.id === T.id) return; const a = R.remotes.get(m.id); if (a) FX.cloakFx?.(a.root, !!m.on); }
export function onTrap(m) { if (m.gone) { T.traps.delete(m.i); FX.removeTrap?.(m.i); } else { T.traps.set(m.i, m); FX.placeTrap?.(m.i, m.x, m.z); } }
export function onSwing(m) {
  if (m.by === T.id) { if (m.hit) T.swingCd = Math.min(T.swingCd, Math.max(0, 1.0 - T.swingAge)); return; }
  const a = R.remotes.get(m.by); if (a) R.flinchAvatar(a);
  if (m.hit) AU.hitSound?.();
}
export function onEnd(m) { UI.showResults?.(m); end(); }
// terse text for the HUD counter
export const status = () => `RELICS ${T.n}/${T.need}${T.gatesOpen ? '  GATES OPEN' : ''}`;
