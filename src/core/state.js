// Global mutable game state shared by the player controller, AI, single-player flow, HUD and online code.
// extension points used by online.js (set after load): update, tick, tag, fire, key, wheel, noise, leave, inRoom
export const hooks = {};

export const SEEK_COUNT = 10, SEEK_TIME = 120, HIDE_COUNT = 20, HIDE_TIME = 90, N_HIDERS = 5;
export const HIDER_COLORS = [0xff5a5f, 0x4cc9f0, 0xffd166, 0x80ed99, 0xc77dff];

// mul: speed multiplier (disguised = 0.6); mute: no footstep sound/noise; fixedPh: collision height override (disguise)
export const P = { x: 0, y: 0, z: 12, vy: 0, vx: 0, vz: 0, yaw: 0, pitch: 0, crouch: 0, bob: 0, step: 0, air: false, r: 0.3, ph: 1.7, eyeY: 1.6, dist: 0, mul: 1, mute: false, fixedPh: 0 };
export const G = { mode: 'seek', phase: 'menu', paused: false, t: 0, cd: 0, found: 0, lastCd: -1, stats: {}, orbit: 0 };
export const inGame = () => G.phase === 'countdown' || G.phase === 'play';

// debug hooks (window.__P etc.) only in dev builds or with ?debug=1, never in a normal production session
export const DEBUG = !!(import.meta.env?.DEV || (typeof location !== 'undefined' && /[?&]debug=1/.test(location.search)));
