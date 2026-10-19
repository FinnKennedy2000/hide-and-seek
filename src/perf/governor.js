// Frame-time governor: the single owner of automatic render-scale and tier changes. Pure (no DOM/THREE): feed it frame ms.
//  - 1 s window. Average > 18 ms: scale -0.1 (floor 0.5). Average < 13 ms for 5 s straight: scale +0.1 (up to the tier's scale).
//  - Tier changes are rarer: down after 3 windows still > 18 ms at the scale floor, up after 15 s < 13 ms at full scale,
//    never more than one per 8 s, and a step up that is immediately undone raises a ceiling for 60 s so it never thrashes.
import { TIERS, budget } from './budget.js';

export const GOV = { windowMs: 1000, hiMs: 18, loMs: 13, upAfterMs: 5000, floor: 0.5, step: 0.1, tierDownWindows: 3, tierUpMs: 15000, tierCooldownMs: 8000, upTrialMs: 120000, ceilingMs: 60000 };
const r2 = (x) => Math.round(x * 100) / 100;

export class Governor {
  constructor({ tier = 'med', onScale = () => {}, onTier = () => {}, minTier = 'potato', maxTier = 'high' } = {}) {
    Object.assign(this, { tier, onScale, onTier, minTier, maxTier });
    this.t = 0; this.sum = 0; this.n = 0; this.win = 0;
    this.scale = budget.of(tier).scale;
    this.good = 0; this.atMaxGood = 0; this.floorBad = 0;
    this.lastTier = -Infinity; this.lastTierUp = -Infinity; this.lastUp = -Infinity; this.ceiling = Infinity; this.ceilingUntil = 0;
    this.enabled = true;
  }
  get maxScale() { const m = budget.of(this.tier).scale; return this.t < this.ceilingUntil ? Math.min(m, this.ceiling) : m; }
  setScale(s) { s = r2(s); if (s !== this.scale) { this.scale = s; this.onScale(s); } }
  setTier(tier, resetScale = true) { // external or governor-driven
    if (tier === this.tier) return;
    const dir = TIERS.indexOf(tier) - TIERS.indexOf(this.tier);
    if (dir < 0 && this.t - this.lastTierUp < GOV.upTrialMs) this.maxTier = tier; // the tier we just stepped up into could not hold: never try it again this session
    if (dir > 0) this.lastTierUp = this.t;
    this.tier = tier; this.lastTier = this.t; this.good = this.atMaxGood = this.floorBad = 0; this.sum = this.n = this.win = 0;
    this.onTier(tier);
    if (resetScale) this.setScale(budget.of(tier).scale);
  }
  frame(ms) { // call once per frame with the frame's cost in ms
    this.t += ms;
    if (!this.enabled) return;
    this.sum += ms; this.n++; this.win += ms;
    if (this.win < GOV.windowMs) return;
    const avg = this.sum / this.n, w = this.win;
    this.sum = this.n = this.win = 0;
    this.evaluate(avg, w);
  }
  evaluate(avg, w) {
    const i = TIERS.indexOf(this.tier);
    if (avg > GOV.hiMs) {
      this.good = this.atMaxGood = 0;
      if (this.scale > GOV.floor + 1e-6) {
        if (this.t - this.lastUp < GOV.ceilingMs / 6) { this.ceiling = r2(this.scale - GOV.step); this.ceilingUntil = this.t + GOV.ceilingMs; } // we stepped up and it failed
        this.setScale(Math.max(GOV.floor, this.scale - GOV.step)); this.floorBad = 0;
      } else if (++this.floorBad >= GOV.tierDownWindows && i > TIERS.indexOf(this.minTier) && this.t - this.lastTier >= GOV.tierCooldownMs) {
        this.setTier(TIERS[i - 1]);
      }
    } else if (avg < GOV.loMs) {
      this.floorBad = 0; this.good += w;
      if (this.scale >= this.maxScale - 1e-6) {
        this.atMaxGood += w;
        if (this.atMaxGood >= GOV.tierUpMs && i < TIERS.indexOf(this.maxTier) && this.t - this.lastTier >= GOV.tierCooldownMs) { this.setTier(TIERS[i + 1]); this.lastUp = this.t; }
      } else if (this.good >= GOV.upAfterMs) {
        this.good = 0; this.lastUp = this.t; this.setScale(Math.min(this.maxScale, this.scale + GOV.step));
      }
    } else { this.good = this.atMaxGood = this.floorBad = 0; } // 13..18 ms: hold
  }
}
