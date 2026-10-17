// Performance helpers. Stub for the perf workstream: every function returns its input unchanged until it lands.
export const perf = {
  lod(obj, levels) { return obj; },       // levels: [{ distance, object }]
  instanceStatic(g) { return g; },        // group -> same group with repeated meshes instanced
  mergeByMaterial(g) { return g; },
  budget: { potato: { calls: 120, tris: 250000 }, low: { calls: 120, tris: 250000 }, maxCalls: 300 }, // see plan Global Constraints
};
