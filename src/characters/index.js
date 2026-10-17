// Character API: glTF rig characters with the procedural ones as fallback (see char.js). Importing this starts the model download.
import { bus, EV } from '../core/bus.js';
import { camera } from '../render/renderer.js';
import { ui } from '../ui/index.js';
import { loadRig, rigStatus, lod } from './rig.js';
import * as chars from './char.js';
export * from './char.js';

lod.camera = camera;
const warn = () => ui.toast('Character models failed to load, using simple ones', '#ffb84d');
bus.on(EV.ASSET_FAIL, (e) => { if (e.group === 'characters') warn(); });
bus.on(EV.ROUND, () => { if (rigStatus() === 'failed') warn(); }); // the toast is easy to miss at page load, so say it again when a round starts
loadRig();
if (typeof window !== 'undefined') window.__chars = { ...chars, rigStatus }; // tests/chars.spec.js
