import * as THREE from 'three';
import { rnd } from '../core/util.js';
import { scene } from '../render/renderer.js';
import { render } from '../render/index.js';
import { camera } from '../render/renderer.js';
import { addSystem } from '../core/loop.js';

// ----- sky, sun, ambient (persistent; setWorld retunes them per map)
const SUN0 = new THREE.Vector3(-30, 11, -22).normalize(), sunDir = SUN0.clone(); // per-map override: meta.sun.dir
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { horizon: { value: new THREE.Color(0x6b4f6e) }, sun: { value: sunDir }, night: { value: 0 }, day: { value: 0 }, dayMid: { value: new THREE.Color() }, dayTop: { value: new THREE.Color() } },
  vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `varying vec3 vP; uniform vec3 horizon; uniform vec3 sun; uniform float night; uniform float day; uniform vec3 dayMid; uniform vec3 dayTop;
    void main(){ float h=max(vP.y,0.);
      vec3 mid=mix(mix(vec3(.20,.10,.28), vec3(.025,.035,.07), night), dayMid, day), top=mix(mix(vec3(.015,.02,.07), vec3(.008,.011,.03), night), dayTop, day);
      vec3 c=mix(horizon, mid, smoothstep(0.,.22,h)); c=mix(c, top, smoothstep(.15,.85,h));
      float s=max(dot(normalize(vP),sun),0.);
      c+=(vec3(1.,.45,.15)*pow(s,10.)*.55+vec3(1.,.7,.35)*pow(s,120.)*1.2)*(1.-night)*(1.-day*.8);
      gl_FragColor=vec4(c,1.); }`,
});
{
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);
  const sp = new Float32Array(900);
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.asin(rnd(0.12, 1));
    sp.set([Math.cos(a) * Math.cos(e) * 400, Math.sin(e) * 400, Math.sin(a) * Math.cos(e) * 400], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
}
const sun = new THREE.DirectionalLight(0xff9a62, 1.9); // the only shadow caster; hidden (no shadow pass at all) on night maps
sun.position.copy(sunDir).multiplyScalar(45);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 5, far: 110 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
scene.add(sun); scene.add(sun.target);
// meta.sun.follow (maps bigger than the fixed +-38 m sun shadow box): the 'sun' shadow (med preset) re-centres on the camera in 4 m steps.
// CSM (high / ultra) already follows the camera. 4 m snaps keep the shadow texels from swimming while walking.
let follow = false;
addSystem({ name: 'sun-follow', order: 95, update() {
  if (!follow) return;
  const cx = Math.round(camera.position.x / 4) * 4, cz = Math.round(camera.position.z / 4) * 4;
  if (sun.target.position.x === cx && sun.target.position.z === cz) return;
  sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();
  sun.position.copy(sunDir).multiplyScalar(45).add(sun.target.position);
} });
const hemi = new THREE.HemisphereLight(0x7a68b0, 0x2a2030, 0.62);
scene.add(hemi);

export function applyEnv(m) {
  const f = m.fog;
  scene.fog = f.density ? new THREE.FogExp2(f.color, f.density) : new THREE.Fog(f.color, f.near, f.far);
  skyMat.uniforms.horizon.value.set(f.color);
  skyMat.uniforms.night.value = m.sky === 'night' ? 1 : 0;
  skyMat.uniforms.day.value = m.skyTint ? 1 : 0; if (m.skyTint) { skyMat.uniforms.dayMid.value.set(m.skyTint.mid); skyMat.uniforms.dayTop.value.set(m.skyTint.top); } // optional overcast sky (Coldwood estate)
  sun.visible = m.sky !== 'night';
  sun.color.set(m.sun?.color ?? 0xff9a62); sun.intensity = m.sun?.intensity ?? 1.9; // optional per-map override (Coldwood: cooler, dimmer)
  if (m.sun?.dir) sunDir.set(...m.sun.dir).normalize(); else sunDir.copy(SUN0);
  follow = !!m.sun?.follow; sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(); sun.position.copy(sunDir).multiplyScalar(45);
  hemi.color.set(m.ambient.color); hemi.groundColor.set(m.ambient.ground ?? m.ambient.color); if (m.ambient.ground == null) hemi.groundColor.multiplyScalar(0.5);
  hemi.intensity = m.ambient.intensity;
  render.setMap(m);
}
