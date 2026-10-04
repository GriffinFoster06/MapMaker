// Determinism probe (ARCHITECTURE §3.5, Q3): runs the shell's own deterministic outputs and hashes them. The same
// code runs in Node and in browser workers; CI compares the hashes with golden.json on every engine and OS.
// Phase 3 covers shell outputs only; Phase 4a adds orogen arrays to the same probe.
import { Alea, OrogenLcg, RngService, Sfc32, SphereMesh, bytesOf, dmath, hashArrays, loadWorld, saveWorld, sha256, hashWorld, type TypedArray } from '@mapmaker/core';
import { dummyHistoryStage, registerDummyHistoryLayers, runPipeline } from '@mapmaker/engine';
import { Timeline, World } from '@mapmaker/core';

export const PROBE_VERSION = 1;

export interface ProbeResult {
  version: number;
  hashes: Record<string, string>;
  /** Raw arrays, kept only when requested, for element-wise diffs of mismatched keys. */
  arrays?: Record<string, TypedArray>;
}

const SWEEP_N = 65536;

/** Inputs use only + - * / on small integers, which are identical on every engine. */
const T = (i: number) => i / SWEEP_N;
const U = (i: number) => ((i * 7919) % SWEEP_N) / SWEEP_N;

const SWEEPS: Record<string, (i: number) => number> = {
  sin: (i) => dmath.sin((T(i) - 0.5) * 400),
  cos: (i) => dmath.cos((T(i) - 0.5) * 400),
  tan: (i) => dmath.tan((T(i) - 0.5) * 400),
  asin: (i) => dmath.asin((T(i) * 2 - 1) * 0.9999),
  acos: (i) => dmath.acos((T(i) * 2 - 1) * 0.9999),
  atan: (i) => dmath.atan((T(i) - 0.5) * 2000),
  atan2: (i) => dmath.atan2((T(i) - 0.5) * 20, (U(i) - 0.5) * 20),
  sinh: (i) => dmath.sinh((T(i) - 0.5) * 40),
  cosh: (i) => dmath.cosh((T(i) - 0.5) * 40),
  tanh: (i) => dmath.tanh((T(i) - 0.5) * 40),
  asinh: (i) => dmath.asinh((T(i) - 0.5) * 2000),
  acosh: (i) => dmath.acosh(1 + T(i) * 1000),
  atanh: (i) => dmath.atanh((T(i) * 2 - 1) * 0.9999),
  exp: (i) => dmath.exp((T(i) - 0.5) * 1400),
  expm1: (i) => dmath.expm1((T(i) - 0.5) * 80),
  log: (i) => dmath.log(1e-6 + T(i) * 1000),
  log2: (i) => dmath.log2(1e-6 + T(i) * 1000),
  log10: (i) => dmath.log10(1e-6 + T(i) * 1000),
  log1p: (i) => dmath.log1p(T(i) * 100 - 0.9),
  pow: (i) => dmath.pow(0.001 + T(i) * 20, (U(i) - 0.5) * 20),
  cbrt: (i) => dmath.cbrt((T(i) - 0.5) * 1e6),
  hypot: (i) => dmath.hypot((T(i) - 0.5) * 100, (U(i) - 0.5) * 100),
  sqrt: (i) => dmath.sqrt(T(i) * 1000),
};

function dmathArrays(): Record<string, Float64Array> {
  const out: Record<string, Float64Array> = {};
  for (const [name, f] of Object.entries(SWEEPS)) {
    const a = new Float64Array(SWEEP_N);
    for (let i = 0; i < SWEEP_N; i++) a[i] = f(i);
    out[`dmath.${name}`] = a;
  }
  return out;
}

function meshArrays(): Record<string, TypedArray> {
  const out: Record<string, TypedArray> = {};
  for (const [N, prec] of [[20000, 'f32'], [20000, 'f64'], [200000, 'f32']] as const) {
    const rng = new OrogenLcg('mesh', 12345);
    const m = SphereMesh.build({ N, jitter: 0.75, rng: () => rng.next(), precision: prec });
    const p = `mesh.${N}.${prec}`;
    out[`${p}.points`] = m.points;
    out[`${p}.triangles`] = m.triangles;
    out[`${p}.adjList`] = m.adjList;
    out[`${p}.area`] = m.cellArea_sr;
    if (N === 20000) out[`${p}.circ`] = m.circumcentres;
  }
  return out;
}

function rngArrays(): Record<string, TypedArray> {
  const n = 100_000;
  const out: Record<string, TypedArray> = {};
  const fill = (name: string, next: () => number) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = next(); out[name] = a; };
  const s = new Sfc32('x', 1, 2, 3, 4); fill('rng.sfc32', () => s.next());
  const a = new Alea('x', 'probe'); fill('rng.alea', () => a.next());
  const o = new OrogenLcg('x', 777); fill('rng.orogen-lcg', () => o.next());
  const svc = new RngService('00112233445566778899aabbccddeeff');
  const d = svc.stream('derived'); fill('rng.derived', () => d.next());
  const c = svc.counter('probe'); const u = new Uint32Array(n); for (let i = 0; i < n; i++) u[i] = c(i, i * 3, 7); out['rng.counter'] = u;
  return out;
}

async function historyHashes(): Promise<Record<string, string>> {
  const w = new World({
    params: { masterSeed: '00112233445566778899aabbccddeeff', ticks: 40, keyframeEvery: 8 },
    manifest: { appVersion: '0.0.0', created: '2026-10-03T00:00:00.000Z', modified: '2026-10-03T00:00:00.000Z', stageVersions: {} },
    timeline: new Timeline({ epoch: 'AD', yearLengthDays: 365, monthLengthsDays: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 35] }, [{ fromTick: 0, dtYears: 10 }, { fromTick: 12, dtYears: 1 }], { tStartMyr: -300, dtMyr: 5, keyframeEveryMyr: 50 }),
  });
  const rng = new OrogenLcg('mesh', 9);
  w.addMesh({ id: 'global', mesh: SphereMesh.build({ N: 3000, jitter: 0.75, rng: () => rng.next(), precision: 'f32' }) });
  registerDummyHistoryLayers(w);
  await runPipeline(w, [dummyHistoryStage]);
  const bytes = await saveWorld(w, { engine: 'probe', now: new Date(0) });
  const { manifest, world } = await loadWorld(bytes);
  const out: Record<string, string> = { 'history.world': await hashWorld(world) };
  for (const c of manifest.chunks) out[`history.chunk.${c.path}`] = c.sha256;
  return out;
}

export async function runProbe(opts: { keepArrays?: boolean } = {}): Promise<ProbeResult> {
  const arrays: Record<string, TypedArray> = { ...dmathArrays(), ...meshArrays(), ...rngArrays() };
  const hashes = await hashArrays(arrays);
  Object.assign(hashes, await historyHashes());
  hashes['probe.version'] = await sha256(bytesOf(new Uint32Array([PROBE_VERSION])));
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(hashes).sort()) sorted[k] = hashes[k]!;
  return { version: PROBE_VERSION, hashes: sorted, ...(opts.keepArrays ? { arrays } : {}) };
}
