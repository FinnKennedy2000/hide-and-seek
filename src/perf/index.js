// Performance facade. Everything the other workstreams call lives here; the runtime (tiering, governor, HUD) is in runtime.js.
//   perf.budget                        per-preset caps (budget.cur = active tier): calls, tris, scale, lights, fogCull, particles, decals, voices, charLod
//   perf.mergeByMaterial(group)        static meshes -> one mesh per material            perf.instanceStatic(group, {min})  repeated geometry -> InstancedMesh
//   perf.lod(near, [{dist, obj}])      THREE.LOD                                         perf.every(hz, fn)                 fixed-rate tick helper
//   perf.governor / perf.tier / perf.stats()   filled in by runtime.js once the renderer exists
import { budget } from './budget.js';
import { mergeByMaterial, instanceStatic, lod, every } from './helpers.js';

export const perf = {
  budget, mergeByMaterial, instanceStatic, lod, every,
  governor: null, tier: 'med',
  stats: () => ({ calls: 0, tris: 0, fps: 0, ms: 0 }),
};
