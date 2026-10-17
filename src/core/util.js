// Small helpers shared by every module.
export const $ = (id) => document.getElementById(id);
export const rnd = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const turnTo = (cur, target, rate) => {
  const d = ((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return cur + clamp(d, -rate, rate);
};
export const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; };
export const cache = {};
export const setText = (id, v) => { if (cache[id] !== v) { cache[id] = v; $(id).textContent = v; } };
