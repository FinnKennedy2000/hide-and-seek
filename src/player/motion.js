// Player kinematics, free of DOM / THREE so it runs in Node tests. step() advances state `s` (the shared P object) by dt.
// Acceleration + friction curves, coyote time, jump buffering, stamina sprint, crouch-slide. Collision comes from a backend.
const lerp = (a, b, t) => a + (b - a) * t;
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));

export const TUNE = {
  walk: 3.9, sprint: 6.8, crouch: 2.0, accel: 45, friction: 70, airAccel: 9, grav: 22, jump: 6.3, coyote: 0.1, buffer: 0.12,
  slideSpeed: 7.6, slideTime: 0.75, slideCd: 0.6, // slide peaks at 7.6 m/s: under the server's 9 m/s anti-teleport limit
  drain: 0.2, regen: 0.18, regenDelay: 0.7, exhaustBelow: 0, resumeAt: 0.25, // stamina is 0..1: 5 s of sprint
};

const ev = { jumped: false, landed: 0, slid: false, sprinting: false, sliding: false }; // reused every step: read it before the next step()

export function createMotion(backend, bounds) {
  const m = { coyote: 0, buffer: 0, slideT: 0, slideCd: 0, slideDx: 0, slideDz: 0, regenT: 0, exhausted: false, prevCrouch: false, prevJump: false, wasAir: false };
  return {
    backend,
    reset() { Object.assign(m, { coyote: 0, buffer: 0, slideT: 0, slideCd: 0, regenT: 0, exhausted: false, prevCrouch: false, prevJump: false, wasAir: false }); },
    // inp: {ix, iz, sprint, crouch, jump, can}; returns {jumped, landed (impact speed or 0), slid, sprinting, sliding}
    step(s, inp, dt) {
      const T = TUNE;
      ev.jumped = false; ev.landed = 0; ev.slid = false; ev.sprinting = false; ev.sliding = false;
      const can = inp.can, crouchEdge = can && inp.crouch && !m.prevCrouch, jumpEdge = can && inp.jump && !m.prevJump;
      m.prevCrouch = !!(can && inp.crouch); m.prevJump = !!(can && inp.jump);
      m.slideCd -= dt; m.slideT -= dt;
      const ix = can ? inp.ix : 0, iz = can ? inp.iz : 0, len = Math.hypot(ix, iz), moving = len > 0;
      const sp0 = Math.hypot(s.vx, s.vz);
      // stamina-limited sprint
      if (s.stamina === undefined) s.stamina = 1;
      if (m.exhausted && s.stamina >= T.resumeAt) m.exhausted = false;
      const sprintKey = can && inp.sprint && moving && !m.exhausted, wantSprint = sprintKey && !inp.crouch;
      if (wantSprint && s.stamina > 0 && !s.airborne) { s.stamina = Math.max(0, s.stamina - T.drain * dt); m.regenT = T.regenDelay; if (s.stamina <= 0) m.exhausted = true; }
      else if ((m.regenT -= dt) <= 0) s.stamina = Math.min(1, s.stamina + T.regen * dt);
      const sprint = wantSprint && !m.exhausted;
      // crouch-slide: C pressed while sprinting fast on the ground
      if (crouchEdge && sprintKey && sp0 > 5 && !s.airborne && m.slideCd <= 0) {
        m.slideT = T.slideTime; m.slideCd = T.slideTime + T.slideCd; ev.slid = true;
        const k = Math.min(T.slideSpeed, sp0 * 1.12) / sp0; s.vx *= k; s.vz *= k;
      }
      const sliding = m.slideT > 0 && !s.airborne && Math.hypot(s.vx, s.vz) > 2.4 && !jumpEdge;
      if (!sliding) m.slideT = Math.min(m.slideT, 0);
      ev.sprinting = sprint; ev.sliding = sliding;
      let crouching = can && inp.crouch || sliding;
      if (!crouching && s.crouch > 0.05 && !s.fixedPh && !backend.canStand(s)) crouching = true; // no headroom: stay crouched
      s.crouch = lerp(s.crouch, crouching ? 1 : 0, Math.min(1, dt * 10));
      s.ph = s.fixedPh || lerp(1.7, 1.0, s.crouch); s.eyeY = lerp(1.6, 0.85, s.crouch);
      // horizontal: accelerate toward the wish velocity, friction when there is none (or when over the cap)
      const speed = (crouching ? T.crouch : sprint ? T.sprint : T.walk) * s.mul;
      const sn = Math.sin(s.yaw), cs = Math.cos(s.yaw), l = len || 1;
      let tx = ((ix * cs + iz * sn) / l) * speed, tz = ((-ix * sn + iz * cs) / l) * speed;
      if (sliding) { tx = 0; tz = 0; } // no steering; friction below is gentle
      const rate = (sliding ? 8 : s.airborne ? T.airAccel : moving ? T.accel : T.friction) * dt;
      const dx = tx - s.vx, dz = tz - s.vz, dl = Math.hypot(dx, dz);
      if (dl > rate) { s.vx += (dx / dl) * rate; s.vz += (dz / dl) * rate; } else { s.vx = tx; s.vz = tz; }
      // vertical: coyote time + jump buffer
      m.coyote = s.airborne ? m.coyote - dt : T.coyote;
      m.buffer = jumpEdge ? T.buffer : m.buffer - dt;
      if (m.buffer > 0 && m.coyote > 0 && s.crouch < 0.5 && can) { s.vy = T.jump; s.airborne = true; m.coyote = 0; m.buffer = 0; ev.jumped = true; }
      const preVy = s.vy;
      if (s.airborne) s.vy -= T.grav * dt; else s.vy = 0; // resting on the ground: no downward push (Rapier's slide would sink the capsule's round foot); snap-to-ground handles small drops
      const wasUp = s.vy > 0;
      const y0 = s.y;
      const grounded = backend.move(s, s.vx * dt, s.vy * dt, s.vz * dt);
      s.x = Math.min(bounds.x1, Math.max(bounds.x0, s.x)); s.z = Math.min(bounds.z1, Math.max(bounds.z0, s.z));
      if (grounded && s.vy <= 0) {
        if (m.wasAir && preVy < -3) ev.landed = -preVy;
        s.vy = 0; s.airborne = false;
      } else {
        if (wasUp && s.y - y0 < s.vy * dt * 0.5) s.vy = 0; // head bump
        s.airborne = true;
      }
      m.wasAir = s.airborne;
      s.sprint = sprint; s.air = s.airborne;
      return ev;
    },
  };
}
