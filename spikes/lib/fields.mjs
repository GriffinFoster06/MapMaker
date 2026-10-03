// Shared between Node and browser: collect every typed array in an orogen
// 'done' result (top level + debugLayers) and hash it with SHA-256.

export const DEFAULTS = {
  // orogen index.html slider defaults (cc2662b), detail N set per run.
  jitter: 0.75, P: 80, numContinents: 4, nMag: 0.40, continentSizeVariety: 0.35,
  landCoverage: 0.3, terrainWarp: 0.75, smoothing: 0.10, glacialErosion: 0.50,
  hydraulicErosion: 0.50, thermalErosion: 0.10, ridgeSharpening: 0.50,
  temperatureOffset: 0, precipitationOffset: 0,
};

export function collectArrays(result) {
  const out = {};
  for (const [k, v] of Object.entries(result)) {
    if (ArrayBuffer.isView(v)) out[k] = v;
  }
  for (const [k, v] of Object.entries(result.debugLayers || {})) {
    if (ArrayBuffer.isView(v)) out['debug.' + k] = v;
  }
  return out;
}

const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

export async function hashArrays(arrays) {
  const out = {};
  for (const k of Object.keys(arrays).sort()) {
    const a = arrays[k];
    const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    out[k] = { type: a.constructor.name, n: a.length, sha256: hex(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 16) };
  }
  return out;
}
