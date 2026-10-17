// Asset loader. loadGroup resolves a Map key -> asset, and NEVER rejects: a failed entry becomes null and emits 'assetFail' so the
// caller can fall back (procedural character, flat material, silence) instead of hanging on a loading bar.
// type: 'gltf' (GLTFLoader -> gltf), 'ktx2' (KTX2Loader -> texture; transcoder in /basis/), 'audio' (-> AudioBuffer), 'hdr' (RGBELoader -> texture).
import { bus, EV } from './bus.js';

const loaders = {
  async gltf(url) { const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js'); return new GLTFLoader().loadAsync(url); },
  async hdr(url) { const { RGBELoader } = await import('three/addons/loaders/RGBELoader.js'); return new RGBELoader().loadAsync(url); },
  async ktx2(url) {
    const [{ KTX2Loader }, { renderer }] = await Promise.all([import('three/addons/loaders/KTX2Loader.js'), import('../render/renderer.js')]);
    return new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer).loadAsync(url);
  },
  async audio(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new OfflineAudioContext(1, 1, 44100).decodeAudioData(await res.arrayBuffer());
  },
};

export async function loadGroup(name, entries, onProgress) {
  const out = new Map();
  let done = 0;
  await Promise.all(entries.map(async ({ key, url, type }) => {
    try {
      if (!Object.hasOwn(loaders, type)) throw new Error(`unknown asset type ${type}`);
      out.set(key, await loaders[type](url));
    } catch (error) {
      out.set(key, null);
      console.warn(`asset ${name}/${key} failed`, error);
      bus.emit(EV.ASSET_FAIL, { group: name, key, url, error });
    }
    onProgress?.(++done, entries.length);
  }));
  return out;
}
