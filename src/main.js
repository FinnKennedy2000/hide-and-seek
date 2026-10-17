// Entry point: loads every module, builds the first map, and registers the frame systems.
import * as THREE from 'three';
import { G, hooks } from './core/state.js';
import { addSystem, start } from './core/loop.js';
import { renderer, scene, camera, composer } from './render/renderer.js';
import { updateFx } from './render/fx.js';
import { setWorld, updateFlicker } from './world/build.js';
import { updateCues, toast } from './ui/hud.js';
import { update as updateSingle } from './modes/singleplayer.js';
import { hiders } from './ai/hiders.js';
import './ui/menus.js';
import './net/online.js';
import './audio/index.js'; // bus listeners + audio system

setWorld('house'); // initial map; the title screen / online rounds switch it

// game: menu orbit camera, or the active mode's per-frame update (online replaces it via hooks.update)
let lastErrToast = 0;
addSystem({
  name: 'game', order: 20,
  update(dt) {
    if (G.phase === 'menu' || G.phase === 'end') {
      G.orbit += dt * 0.08;
      camera.position.set(Math.cos(G.orbit) * 30, 8 + Math.sin(G.orbit * 2), Math.sin(G.orbit) * 30);
      camera.lookAt(0, 2.5, 0); camera.fov = 60; camera.updateProjectionMatrix();
      if (G.phase === 'end') { for (const h of hiders) if (!h.found) h.mesh.visible = true; }
    } else if (!G.paused) {
      try { (G.mode === 'online' ? hooks.update : updateSingle)(dt); } catch (e) {
        console.error('update error', e);
        const t = performance.now(); if (t - lastErrToast > 5000) { lastErrToast = t; toast('Something went wrong', '#ff4d5e'); }
      }
    }
    hooks.tick?.(dt);
  },
});
addSystem({ name: 'anim', order: 40, update(dt) { updateFlicker(dt); updateCues(dt); updateFx(dt); } });
addSystem({ name: 'render', order: 100, update() { composer.render(); } });
start();

window.__hs = { THREE, renderer, scene, camera, composer, G }; // debugging + tests/smoke.spec.js (draw-call counts)
