'use strict';
// Trial-mode bot brains (survivor + killer). think(room, b, t, dt, api) is called at 10 Hz per bot. Never throws.
// All movement goes through api.goTo (nav path) + api.nav.follow. Per-bot memory lives in b.tb.
// Note: api.goTo writes its state string to b.st, which in trial mode is the hider status, so we pass the current b.st and restore it.

const D = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rnd = (a, b) => a + Math.random() * (b - a);
const arr = (x) => (Array.isArray(x) ? x : []);
const inGrass = (T, x, z) => arr(T.grass).some((g) => x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1);
const eyeLos = (nav, a, b) => nav.losClear(a.x, (a.y || 0) + 1.5, a.z, b.x, (b.y || 0) + 1.0, b.z);
const SEEKABLE = (st) => st === 'free' || st === 'injured' || st == null;

function walker(room, b, t, dt, api, s) { // walk to (x,z); repaths when key changes or every `refresh` s. Returns true on arrival.
  return (x, z, sp, key, refresh) => {
    if (s.key !== key || t - (s.pt || 0) > refresh) {
      const st = b.st; api.goTo(room, b, x, z, st, sp); b.st = st; s.key = key; s.pt = t; s.arrived = false;
    }
    s.arrived = api.nav.follow(b, sp, dt) || false; b.speed = s.arrived ? 0 : sp;
    return s.arrived;
  };
}

// ---------------------------------------------------------------- hider
function hider(room, b, t, dt, api) {
  const T = room.trial, nav = api.nav, s = b.tb || (b.tb = {});
  if (b.st === 'caged' || b.st === 'out' || b.st === 'escaped') { b.speed = 0; return; }
  if (s.hideUntil == null) { s.hideUntil = t + rnd(8, 25); s.skip = {}; s.tries = 0; }
  if (typeof b.c !== 'number') b.c = 0;
  const setC = (v) => { b.c = b.c + Math.max(-dt * 4, Math.min(dt * 4, v - b.c)); };
  const walk = walker(room, b, t, dt, api, s);
  const hurt = b.st === 'injured';
  const sk = arr(api.seekersOf(room))[0];
  let d = 1e9, see = false;
  if (sk) { d = D(b, sk); see = d < 18 && eyeLos(nav, b, sk); }
  if (see) s.sk = { x: sk.x, z: sk.z, t };
  const known = s.sk && t - s.sk.t < 3 ? s.sk : null; // only what it actually saw, 3 s memory
  const relics = arr(T.relics), gates = arr(T.gates), cages = arr(T.cages), grass = arr(T.grass);

  if (b.chan) { // holding an interaction
    const done = b.chan.what === 'relic' && relics[b.chan.i] && relics[b.chan.i].done;
    if (done || (see && d < 14)) {
      api.stopChannel(room, b); s.key = null; s.relic = null;
      if (see) { s.fleeUntil = t + 3; s.hideUntil = Math.max(s.hideUntil, t + 6); }
    } else { b.speed = 0; setC(0); return; }
  }

  // flee
  if (see && d < 10) s.fleeUntil = t + 2.5;
  else if (see && d < 14 && s.fleeUntil > t) s.fleeUntil = Math.max(s.fleeUntil, t + 1);
  if (t < (s.fleeUntil || 0) && known) {
    s.relic = null; s.hideUntil = Math.max(s.hideUntil, t + 6);
    const sprint = see && d < 10, sp = sprint ? 6.2 : 3.9;
    if (!s.flee || t - s.flee.t > 1.5 || D(b, s.flee) < 1) {
      const cands = grass.map((g) => ({ x: rnd(g.x0, g.x1), z: rnd(g.z0, g.z1), g: 1 }))
        .concat(arr(T.vaults).map((v) => ({ x: v.x, z: v.z, g: 0 })), relics.map((r) => ({ x: r.x, z: r.z, g: 0 })));
      let best = null, bs = -1e9;
      const ax = b.x - known.x, az = b.z - known.z, al = Math.hypot(ax, az) || 1;
      for (const c of cands) {
        const ds = D(c, known), db = D(c, b);
        if (ds < 12) continue;
        const sc = ds * 0.5 - db * 0.3 + (c.g ? 8 : 0) + (((c.x - b.x) * ax + (c.z - b.z) * az) / ((db || 1) * al)) * 10 + (hurt && c.g ? 6 : 0);
        if (sc > bs) { bs = sc; best = c; }
      }
      if (!best) best = { x: Math.max(-33, Math.min(33, b.x + (ax / al) * 15)), z: Math.max(-33, Math.min(33, b.z + (az / al) * 15)) };
      s.flee = { x: best.x, z: best.z, t };
    }
    walk(s.flee.x, s.flee.z, sp, 'flee' + Math.round(s.flee.x) + ',' + Math.round(s.flee.z), 1);
    setC(sprint ? 0 : (inGrass(T, b.x, b.z) ? 1 : 0));
    return;
  }

  // gates open: leave
  if (T.gatesOpen && gates.length) {
    let g = null, bc = 1e9;
    for (const q of gates) { const c = D(b, q) + (known && D(known, q) < 12 ? 40 : 0); if (c < bc) { bc = c; g = q; } }
    if (g && !(known && D(known, g) < 9)) {
      setC(0);
      if (D(b, g) < 1.6) { if (!b.chan) api.startChannel(room, b, 'gate', g.i); b.speed = 0; return; }
      walk(g.x, g.z, 3.9, 'gate' + g.i, 2); return;
    }
  }

  // rescue
  if (!hurt) {
    const c = cages.find((q) => q.occ);
    if (c && !(known && D(known, c) < 25) && !(see && d < 25)) {
      let closest = true;
      for (const o of arr(api.hidersOf(room))) if (o !== b && o.st === 'free' && D(o, c) < D(b, c)) closest = false;
      if (closest) {
        setC(0);
        if (D(b, c) < 1.8) { if (!b.chan) api.startChannel(room, b, 'cage', c.i); b.speed = 0; return; }
        walk(c.x, c.z, 3.9, 'cage' + c.i, 2); return;
      }
    }
  }

  // relic task
  const free = relics.filter((r) => !r.done && !(s.skip[r.i] > t));
  const eligible = !(see && d < 20) && !(known && D(b, known) < 20) && t >= s.hideUntil && (!hurt || t > s.hideUntil + 25) && free.length;
  if (!eligible) { if (s.relic != null) s.hideUntil = Math.max(s.hideUntil, t + rnd(4, 10)); s.relic = null; }
  else {
    if (s.relic == null) {
      let bi = null, bc = 1e9;
      for (const r of free) {
        let w = 0;
        for (const o of arr(api.hidersOf(room))) if (o !== b && ((o.tb && o.tb.relic === r.i) || (o.chan && o.chan.what === 'relic' && o.chan.i === r.i))) w++;
        if (w >= 2) continue;
        const c = D(b, r) + (known ? Math.max(0, 30 - D(known, r)) * 2 : 0) + w * 15 + Math.random() * 5;
        if (c < bc) { bc = c; bi = r.i; }
      }
      if (bi != null) { s.relic = bi; s.taskT = t; s.tries = 0; }
    }
    const r = s.relic != null && relics.find((q) => q.i === s.relic);
    if (r && !r.done && t - s.taskT < 60) {
      setC(0);
      if (D(b, r) < 1.5) {
        if (++s.tries > 4) { s.skip[r.i] = t + 30; s.relic = null; } else { api.startChannel(room, b, 'relic', r.i); b.speed = 0; return; }
      } else { walk(r.x, r.z, 3.9, 'task' + r.i, 1.5); return; }
    } else { if (r) s.skip[r.i] = t + 30; s.relic = null; }
  }

  // hide crouched in grass
  if (!s.spot || (known && D(s.spot, known) < 8 && t > (s.spotT || 0) + 3)) {
    let best = null, bs = -1e9;
    for (let k = 0; k < 6 && grass.length; k++) {
      const g = grass[(Math.random() * grass.length) | 0], p = { x: rnd(g.x0 + 0.6, Math.max(g.x0 + 0.6, g.x1 - 0.6)), z: rnd(g.z0 + 0.6, Math.max(g.z0 + 0.6, g.z1 - 0.6)) };
      let sc = -D(b, p) * 0.3 + rnd(0, 8) + (known ? D(known, p) * 0.6 : 0);
      for (const o of arr(api.hidersOf(room))) if (o !== b && o.tb && o.tb.spot && D(o.tb.spot, p) < 3) sc -= 6;
      if (sc > bs) { bs = sc; best = p; }
    }
    s.spot = best; s.spotT = t;
  }
  if (!s.spot) { b.speed = 0; setC(1); return; }
  const inG = inGrass(T, b.x, b.z), sp = inG && b.c > 0.5 ? 2.0 : 3.9;
  const arrived = walk(s.spot.x, s.spot.z, sp, 'hide' + Math.round(s.spot.x) + ',' + Math.round(s.spot.z), 3);
  setC(arrived || inG ? 1 : 0);
}

// ---------------------------------------------------------------- seeker
function seeker(room, b, t, dt, api) {
  if (room.phase !== 'seek') { b.speed = 0; return; }
  const T = room.trial, nav = api.nav, s = b.tb || (b.tb = { avoid: new Map(), lastSeen: t, visit: {}, pw: -99, cloakT: -99, sw: -9, trapped: 0 });
  const walk = walker(room, b, t, dt, api, s), relics = arr(T.relics), gates = arr(T.gates);
  const fx = Math.sin(b.heading || 0), fz = Math.cos(b.heading || 0);
  const power = () => { api.usePower(room, b); };

  // vision (cone + LOS + grass concealment) and hearing of sprinters
  const vis = [];
  for (const h of arr(api.hidersOf(room))) {
    if (!SEEKABLE(h.st)) continue;
    const dx = h.x - b.x, dz = h.z - b.z, d = Math.hypot(dx, dz), sprint = (h.speed || 0) > 5.5;
    let R = 12;
    if (inGrass(T, h.x, h.z) && !sprint) R = h.c > 0.6 ? ((h.speed || 0) < 1 ? 2.5 : 4) : 9;
    const heard = sprint && d < 8;
    if (d > R && !heard) continue;
    if (!heard) {
      if (!(d < 1.5 || (dx * fx + dz * fz) / d > 0.866)) continue;
      if (!(nav.losClear(b.x, (b.y || 0) + 1.5, b.z, h.x, (h.y || 0) + 0.5, h.z) || nav.losClear(b.x, (b.y || 0) + 1.5, b.z, h.x, (h.y || 0) + 1.3, h.z))) continue;
    }
    vis.push({ h, d });
  }
  if (s.swung && t - s.swung.t < 1.5 && s.swung.h.st !== s.swung.st) { s.avoid.set(s.swung.h, t + 8); s.swung = null; } // it hit: go for someone else
  let pool = vis.filter((v) => !(s.avoid.get(v.h) > t));
  if (!pool.length) pool = vis.filter((v) => v.h.st !== 'injured' || !(s.avoid.get(v.h) > t));
  pool.sort((a, c) => a.d - c.d);
  const tgt = pool[0] || null;
  if (tgt) { s.last = { x: tgt.h.x, z: tgt.h.z, t }; s.lastSeen = t; }

  if (tgt || (s.last && t - s.last.t < 3)) { // chase (3 s memory of last sighting)
    const p = tgt ? tgt.h : s.last, d = D(b, p), sp = tgt ? 5.4 : 4.6;
    s.mode = 'chase'; s.pt0 = null;
    if (tgt && tgt.d < 2.2) {
      b.heading = Math.atan2(p.x - b.x, p.z - b.z); b.speed = 0;
      if (t - s.sw > 0.4) { s.sw = t; s.swung = { h: tgt.h, st: tgt.h.st, t }; api.swing(room, b); }
      return;
    }
    if (b.cls === 'charger' && tgt && tgt.d > 8 && tgt.d < 14 && t - s.pw > 1 && nav.losClear(b.x, 1.5, b.z, p.x, 1.0, p.z)) { s.pw = t; power(); }
    if (b.cls === 'phantom' && d > 10 && d < 18 && t - s.cloakT > 25) { s.cloakT = t; power(); }
    walk(p.x, p.z, sp, 'chase', 0.3);
    return;
  }
  if (s.mode === 'chase') { s.mode = null; s.key = null; }

  // idle powers
  if (b.cls === 'tracker' && t - s.lastSeen > 15 && t - s.pw > 31) { s.pw = t; power(); }
  if (b.cls === 'trapper' && !s.trapQ) {
    const spots = relics.filter((r) => !r.done).concat(gates).sort(() => Math.random() - 0.5).slice(0, 3);
    s.trapQ = spots.map((r) => { const l = Math.max(1, D(b, r)); return { x: r.x + ((b.x - r.x) / l) * 2.5, z: r.z + ((b.z - r.z) / l) * 2.5 }; });
  }
  if (b.cls === 'trapper' && s.trapQ.length) {
    const q = s.trapQ[0];
    if (walk(q.x, q.z, 4.6, 'trap' + s.trapQ.length, 2) || D(b, q) < 1) { s.trapQ.shift(); b.botTraps = (b.botTraps || 0) + 1; power(); s.key = null; }
    return;
  }

  // investigate a fresh alert
  const a = b.lastAlert;
  if (a && typeof a.x === 'number') {
    let age = api.now() - a.t; if (a.t > 1e11) age = (api.now() - a.t) / 1000;
    if (age >= 0 && age < 20 && s.alertT !== a.t) {
      if (walk(a.x, a.z, 4.6, 'alert' + a.t, 3) || D(b, a) < 3) { s.alertT = a.t; s.look = t + 2; s.base = b.heading; s.key = null; }
      return;
    }
  }

  // look around at a patrol stop
  if (s.look > t) { b.speed = 0; b.heading = (s.base || 0) + Math.sin((s.look - t) * 3) * 0.9; return; }

  // patrol: relic sites weighted by staleness and proximity; gates when open
  if (!s.pat || s.patDone) {
    let c = null;
    if (T.gatesOpen && gates.length) c = gates[(Math.random() * gates.length) | 0];
    else {
      let tot = 0; const ws = [];
      const live = relics.filter((r) => !r.done);
      for (const r of live) { const w = (1 + Math.min(12, (t - (s.visit[r.i] || 0)) / 10)) / (1 + D(b, r) / 30); ws.push(w); tot += w; }
      let k = Math.random() * tot; for (let i = 0; i < live.length; i++) { k -= ws[i]; if (k <= 0) { c = live[i]; break; } }
      c = c || live[0];
    }
    if (c) { s.pat = { x: c.x, z: c.z, i: c.i }; s.patDone = false; s.key = null; } else { b.speed = 0; return; }
  }
  const dd = D(b, s.pat), arrived = walk(s.pat.x, s.pat.z, 4.6, 'pat' + s.pat.x + s.pat.z, 4);
  if (arrived || dd < 4) { if (s.pat.i != null) s.visit[s.pat.i] = t; s.patDone = true; s.look = t + rnd(1.5, 2.5); s.base = b.heading; b.speed = 0; }
}

function think(room, b, t, dt, api) {
  try {
    if (!room || !room.trial || !b || !api || !api.nav) return;
    if (b.role === 'seeker') seeker(room, b, t, dt, api); else if (b.role === 'hider') hider(room, b, t, dt, api);
  } catch (e) { /* a bot must never take the room tick down */ }
}

module.exports = { think };
