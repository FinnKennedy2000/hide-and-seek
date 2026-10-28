// Trial-mode numbers the client and the server must agree on (docs/TRIAL-PROTOCOL.md). Pure: no THREE, no DOM.
export const ALERT_TTL = 6;        // s a beacon lives (relic, gate, trap alerts and the `exposed` toast)
export const BOOST_S = 2;          // s of x1.25 speed after being hurt / freed
export const TRAP_HOLD_S = 2.5;    // s a sprung bear trap holds a hider
export const RUSH_S = 1.6;         // charger rush
export const RECOVER_S = 1;        // slow recovery after the rush
export const SWING_HIT_CD = 1.0, SWING_MISS_CD = 1.6;
export const SPRINT_SPEED = 5.5;   // m/s: above this a hider is loud (marks, no grass concealment)
export const CROUCH_MAX_SPEED = 3; // m/s: crouch-walk is 2.0 (motion.js); a `c` flag sent while moving faster than this is not believed
// Grass concealment: distance (m) inside which the seeker sees a hider anyway
export const CONCEAL_R = { still: 2.5, crouchWalk: 4, standing: 9 };
export const STILL_SPEED = 1;      // m/s: below this a crouched hider counts as still
export const CROUCHED = 0.6;       // `c` above this counts as crouched

// grass rect {x0,x1,z0,z1}: finite numbers, x0 < x1, z0 < z1
export const validRect = (g) => !!g && [g.x0, g.x1, g.z0, g.z1].every(Number.isFinite) && g.x0 < g.x1 && g.z0 < g.z1;
// vault {x,z,ax,w?,h?,sill?}: finite x / z, ax 'x'|'z'|0|1 when given (anything else is read as z by the client), optional numbers finite
export const validVault = (v) => !!v && Number.isFinite(v.x) && Number.isFinite(v.z) && (v.ax == null || ['x', 'z', 0, 1].includes(v.ax)) && ['w', 'h', 'sill'].every((k) => v[k] == null || Number.isFinite(v[k]));
// keep the well-formed entries of a list; `bad(entry, i)` is called for each dropped one
export const keepValid = (list, ok, bad) => (Array.isArray(list) ? list : []).filter((q, i) => ok(q) || (bad?.(q, i), false));

// wrap a hook so a throw is console.error'd instead of swallowed; after `max` throws that hook is switched off (a per-frame hook must not flood the console)
export const guarded = (label, max = 5) => (fn) => {
  let n = 0;
  return (...a) => {
    if (n >= max) return undefined;
    try { return fn(...a); } catch (e) { n++; console.error(`[${label}] hook threw (${n}/${max}${n >= max ? ', disabled until reload' : ''}):`, e); return undefined; }
  };
};
