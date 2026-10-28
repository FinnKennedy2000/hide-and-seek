import * as THREE from 'three';
import { loadGroup } from '../core/assets.js';
import { tier } from './textures.js';

// GLB props placed by b.model(name, x, z, o) (shared/worlddata.js). Each GLB is loaded once (cached for the page), and every placement of a
// model becomes one InstancedMesh per sub-mesh (shared material, geometry baked to the model's own origin). setWorld stays synchronous:
// instances appear when the file arrives, a missing file only logs + emits assetFail (core/assets.js) and the model is simply absent.
const URL = (n) => `/models/props/${n}.glb`;
const loaded = new Map(); // name -> Promise<[{geo, mat}] | null>
const BIG = 1.2;          // models at least this big (after scale) cast sun shadows
export const preloadModels = (names) => Promise.all([...new Set(names)].map(ensure));

function ensure(name) {
  let p = loaded.get(name);
  if (!p) {
    p = loadGroup('models', [{ key: name, url: URL(name), type: 'gltf' }]).then((m) => {
      const gltf = m.get(name);
      if (!gltf) return null;
      gltf.scene.updateMatrixWorld(true);
      const parts = [];
      gltf.scene.traverse((o) => { if (o.isMesh) { const g = o.geometry.clone().applyMatrix4(o.matrixWorld); g.morphAttributes = {}; parts.push({ geo: g, mat: o.material }); } }); // static props: drop morph targets (an InstancedMesh left with morphAttributes but no morphTargetInfluences makes three throw every frame)
      return parts;
    });
    loaded.set(name, p);
  }
  return p;
}

// One layer per built map. place() is called while the map builds, start() once it is done; dispose() before the world group is torn down.
// `onMesh(mesh)` lets the caller register the mesh (lite-material swap).
export function modelLayer(world, onMesh) {
  const placements = new Map(); let dead = false;
  const small = tier() === 'potato' || tier() === 'low';
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _z = new THREE.Vector3();
  return {
    place(name, x, z, o = {}) {
      if (o.deco && small) return;
      (placements.get(name) ?? placements.set(name, []).get(name)).push({ x, z, o });
    },
    start() {
      for (const [name, list] of placements) ensure(name).then((parts) => {
        if (dead || !parts) return;
        for (const { geo, mat } of parts) {
          geo.computeBoundingBox();
          const im = new THREE.InstancedMesh(geo.clone(), mat, list.length), sz = geo.boundingBox.getSize(_z);
          let big = false;
          list.forEach(({ x, z, o }, i) => {
            const sc = o.s ?? 1;
            big ||= Math.max(sz.x, sz.y, sz.z) * sc >= BIG;
            _m.compose(_p.set(x, o.y0 ?? 0, z), _q.setFromEuler(_e.set(0, o.ry ?? 0, 0)), _s.set(sc, sc, sc));
            im.setMatrixAt(i, _m);
          });
          im.castShadow = big; im.receiveShadow = true; im.matrixAutoUpdate = false;
          im.computeBoundingSphere();
          im.userData.hi = mat; onMesh?.(im);
          world.add(im);
        }
      });
    },
    dispose() { dead = true; placements.clear(); },
  };
}
