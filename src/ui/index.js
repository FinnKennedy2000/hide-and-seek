// UI facade. Stub for the UI workstream: loading() is a no-op until it lands.
import { toast, show } from './hud.js';

export const ui = {
  toast,                          // (msg, color)
  showScreen: show,               // (elementId, on)
  loading(on, pct, label) {},     // loading overlay
};
