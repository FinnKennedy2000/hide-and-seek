// Collision backends for motion.js. Both expose move(s, dx, dy, dz) -> grounded, mutating s.x/y/z (s.y = feet).
// rapierBackend: Rapier KinematicCharacterController over the same `colliders` boxes the server uses.
// aabbBackend: the original push-out controller, used when the Rapier WASM fails to load.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MAX_STEP = 0.3, SLOPE = (40 * Math.PI) / 180;

export function rapierBackend(RAPIER, colliders) {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  world.createCollider(RAPIER.ColliderDesc.cuboid(500, 1, 500).setTranslation(0, -1, 0)); // floor, top at y = 0
  for (const c of colliders) {
    const hx = (c.x1 - c.x0) / 2, hy = (c.y1 - c.y0) / 2, hz = (c.z1 - c.z0) / 2;
    if (hx <= 0 || hy <= 0 || hz <= 0) continue;
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(c.x0 + hx, c.y0 + hy, c.z0 + hz));
  }
  world.step(); // builds the broad phase so scene queries see the static boxes
  const kcc = world.createCharacterController(0.01);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.enableAutostep(MAX_STEP, 0.2, false) // min step width 0.2: smaller makes the capsule's round foot refuse a 0.25 m stair;
  kcc.enableSnapToGround(0.15);
  kcc.setMaxSlopeClimbAngle(SLOPE); kcc.setMinSlopeSlideAngle(SLOPE + 0.1);
  kcc.setSlideEnabled(true);
  let col = null, r = 0, h = 0, hh = 0;
  return {
    name: 'rapier',
    move(s, dx, dy, dz) {
      if (!col || r !== s.r || h !== s.ph) { // radius / height changed (crouch, disguise): rebuild the capsule
        if (col) world.removeCollider(col, false);
        r = s.r; h = s.ph;
        hh = Math.max(0.01, (h - 2 * r) / 2); // capsule: a flat-bottomed cylinder snags on the floor seam
        col = world.createCollider(RAPIER.ColliderDesc.capsule(hh, r));
      }
      col.setTranslation({ x: s.x, y: s.y + hh + r, z: s.z });
      kcc.computeColliderMovement(col, { x: dx, y: dy, z: dz });
      const m = kcc.computedMovement();
      s.x += m.x; s.y += m.y; s.z += m.z;
      return kcc.computedGrounded();
    },
    dispose() { kcc.free?.(); world.free(); },
  };
}

export function aabbBackend(colliders) {
  function resolve(s) {
    for (let it = 0; it < 2; it++) for (const c of colliders) {
      if (s.y >= c.y1 - 0.05 || s.y + s.ph <= c.y0) continue;
      const cx = clamp(s.x, c.x0, c.x1), cz = clamp(s.z, c.z0, c.z1);
      const dx = s.x - cx, dz = s.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= s.r * s.r) continue;
      if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (s.r - d) / d; s.x += dx * k; s.z += dz * k; }
      else {
        const l = s.x - c.x0, rr = c.x1 - s.x, t = s.z - c.z0, b = c.z1 - s.z, m = Math.min(l, rr, t, b);
        if (m === l) s.x = c.x0 - s.r; else if (m === rr) s.x = c.x1 + s.r; else if (m === t) s.z = c.z0 - s.r; else s.z = c.z1 + s.r;
      }
    }
  }
  return {
    name: 'aabb',
    move(s, dx, dy, dz) {
      s.x += dx; s.z += dz;
      let ground = 0;
      for (const co of colliders) {
        if (co.y1 > s.y + MAX_STEP || co.y1 > 1.2) continue;
        const ex = s.x - clamp(s.x, co.x0, co.x1), ez = s.z - clamp(s.z, co.z0, co.z1);
        if (ex * ex + ez * ez < (s.r + 0.02) ** 2) ground = Math.max(ground, co.y1);
      }
      s.y += dy;
      let grounded = false;
      if (s.y <= ground) { s.y = ground; grounded = true; }
      resolve(s);
      return grounded;
    },
    dispose() {},
  };
}
