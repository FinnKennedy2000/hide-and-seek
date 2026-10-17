import * as THREE from 'three';
import { $ } from '../core/util.js';

// renderer / scene / camera. The post pipeline (src/render/post.js) is built by render/index.js and handed over via setComposer.
export const canvas = $('c');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
export const PR = Math.min(window.devicePixelRatio || 1, 1.5);
export const view = { pr: PR, scale: 1 }; // pixel-ratio cap of the current preset, and the governor's resolution scale
renderer.setPixelRatio(PR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // tone mapping (ACES) happens in the post pipeline: render targets are never tone-mapped by three
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false; // render/index.js resets once per frame: the post pipeline renders several passes per frame

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 600);
camera.rotation.order = 'YXZ';
scene.add(camera); // so first-person viewmodels can be parented to it

export let composer = null; // live binding, replaced when the quality preset or the GL context changes
export function setComposer(c) { composer = c; resize(); }
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(view.pr * view.scale);
  if (composer) composer.setSize(w, h, false); else renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
