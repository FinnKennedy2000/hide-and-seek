// Minimal stand-ins for the hitmarker and stamina bar. Agent U restyles these: they render from bus events only
// (EV.hitmarker {kill}, EV.stamina {value 0..1, exhausted, sprinting}), so replacing this file's DOM is all that's needed.
import { bus, EV } from '../core/bus.js';
import { sfx } from '../audio/sfx.js';

const mk = (id, css) => { const d = document.createElement('div'); d.id = id; d.style.cssText = css; document.body.appendChild(d); return d; };
const hm = mk('hitmarker', 'position:fixed;left:50%;top:50%;width:26px;height:26px;margin:-13px;pointer-events:none;opacity:0;transition:opacity .25s;z-index:5;' +
  'background:linear-gradient(45deg,transparent 45%,#fff 45% 55%,transparent 55%),linear-gradient(-45deg,transparent 45%,#fff 45% 55%,transparent 55%);filter:drop-shadow(0 0 3px #000)');
const bar = mk('staminaBar', 'position:fixed;left:50%;bottom:34px;width:160px;height:5px;margin-left:-80px;border-radius:3px;background:rgba(0,0,0,.45);pointer-events:none;opacity:0;transition:opacity .3s;z-index:5');
const fill = document.createElement('div'); fill.style.cssText = 'height:100%;border-radius:3px;background:#80ed99;width:100%'; bar.appendChild(fill);
let hmT = 0;
bus.on(EV.HITMARKER, (e) => {
  hm.style.filter = `drop-shadow(0 0 3px #000)${e?.kill ? ' hue-rotate(150deg) saturate(8)' : ''}`;
  hm.style.transition = 'none'; hm.style.opacity = '1'; clearTimeout(hmT); hmT = setTimeout(() => { hm.style.transition = 'opacity .25s'; hm.style.opacity = '0'; }, 60);
  (sfx.hitmark ?? (() => sfx.tick(true)))(); // the audio workstream can add sfx.hitmark; until then a short tick
});
bus.on(EV.STAMINA, (e) => {
  fill.style.width = `${Math.round(e.value * 100)}%`; fill.style.background = e.exhausted ? '#ff4d5e' : '#80ed99';
  bar.style.opacity = e.value >= 0.999 && !e.exhausted ? '0' : '1';
});
