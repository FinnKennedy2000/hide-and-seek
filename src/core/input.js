import { canvas } from '../render/renderer.js';

export const keys = {};
export const releaseAll = () => { for (const k in keys) keys[k] = false; };
export function requestLock() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* headless / no gesture */ } }
