import * as THREE from 'three';
import { grassShader } from './grassfield.js';
import { addSystem } from '../core/loop.js';
import { camera } from '../render/renderer.js';
import { DEBUG } from '../core/state.js';
import { render } from '../render/index.js';
import { batchStatic } from '../perf/helpers.js';

// A map drawn by one authored GLB (meta.glb; the Coldwood estate: public/models/map/coldwood_estate.glb, see scripts/estate/glb.mjs).
// Gameplay never depends on it: colliders, markers and grass rects come from the shared map module, so the server never loads this and a
// failed load leaves a playable (if bare) map. The parsed file is cached for the page; setWorld stays synchronous and the meshes appear
// when it lands, behind the loading overlay (ui/loading.js `preload`, the 'map' group).
// Per mesh, by what it is:
//   tall grass (CW_grass* materials)     never casts, never distance-culled, wind + hider near-fade shader (grassfield.js)
//   scenic forest / ground dressing      distance-culled at the preset's fogCull (outside the fence or knee-high: no gameplay cover)
//   terrain, buildings, roofs, vaults    block the third-person camera (solids, BVH); every material is the GLB's own (sRGB base colour,
//                                        linear normal maps, double-sided vegetation), nothing is re-tinted
// Instanced meshes (EXT_mesh_gpu_instancing) arrive as InstancedMeshes, one per district block, so frustum culling works per block.
const cache = new Map(); // url -> Promise<gltf | null>
const load = (url) => {
  if (!cache.has(url)) cache.set(url, import('../ui/loading.js').then((ui) => ui.preload('map', [{ key: 'map', url, type: 'gltf' }])).then((m) => m.get('map')));
  return cache.get(url);
};
const GRASS_MAT = /^CW_grass/, CULL = /^(Forest_Scenic|Ground_Dressing)/, SOLID = /^(Terrain_164m|Architecture_|Roofs_|Vaults_|Boundary_Fencing|Route_Screens)/;
const BATCH_AB = DEBUG && typeof location !== 'undefined' && /[?&]batchab=1/.test(location.search); // keep batched sources (hidden) for A/B (read at load: online play rewrites the URL)
const under = (o, re) => { for (let p = o; p; p = p.parent) if (re.test(p.name || '')) return true; return false; };

// dev only (?debug=1): window.__camHold(x, y, z, yaw, pitch) pins the render camera for repeatable views / perf samples; __camHold(null) releases
if (DEBUG && typeof window !== 'undefined') {
  let hold = null;
  addSystem({ name: 'cam-hold', order: 54, update: () => { if (hold) { camera.position.set(hold[0], hold[1], hold[2]); camera.rotation.set(hold[4], hold[3], 0, 'YXZ'); } } });
  window.__camHold = (x, y, z, yaw = 0, pitch = 0) => { hold = x == null ? null : [x, y, z, yaw, pitch]; };
}
// opts: { onMesh(mesh), solids: [], cull: [] (distance-culled list; mesh.userData.bx = [x0, z0, x1, z1]) } -> { stats, dispose() }
export function mapGlbLayer(world, url, opts = {}) {
  let dead = false, root = null, stopGrass = null;
  const stats = { meshes: 0, grass: 0, culled: 0, solids: 0, tris: 0, loaded: false };
  load(url).then(async (gltf) => {
    if (dead || !gltf) return;
    root = gltf.scene;
    const isGrass = (o) => [].concat(o.material).some((m) => GRASS_MAT.test(m.name || ''));
    root.userData.batched ??= batchStatic(root, (o) => isGrass(o) || under(o, CULL) || under(o, /^(Terrain|Water_)/), (o) => under(o, SOLID), BATCH_AB); // once per page (the gltf is cached)
    stats.batched = root.userData.batched;
    root.updateMatrixWorld(true);
    const sh = grassShader(), grass = [], box = new THREE.Box3();
    root.traverse((o) => {
      if (!o.isMesh || o.userData.grassDepth) return;
      o.userData.hi ||= o.material; o.material = o.userData.hi; // (a rebuilt map starts from the GLB material, not a previous preset's twin)
      const mats = [].concat(o.material), grassy = isGrass(o);
      stats.meshes++; stats.tris += ((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
      o.matrixAutoUpdate = false;
      if (o.isInstancedMesh) { o.computeBoundingSphere(); o.computeBoundingBox(); }
      if (grassy) { // gameplay cover: same at every preset
        o.castShadow = false; o.receiveShadow = true; o.userData.gameplayGrass = true;
        for (const m of mats) sh.apply(m);
        sh.prepass(o);
        grass.push(o); stats.grass++;
      } else if (under(o, /^(Terrain_164m|Water_)/)) { o.castShadow = false; o.receiveShadow = true; }
      else if (under(o, /^Ground_Dressing/)) { o.castShadow = false; o.receiveShadow = true; }
      else { o.castShadow = true; o.receiveShadow = true; }
      if (!grassy && under(o, CULL)) {
        box.copy(o.isInstancedMesh ? o.boundingBox : new THREE.Box3().setFromObject(o));
        o.userData.bx = [box.min.x, box.min.z, box.max.x, box.max.z]; o.userData.zone = -1;
        opts.cull?.push(o); stats.culled++;
      }
      if (o.userData.solid || under(o, SOLID)) { o.geometry.computeBoundsTree?.(); opts.solids?.push(o); stats.solids++; }
      opts.onMesh?.(o);
    });
    stopGrass = sh.drive(grass);
    await render.warm(root, () => grass.forEach((o) => sh.apply(o.material))); // compile every program the map needs (preset material, CSM, grass patch) before it is visible: no first-sight hitch
    if (dead) return;
    if (DEBUG) stats.grassState = () => ({ meshes: grass.length, inScene: grass.filter((o) => { for (let p = o; p; p = p.parent) if (p.isScene) return true; return false; }).length, visible: grass.filter((o) => o.visible).length, instances: grass.reduce((n, o) => n + o.count, 0), casting: grass.filter((o) => o.castShadow).length, mat: [...new Set(grass.map((o) => o.material.type))] });
    world.add(root);
    stats.loaded = true;
  }).catch((e) => { // the map is the only cover there is: whatever failed above, show what was loaded rather than nothing
    console.error('[mapglb] map build failed', e);
    if (root && !dead && !root.parent) { world.add(root); stats.loaded = true; }
  });
  return {
    stats,
    dispose() { // before build.js tears the world down: detach (so the cached geometry survives for the next visit)
      dead = true; stopGrass?.();
      if (root) { root.removeFromParent(); root.traverse((o) => { if (o.isMesh && !o.userData.grassDepth) { o.material = o.userData.hi; o.visible = true; o.geometry.disposeBoundsTree?.(); } }); }
    },
  };
}
