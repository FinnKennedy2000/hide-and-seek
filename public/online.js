// Online mode: lobby UI, round flow and HUD. The server is authoritative; this only renders its state
// and sends our own position / tag requests. Reuses the world, player controller and audio from game.js.
import { THREE, camera, canvas, P, G, losClear, sfx, burst, toast, show, fmt, setText, requestLock, initAudio, updatePlayer, toMenu, hooks, $ } from './game.js';
import { connect } from './net.js';
import * as R from './remote.js';

const NAME_KEY = 'hs-name';
const TAG_RANGE = 3.0;   // client-side check; server accepts <= 3.5 to absorb latency
const now = () => performance.now() / 1000;

// view: menu | lobby | play | results | conn
const st = { net: null, view: 'menu', id: 0, code: '', hostId: 0, players: [], role: 'hider', phase: 'lobby', deadline: 0, hidersLeft: 0, sendT: 0, tagCd: 0, lastCount: -1, linkCode: '', retry: null };

const readName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const saveName = (n) => { try { localStorage.setItem(NAME_KEY, n); } catch { /* storage blocked: fine */ } };
const cleanName = (n) => n.replace(/[^\x20-\x7e]/g, '').trim().slice(0, 16);
const playerOf = (id) => st.players.find((p) => p.id === id);
const nameOf = (id) => playerOf(id)?.name ?? '?';
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// ----- views
const PANELS = { menu: 'olMenu', lobby: 'olLobby', results: 'olResults', conn: 'olConn' };
function setView(v) {
  st.view = v;
  for (const [k, id] of Object.entries(PANELS)) show(id, k === v);
  show('title', false);
  show('hud', v === 'play');
  show('btnLeave', v === 'play');
  if (v !== 'play') { $('blackout').classList.remove('on'); document.exitPointerLock?.(); G.phase = 'menu'; }
}
const msg = (t) => { $('olMsg').textContent = t || ''; };

function openMenu() {
  initAudio();
  toMenu(); // hides AI characters, resets camera orbit
  const link = new URLSearchParams(location.search).get('room');
  const code = link && /^[A-Za-z]{4}$/.test(link) ? link.toUpperCase() : '';
  $('olName').value = readName();
  $('olCode').value = code;
  $('olCreateRow').classList.toggle('hidden', !!code);
  $('olOr').textContent = code ? '' : 'or join with a code';
  $('olHeading').textContent = code ? `Joining room ${code}` : 'Pick a name, then create or join a room';
  msg('');
  setView('menu');
  $('olName').focus();
}

function leave(send = true) {
  if (send) st.net?.send('leave');
  st.net?.close(); st.net = null;
  st.code = ''; st.players = [];
  R.clearRemotes();
  const u = new URL(location.href); u.searchParams.delete('room'); history.replaceState(null, '', u);
  for (const id of Object.values(PANELS)) show(id, false);
  show('btnLeave', false);
  toMenu();
}

// ----- connection
function open(onopen) {
  st.net?.close();
  try { st.net = connect({ onopen, onmessage: onMsg, onclose: onClose }); } catch { onClose(); }
}
function submit(action) {
  const name = cleanName($('olName').value);
  const code = $('olCode').value.toUpperCase().replace(/[^A-Z]/g, '');
  if (!name) return msg('Enter a name first');
  if (action === 'join' && code.length !== 4) return msg('Room codes are 4 letters');
  initAudio(); saveName(name); msg('Connecting...');
  st.retry = { name, code: action === 'join' ? code : '' };
  open(() => st.net.send(action, { name, code }));
}
function onClose() {
  st.net = null;
  if (st.view === 'menu') return msg('Could not reach the server. Check your connection and try again.');
  if (st.view === 'conn') return;
  st.retry = { name: st.retry?.name || readName(), code: st.code };
  st.code = ''; // forces the rejoin below to start from a clean slate
  R.clearRemotes();
  setView('conn');
}

// ----- server messages
const handlers = {
  err(m) {
    const text = String(m.msg || 'Error');
    if (st.code) return void ($('lobHint').textContent = text); // e.g. host pressed Start alone
    setView('menu'); msg(text); st.net?.close(); st.net = null;
  },
  room(m) {
    if (st.view === 'play') for (const p of st.players) if (!m.players.some((q) => q.id === p.id)) { feed(`${p.name} left`); R.removeRemote(p.id); }
    st.id = m.you; st.code = m.code; st.hostId = m.host; st.players = m.players;
    if (st.view === 'menu' || st.view === 'conn') { setView('lobby'); history.replaceState(null, '', `?room=${m.code}`); }
    renderLobby();
  },
  round(m) {
    G.mode = 'online'; G.paused = false;
    R.clearRemotes();
    const seekers = new Set(m.seekers);
    for (const p of st.players) {
      p.role = seekers.has(p.id) ? 'seeker' : 'hider';
      if (p.id !== st.id) R.addRemote(p.id, p.name, p.color, p.role === 'seeker');
    }
    st.role = playerOf(st.id).role; st.phase = 'hide'; st.deadline = now() + m.hide; st.hidersLeft = st.players.length - seekers.size; st.lastCount = -1; st.tagCd = 0;
    const sp = m.spawns.find((s) => s.id === st.id);
    Object.assign(P, { x: sp.x, y: 0, z: sp.z, vx: 0, vz: 0, vy: 0, yaw: sp.yaw, pitch: 0, crouch: 0 });
    $('feed').textContent = ''; $('crosshair').classList.remove('hot'); $('prompt').classList.remove('show'); $('timer').classList.remove('low');
    $('seekerState').style.display = 'none'; $('detectWrap').classList.remove('show'); $('found').style.display = '';
    $('blackout').classList.toggle('on', st.role === 'seeker');
    $('blackmsg').textContent = 'THE HIDERS ARE HIDING...';
    setView('play'); G.phase = 'play';
    requestLock();
  },
  phase(m) {
    st.phase = 'seek'; st.deadline = now() + m.tl;
    $('blackout').classList.remove('on');
    sfx.go(); toast(st.role === 'seeker' ? 'GO FIND THEM!' : 'THEY ARE COMING!', '#ffb44d');
  },
  snap(m) {
    if (st.view !== 'play') return;
    const t = now();
    st.deadline = t + m.tl; st.hidersLeft = m.hl;
    for (const [id, x, y, z, yaw, pitch, c] of m.p) if (id !== st.id) R.pushSnap(id, t, x, y, z, yaw, pitch, c);
  },
  tagged(m) {
    const target = playerOf(m.target), by = playerOf(m.by);
    if (target) target.role = 'seeker';
    st.hidersLeft = m.hl;
    feed(`${nameOf(m.by)} tagged ${nameOf(m.target)}`, by && hex(by.color));
    R.setSeeker(m.target, true);
    const a = R.remotes.get(m.target);
    burst(a ? a.x : P.x, 0.8, a ? a.z : P.z, target?.color ?? 0xffffff);
    if (m.target === st.id) { st.role = 'seeker'; sfx.lose(); toast("TAGGED - YOU'RE A SEEKER NOW", '#ff4d5e'); }
    else if (m.by === st.id) { sfx.found(); toast(`TAGGED ${nameOf(m.target).toUpperCase()}`, '#ffb44d'); }
    else sfx.found();
  },
  noise(m) {
    if (st.view !== 'play') return;
    if (m.k === 'sprint') sfx.step(0.35, m, 450); else sfx.step(0.6, m, 200);
  },
  end(m) {
    const mine = m.players.find((p) => p.id === st.id);
    const won = (m.winner === 'seekers') === (mine?.role === 'seeker');
    (won ? sfx.win : sfx.lose)();
    $('resTitle').textContent = m.winner === 'seekers' ? 'SEEKERS WIN' : 'HIDERS WIN';
    $('resTitle').style.color = won ? '#80ed99' : '#ff4d5e';
    $('resSub').textContent = m.winner === 'seekers' ? 'Every hider was tagged.' : 'Time ran out with hiders still free.';
    const tbl = $('resTable'); tbl.textContent = '';
    const row = (cells, tag = 'td', color) => {
      const tr = tbl.insertRow();
      cells.forEach((v, i) => { const c = document.createElement(tag); c.textContent = v; if (i === 0 && color) c.style.color = color; tr.append(c); });
    };
    row(['PLAYER', 'ROLE', 'ROUND', 'TOTAL'], 'th');
    for (const p of m.players) row([p.name + (p.id === st.id ? ' (you)' : ''), p.role === 'seeker' ? 'seeker' : 'hider', `+${p.score}`, p.total], 'td', hex(p.color));
    setView('results');
  },
};
function onMsg(m) { if (Object.hasOwn(handlers, m.t)) handlers[m.t](m); }

// ----- lobby
function renderLobby() {
  $('lobCode').textContent = st.code;
  const params = new URLSearchParams(location.search), srv = params.get('server');
  $('lobLink').value = `${location.origin}${location.pathname}?room=${st.code}${srv ? `&server=${encodeURIComponent(srv)}` : ''}`;
  const ul = $('lobList'); ul.textContent = '';
  for (const p of st.players) {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = hex(p.color);
    const nm = document.createElement('span'); nm.textContent = p.name;
    li.append(dot, nm);
    for (const [on, t] of [[p.id === st.hostId, 'HOST'], [p.id === st.id, 'YOU']]) if (on) { const s = document.createElement('span'); s.className = 'tagx'; s.textContent = t; li.append(s); }
    ul.append(li);
  }
  const host = st.id === st.hostId, enough = st.players.length >= 2;
  $('lobStart').classList.toggle('hidden', !host);
  $('lobStart').disabled = !enough;
  $('lobHint').textContent = host ? (enough ? `${st.players.length}/8 players. Start when ready.` : 'Waiting for at least one more player...') : 'Waiting for the host to start...';
}

// ----- HUD / in-round update (called by game.js every frame while G.mode === 'online' and playing)
function feed(text, color) {
  const f = $('feed'), d = document.createElement('div');
  d.textContent = text; if (color) d.style.color = color;
  f.append(d); while (f.children.length > 5) f.firstChild.remove();
  setTimeout(() => d.remove(), 6000);
}

const _fwd = new THREE.Vector3();
function tagTarget() {
  if (st.phase !== 'seek' || st.role !== 'seeker') return null;
  camera.getWorldDirection(_fwd);
  const { x: ex, y: ey, z: ez } = camera.position;
  let best = null, bd = 0.87;
  for (const a of R.remotes.values()) {
    if (a.seeker) continue;
    for (const k of [0.9, 1.35]) {
      const yy = a.y + k * (1 - 0.35 * a.c), dx = a.x - ex, dy = yy - ey, dz = a.z - ez, d = Math.hypot(dx, dy, dz);
      if (d > TAG_RANGE) continue;
      const dot = (dx * _fwd.x + dy * _fwd.y + dz * _fwd.z) / d;
      if (dot > bd && losClear(ex, ey, ez, a.x, yy, a.z)) { bd = dot; best = a; }
    }
  }
  return best;
}

hooks.tag = () => {
  const a = tagTarget();
  if (!a || st.tagCd > 0) return;
  st.tagCd = 0.4;
  st.net?.send('tag', { target: a.id });
};
let lastNoise = 0;
hooks.noise = (x, z, r) => {
  if (G.mode !== 'online' || st.view !== 'play' || r < 8 || now() - lastNoise < 0.25) return;
  lastNoise = now();
  st.net?.send('noise', { k: r >= 14 ? 'sprint' : 'land' });
};
hooks.update = (dt) => {
  const t = now(), left = Math.max(0, st.deadline - t), hide = st.phase === 'hide', seeker = st.role === 'seeker';
  const frozen = hide && seeker;
  st.tagCd -= dt;
  updatePlayer(dt, !frozen);
  R.updateRemotes(t, st.role === 'seeker');
  st.sendT -= dt;
  if (st.sendT <= 0 && !frozen) {
    st.sendT = 1 / 15;
    const r = (v) => Math.round(v * 100) / 100;
    st.net?.send('pos', { x: r(P.x), y: r(P.y), z: r(P.z), yaw: r(P.yaw), pitch: r(P.pitch), c: r(P.crouch) });
  }
  // HUD
  setText('modeLabel', `${seeker ? 'SEEKER' : 'HIDER'} - ${hide ? 'HIDING TIME' : 'SEEK'}`);
  $('modeLabel').style.color = seeker ? '#ff4d5e' : '';
  setText('timer', fmt(left)); $('timer').classList.toggle('low', !hide && left <= 15);
  setText('found', `HIDERS LEFT ${st.hidersLeft}`);
  const n = Math.ceil(left);
  if (frozen && n !== st.lastCount) {
    st.lastCount = n;
    const b = $('bigcount'); b.textContent = n; b.classList.remove('tick'); void b.offsetWidth; b.classList.add('tick');
    if (n > 0) sfx.tick(n <= 3);
  }
  const locked = document.pointerLockElement === canvas;
  setText('banner', !locked ? 'CLICK TO LOOK AROUND' : hide && !seeker ? `HIDE! SEEKERS ARE RELEASED IN ${n}` : '');
  const tgt = tagTarget();
  $('crosshair').classList.toggle('hot', !!tgt); $('prompt').classList.toggle('show', !!tgt);
};

// ----- wiring
$('btnOnline').onclick = openMenu;
$('olBack').onclick = () => { leave(false); };
$('olCreate').onclick = () => submit('create');
$('olJoin').onclick = () => submit('join');
$('olName').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit($('olCreateRow').classList.contains('hidden') || $('olCode').value ? 'join' : 'create'); });
$('olCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
$('olCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit('join'); });
$('lobStart').onclick = () => { initAudio(); st.net?.send('start'); };
$('lobLeave').onclick = () => leave(true);
$('lobCopy').onclick = async () => {
  const b = $('lobCopy'), inp = $('lobLink');
  try { await navigator.clipboard.writeText(inp.value); b.textContent = 'Copied!'; } catch { inp.select(); b.textContent = 'Press Ctrl+C'; }
  setTimeout(() => { b.textContent = 'Copy link'; }, 1800);
};
$('resLobby').onclick = () => { setView('lobby'); renderLobby(); };
$('btnLeave').addEventListener('mousedown', (e) => e.stopPropagation());
$('btnLeave').onclick = () => leave(true);
$('connMenu').onclick = () => leave(false);
$('connRetry').onclick = () => {
  const { name, code } = st.retry || {};
  if (!name || !code) return leave(false);
  setView('menu'); $('olName').value = name; $('olCode').value = code; msg('Reconnecting...');
  open(() => st.net.send('join', { name, code }));
};

// invite link: skip the title and go straight to the name prompt
if (/^[A-Za-z]{4}$/.test(new URLSearchParams(location.search).get('room') || '')) openMenu();
