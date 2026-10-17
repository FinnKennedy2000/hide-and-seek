// Snapshot: every map's prop names, collider count and a hash of the full colliders+props must not change (fixtures/worlds.json
// was captured from the pre-Vite public/worlddata.js). Regenerate the fixture only when a map is changed on purpose.
const { createHash } = require('node:crypto');
const path = require('node:path');
const snap = require('../fixtures/worlds.json');
let fail = 0;
const ok = (c, n) => { if (!c) fail++; console.log((c ? 'PASS ' : 'FAIL ') + n); };
(async () => {
  const { buildWorld, MAPS } = await import('../../src/shared/worlddata.js');
  ok(JSON.stringify(Object.keys(MAPS)) === JSON.stringify(Object.keys(snap)) || Object.keys(snap).every((k) => k in MAPS), 'registry holds every snapshotted map');
  for (const id of Object.keys(snap)) {
    const w = buildWorld(undefined, id), s = snap[id];
    ok(w.colliders.length === s.colliders, `${id}: ${s.colliders} colliders`);
    ok(JSON.stringify(w.props.map((p) => p.name)) === JSON.stringify(s.props), `${id}: ${s.props.length} prop names in order`);
    ok(createHash('sha256').update(JSON.stringify(w)).digest('hex') === s.sha, `${id}: colliders and props byte-identical`);
  }
  process.exit(fail ? 1 : 0);
})();
