import { colliders } from '../world/build.js';
import { createNav } from '../shared/nav.js';

// Client-side wrapper over the shared nav (src/shared/nav.js, also used by the server bots) bound to the current map's colliders.
export const SPOTS = []; // AI hiding spots of the current map (refilled in place by setSpots)
// built on first use: world/build.js imports this module, so `colliders` is not initialised yet while this module evaluates.
// (colliders is refilled in place by setWorld, so the nav built from it stays valid.)
let _nav = null;
const nav = () => (_nav ||= createNav(colliders));
export const buildNav = () => nav().buildNav();
export const findPath = (...a) => nav().findPath(...a);
export const follow = (...a) => nav().follow(...a);
export const losClear = (...a) => nav().losClear(...a);
// AI hiding spots of the map, minus any the nav grid cannot reach from the seeker start (sealed pockets):
// findPath would otherwise send a hider straight through the wall.
export function setSpots(map) {
  const reach = nav().reachableFrom(map.meta.seekerStart.x, map.meta.seekerStart.z);
  // (house spots are hand-tuned and some sit in pockets the grid calls sealed, so they are kept as they always were)
  const list = map.spots.filter((s) => { if (map.meta.trusted) return true; return reach(s.x, s.z); }).map((s) => ({ ...s, owner: null }));
  SPOTS.length = 0; SPOTS.push(...list);
  if (SPOTS.length < map.spots.length) console.warn(`${map.meta.id}: ${map.spots.length - SPOTS.length} hiding spots unreachable, skipped`);
  for (const s of SPOTS) for (const c of colliders) {
    if (s.x > c.x0 - 0.2 && s.x < c.x1 + 0.2 && s.z > c.z0 - 0.2 && s.z < c.z1 + 0.2 && c.y0 < 0.4 && c.y1 > 0.4) console.warn('hiding spot overlaps collider', s.name ?? `${s.kind} ${s.x},${s.z}`);
  }
}
