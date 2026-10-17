// Tiny pub/sub. Event names are frozen: later workstreams add listeners, never rename.
//   sound {kind,x,y,z,vol,by}  shot {by,hit,x,y,z}  tagged {by,target}  disguise {id,propId}  round {mode,map,role}
//   phase {phase}  end {winner}  quality {level}  hitmarker {...}  ammo {...}  stamina {...}  cue {...}
//   net {...}  assetFail {group,key,url,error}  settings {key,value}
export const EV = Object.freeze({
  SOUND: 'sound', SHOT: 'shot', TAGGED: 'tagged', DISGUISE: 'disguise', ROUND: 'round', PHASE: 'phase', END: 'end', QUALITY: 'quality',
  HITMARKER: 'hitmarker', AMMO: 'ammo', STAMINA: 'stamina', CUE: 'cue', NET: 'net', ASSET_FAIL: 'assetFail', SETTINGS: 'settings',
});

const subs = new Map();
export const bus = {
  on(type, fn) { // -> off()
    let set = subs.get(type); if (!set) subs.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  },
  emit(type, payload) {
    const set = subs.get(type); if (!set) return;
    for (const fn of [...set]) { try { fn(payload); } catch (e) { console.error(`bus '${type}' listener failed`, e); } } // one bad listener never blocks the rest
  },
};
