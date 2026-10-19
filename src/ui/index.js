// UI facade + boot. ui.toast(text, tone), ui.showScreen(name), ui.loading(progress, label), ui.preload(group, entries).
// Imports the stylesheet and fonts, wires settings -> document (reduced motion, colour-blind palette), and registers the per-frame UI system.
import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/atkinson-hyperlegible-next/wght.css';
import '../styles/ui.css';
import { $ } from '../core/util.js';
import { settings } from '../core/settings.js';
import { bus, EV } from '../core/bus.js';
import { addSystem } from '../core/loop.js';
import { toast, show, updateCues, updatePerfHud, syncRole } from './hud.js';
import { loading, preload } from './loading.js';
import { initNav, syncConfirm } from './nav.js';
import { initSettingsScreen, openSettings, closeSettings } from './settings-screen.js';
import { updateOnboarding } from './onboarding.js';
import { updatePodium } from './podium.js';

// screen name -> element id. showScreen('title') shows that screen and hides the other full-screen panels (the HUD is left alone).
const SCREENS = { title: 'title', settings: 'settings', online: 'olMenu', lobby: 'olLobby', results: 'olResults', conn: 'olConn', end: 'end' };
export const ui = {
  toast,
  showScreen(name, on = true) {
    if (name === 'loading') return on ? loading(0, 'Loading') : loading(null);
    const id = SCREENS[name] ?? name; // raw element ids still work for older callers
    if (!on) return show(id, false);
    for (const s of Object.values(SCREENS)) show(s, s === id);
  },
  loading,
  preload,
  openSettings, closeSettings,
};

const root = document.documentElement;
const applyLook = () => { root.dataset.motion = settings.reducedMotion ? 'reduced' : 'full'; if (settings.colorBlind) root.dataset.cb = '1'; else delete root.dataset.cb; };
bus.on(EV.SETTINGS, ({ key, value }) => {
  if (key === 'reducedMotion' || key === 'colorBlind') applyLook();
});
applyLook();

initSettingsScreen();
initNav();
// UI per-frame work: text / transform only, no layout reads. Order 45 = after anim (40), before the render pass.
addSystem({ name: 'ui', order: 45, update(dt) { updateCues(dt); updatePerfHud(dt); syncRole(); updateOnboarding(); updatePodium(dt); syncConfirm(); } });
window.__hsUi = Object.assign(ui, { bus }); // tests (tests/ui.spec.js) drive loading / results through this; main.js owns window.__hs
