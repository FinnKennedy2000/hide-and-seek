// Prop Hunt, local side. Hiders: third-person camera, disguise (F), camouflage (G), rotation lock (R + wheel), taunt (T).
// Seekers: first-person paint blaster (click, R reload), ammo crate, spectator free-cam when out.
// The server is authoritative for everything; this sends requests and renders the broadcasts.
import * as THREE from 'three';
import { $, setText } from '../core/util.js';
import { P, G } from '../core/state.js';
import { keys } from '../core/input.js';
import { camera } from '../render/renderer.js';
import { solids, props } from '../world/build.js';
import { sfx } from '../audio/sfx.js';
import { burst } from '../render/fx.js';
import { toast } from '../ui/hud.js';
import { updatePlayer } from '../player/controller.js';
import * as R from '../net/remote.js';
import * as B from './blaster.js';

const me = { on: false, id: 0, role: 'hider', send() {}, colorOf: () => 0xffffff, av: null, propId: null, rotLock: false, propRot: 0, rotY: 0, heading: 0, cdDis: 0, cdTaunt: 0, cdCamo: 0, scrapeT: 0, out: false, hp: 100, mag: 6, res: 12, reloading: false, lastFire: 0, grabT: 0, phase: 'hide', fc: new THREE.Vector3() };
export const ph = me;
const ray = new THREE.Raycaster();
const _f = new THREE.Vector3(), _p = new THREE.Vector3(), _b = new THREE.Vector3(), _o = new THREE.Vector3(), _q = new THREE.Vector3();
const QPI = Math.PI / 4;
const turnTo = (cur, tgt, rate) => cur + Math.max(-rate, Math.min(rate, ((tgt - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
const r3 = (v) => Math.round(v * 1000) / 1000;
const now = () => performance.now() / 1000;
const MAG = 6;

const R_PH = 0.22; // prop hunt body radius: lets players sit flush against walls
function resetPlayerBody(r = R_PH) { Object.assign(P, { r, fixedPh: 0, mul: 1, mute: false }); }

// ctx: { id, role, send(t,data), colorOf(id), self: {color,hat,pattern} }
export function begin(ctx) {
  end();
  Object.assign(me, { on: true, id: ctx.id, role: ctx.role, send: ctx.send, colorOf: ctx.colorOf, propId: null, rotLock: false, propRot: 0, rotY: P.yaw + Math.PI, heading: P.yaw + Math.PI, cdDis: 0, cdTaunt: 0, cdCamo: 0, scrapeT: 0, out: false, hp: 100, mag: MAG, res: 12, reloading: false, lastFire: 0, phase: 'hide', self: ctx.self });
  R.opts.cone = false; camera.near = 0.05; camera.updateProjectionMatrix();
  setRole(ctx.role);
}
function setRole(role) {
  me.role = role;
  if (me.av) { R.disposeAvatar(me.av); me.av = null; }
  resetPlayerBody(); me.propId = null;
  if (role === 'hider') me.av = R.makeAvatar(null, me.self.color, false, me.self.hat, me.self.pattern);
  B.showBlaster(role === 'seeker'); updateHud();
}
export function end() {
  if (me.av) { R.disposeAvatar(me.av); me.av = null; }
  me.on = false; resetPlayerBody(0.3); camera.near = 0.08; camera.updateProjectionMatrix(); B.showBlaster(false); B.clearFx(); R.opts.cone = true;
  $('ammoHud').classList.add('hidden');
}
// fields sent with every position update
export const pose = () => (me.role === 'hider' ? { yaw: me.rotY - Math.PI, c: me.propId != null ? 0 : P.crouch } : { yaw: P.yaw, c: P.crouch });

// ---------- per-frame
export function frame(dt, frozen, phase) {
  me.phase = phase; me.cdDis -= dt; me.cdTaunt -= dt; me.cdCamo -= dt;
  const disguised = me.propId != null;
  P.mul = disguised ? 0.6 : 1; P.mute = disguised;
  if (me.out) { updatePlayer(dt, false); freeCam(dt); return; }
  updatePlayer(dt, !frozen);
  const spd = Math.hypot(P.vx, P.vz);
  if (me.role === 'hider') hiderFrame(dt, spd, disguised); else seekerFrame(dt, spd, phase);
}

function hiderFrame(dt, spd, disguised) {
  const av = me.av;
  if (!disguised) { if (spd > 0.5) me.heading = turnTo(me.heading, Math.atan2(P.vx, P.vz), dt * 12); me.rotY = me.heading; }
  else { if (!me.rotLock) me.propRot = P.yaw; me.rotY = me.propRot; }
  av.root.position.set(P.x, P.y, P.z); av.root.rotation.y = me.rotY;
  Object.assign(av.anim, { speed: spd, crouch: disguised ? 0 : P.crouch, air: P.air, vy: P.vy, lat: 0 });
  R.animAvatar(av, dt);
  // orbit camera behind the player, pulled in by the first solid in the way
  const pr = disguised ? props[me.propId] : null, cp = Math.cos(P.pitch);
  _f.set(-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp);
  const dist = 3.2 + (pr ? Math.max(pr.w, pr.d) * 0.6 : 0);
  _p.set(P.x, P.y + (pr ? Math.max(0.9, pr.h * 0.8) : 1.35 - 0.4 * P.crouch), P.z);
  _b.copy(_f).negate(); ray.set(_p, _b); ray.far = dist;
  const h = ray.intersectObjects(solids, false)[0];
  camera.position.copy(_p).addScaledVector(_b, h ? Math.max(0.1, h.distance - 0.15) : dist);
  camera.position.y = Math.max(0.12, camera.position.y);
  camera.rotation.set(P.pitch, P.yaw, 0);
  // moving disguised makes a soft scrape everyone nearby can hear
  if (disguised && spd > 0.5 && !P.air) { me.scrapeT -= dt; if (me.scrapeT <= 0) { me.scrapeT = 0.8; me.send('noise', { k: 'scrape' }); sfx.scrape(null); } } else me.scrapeT = 0;
  const t = me.cdDis <= 0 ? targetProp() : null;
  $('crosshair').classList.toggle('hot', t != null); $('prompt').classList.toggle('show', t != null);
  if (t != null) setText('prompt', `F · BECOME ${props[t].name.toUpperCase()}`);
}

function seekerFrame(dt, spd, phase) {
  B.updateBlaster(dt, spd > 0.5);
  B.updateCrate(dt, true);
  $('crosshair').classList.remove('hot'); $('prompt').classList.remove('show');
  const c = B.cratePos();
  if (c && phase === 'seek' && now() - me.grabT > 0.5 && Math.hypot(c.x - P.x, c.z - P.z) < 1.6) { me.grabT = now(); me.send('grab'); }
  updateHud();
}
export function tick(dt) { B.updateTracers(dt); if (me.on && me.role !== 'seeker') B.updateCrate(dt, false); }

function freeCam(dt) {
  const sp = (keys.ShiftLeft ? 16 : 8) * dt, cp = Math.cos(P.pitch);
  _f.set(-Math.sin(P.yaw) * cp, Math.sin(P.pitch), -Math.cos(P.yaw) * cp);
  const mv = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), st = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  me.fc.addScaledVector(_f, mv * sp); me.fc.x += Math.cos(P.yaw) * st * sp; me.fc.z -= Math.sin(P.yaw) * st * sp;
  me.fc.y += ((keys.Space ? 1 : 0) - (keys.KeyC ? 1 : 0)) * sp;
  me.fc.set(Math.max(-30, Math.min(30, me.fc.x)), Math.max(0.3, Math.min(20, me.fc.y)), Math.max(-30, Math.min(30, me.fc.z)));
  camera.position.copy(me.fc); camera.rotation.set(P.pitch, P.yaw, 0);
  B.updateCrate(dt, false);
}

// ---------- looking at / sampling the world
function targetProp() {
  camera.getWorldDirection(_f); ray.set(camera.position, _f); ray.far = camera.position.distanceTo(_q.set(P.x, P.y + 1, P.z)) + 5;
  const h = ray.intersectObjects(solids, false)[0];
  if (!h) return null;
  const id = h.object.userData.propId;
  return id >= 0 && Math.hypot(h.point.x - P.x, h.point.z - P.z, Math.max(0, h.point.y - P.y - 1.7)) <= 4 ? id : null;
}
function pixel(tex, uv) {
  const img = tex.image;
  if (!img || !img.getContext) return null;
  const x = Math.min(img.width - 1, Math.floor((((uv.x * tex.repeat.x) % 1) + 1) % 1 * img.width)), y = Math.min(img.height - 1, Math.floor((1 - ((((uv.y * tex.repeat.y) % 1) + 1) % 1)) * img.height));
  const d = (tex.userData.ctx ||= img.getContext('2d')).getImageData(x, y, 1, 1).data;
  return new THREE.Color().setRGB(d[0] / 255, d[1] / 255, d[2] / 255, THREE.SRGBColorSpace);
}
// colour of the surface we're touching: forward first, else the floor under us
function sampleSurface() {
  _o.set(P.x, P.y + 0.9, P.z); _f.set(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); ray.set(_o, _f); ray.far = 1.4;
  let h = ray.intersectObjects(solids, false)[0];
  if (!h) { _o.set(P.x, P.y + 0.4, P.z); ray.set(_o, _b.set(0, -1, 0)); ray.far = 1.2; h = ray.intersectObjects(solids, false)[0]; }
  if (!h) return null;
  const m = h.object.material, c = m.color.clone();
  if (m.map && h.uv) { const px = pixel(m.map, h.uv); if (px) c.multiply(px); }
  return c.getHex();
}

// ---------- input
// reloading is optimistic: cleared unless the server confirms (rl) within 1.5s
let rlTimer = 0;
function setReloading() {
  me.reloading = true; clearTimeout(rlTimer);
  rlTimer = setTimeout(() => { if (me.reloading) { me.reloading = false; updateHud(); } }, 1500);
}
export function onKey(code) {
  if (!me.on || me.out) return;
  if (me.role === 'seeker') {
    if (code === 'KeyR' && !me.reloading && me.mag < MAG && me.res > 0) { setReloading(); me.send('reload'); sfx.reload(); }
    return;
  }
  if (code === 'KeyF' && me.cdDis <= 0) {
    const t = targetProp();
    if (t != null) { me.cdDis = 3.05; me.send('disguise', { propId: t }); }
    else if (me.propId != null) { me.cdDis = 3.05; me.send('disguise', { propId: null }); }
  } else if (code === 'KeyG' && me.cdCamo <= 0) {
    const c = sampleSurface();
    if (c == null) return toast('NOTHING TO COPY', '#ffd166');
    me.cdCamo = 1; me.send('camo', { c });
  } else if (code === 'KeyR') { me.rotLock = !me.rotLock; toast(me.rotLock ? 'ROTATION LOCKED (WHEEL TO TURN 45)' : 'ROTATION FREE', '#ffb44d'); }
  else if (code === 'KeyT' && me.cdTaunt <= 0) { me.cdTaunt = 10.05; me.send('taunt'); }
}
export function onWheel(d) {
  if (me.on && me.role === 'hider' && me.propId != null && me.rotLock) me.propRot = Math.round(me.propRot / QPI) * QPI + d * QPI;
}
export function fire() {
  if (!me.on || me.role !== 'seeker' || me.out || me.phase !== 'seek' || me.reloading) return;
  const t = now(); if (t - me.lastFire < 0.3) return;
  if (me.mag <= 0) { sfx.empty(); toast(me.res > 0 ? 'EMPTY - PRESS R' : 'OUT OF AMMO', '#ffd166'); me.lastFire = t; return; }
  me.lastFire = t; me.mag--;
  camera.getWorldDirection(_f);
  me.send('shoot', { ox: r3(camera.position.x), oy: r3(camera.position.y), oz: r3(camera.position.z), dx: r3(_f.x), dy: r3(_f.y), dz: r3(_f.z), d: R.interpDelay() }); // d: how far in the past remote players are drawn (server lag compensation)
  B.recoil(); sfx.shoot(); updateHud();
}

// ---------- server events (avatars: id === me.id is the local one)
const avatarOf = (id) => (id === me.id ? me.av : R.remotes.get(id));
const where = (a) => (a ? { x: a.root.position.x, z: a.root.position.z } : null);

export function onDisguise(m) {
  const a = avatarOf(m.id); if (!a) return;
  R.setDisguise(a, m.propId);
  const p = a.root.position;
  burst(p.x, p.y + 0.6, p.z, 0xeeeeff, 40, 0.5, 1.6, 0.18); sfx.puff(m.id === me.id ? null : where(a));
  if (m.id !== me.id) return;
  me.propId = m.propId; me.cdDis = 3.05; me.propRot = me.rotY;
  const pr = m.propId != null ? props[m.propId] : null;
  P.r = pr ? Math.max(0.15, Math.min(0.45, Math.min(pr.w, pr.d) / 2)) : R_PH; P.fixedPh = pr ? Math.max(0.5, pr.h) : 0;
  toast(pr ? `YOU ARE A ${pr.name.toUpperCase()}` : 'BACK TO NORMAL', '#80ed99');
}
export function onCamo(m) { const a = avatarOf(m.id); if (a) { R.tintAvatar(a, m.c); if (m.id === me.id) toast('CAMOUFLAGED', '#80ed99'); } }
export function onTaunt(m) { sfx.taunt({ x: m.x, z: m.z }); const a = avatarOf(m.id); if (a) R.tauntAvatar(a); }
export function onScrape(m) { sfx.scrape(m); }

export function onShot(m) {
  const color = me.colorOf(m.by), p = new THREE.Vector3(m.x, m.y, m.z), o = new THREE.Vector3(m.ox, m.oy, m.oz);
  const mine = m.by === me.id, sa = avatarOf(m.by);
  const start = mine ? B.muzzleWorld(new THREE.Vector3()) : o.clone().add(_q.copy(p).sub(o).normalize().multiplyScalar(0.6)).add(_b.set(0, -0.2, 0));
  if (!mine) sfx.shoot(where(sa) || m);
  B.tracer(start, p, color, () => {
    const pos = { x: p.x, z: p.z };
    if (m.hit) { burst(p.x, p.y, p.z, color, 22, 0.6, 2.2, 0.14); sfx.splat(pos); return; }
    const n = B.surfaceNormal(o, p);
    if (n) { B.splat(p, n, color); sfx.splat(pos); }
  });
}
export function onTagged(m) {
  const a = avatarOf(m.target);
  if (a) { R.setDisguise(a, null); R.flinchAvatar(a); R.paintAvatar(a, me.colorOf(m.by)); R.setSeeker(m.target, true); }
  if (m.target === me.id) { me.out = false; setRole('seeker'); me.mag = MAG; me.res = 0; me.hp = 100; sfx.hurt(); }
}
export function onOut(m) {
  if (m.id === me.id) {
    me.out = true; me.fc.copy(camera.position); B.showBlaster(false); toast("YOU'RE OUT - SPECTATING", '#ff4d5e'); $('ammoHud').classList.add('hidden');
  } else { const a = R.remotes.get(m.id); if (a) a.root.visible = false; }
}
export function onAmmo(m) {
  if (m.hp < me.hp && me.on) sfx.hurt();
  clearTimeout(rlTimer);
  Object.assign(me, { mag: m.mag, res: m.res, hp: m.hp, reloading: !!m.rl }); updateHud();
}
export function onPickup(m) { B.spawnCrate(m.x, m.z); if (me.role === 'seeker') toast('AMMO CRATE DROPPED!', '#22d3ee'); }
export function onPicked(m) { B.removeCrate(); if (m.by === me.id) { sfx.pickup(); toast('+6 SHOTS', '#22d3ee'); } }

// ---------- HUD
function updateHud() {
  const on = me.on && me.role === 'seeker' && !me.out;
  $('ammoHud').classList.toggle('hidden', !on);
  if (!on) return;
  setText('ammoTxt', me.reloading ? 'RELOADING...' : `${me.mag} / ${me.res}   ${Math.ceil(me.res / MAG)} MAG${Math.ceil(me.res / MAG) === 1 ? '' : 'S'}`);
  $('hpFill').style.width = `${Math.max(0, me.hp)}%`; setText('hpTxt', `HEALTH ${Math.max(0, me.hp)}`);
}
export function hints() {
  if (me.out) return 'SPECTATING  -  WASD fly, Space/C up/down, Shift fast';
  const cd = (v) => (v > 0 ? ` (${Math.ceil(v)}s)` : '');
  if (me.role === 'seeker') return 'CLICK shoot  -  R reload  -  wrong shots cost health  -  grab the glowing crate';
  return `F disguise${cd(me.cdDis)}  -  G camouflage  -  R ${me.rotLock ? 'unlock' : 'lock'} rotation (wheel: turn 45)  -  T taunt${cd(me.cdTaunt)}`;
}
