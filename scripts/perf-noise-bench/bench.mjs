/* global performance, Buffer */
// JS (the real SimplexNoise port) against the native C port: time and bit-for-bit equality of fbm over N points.
// Usage: scripts/node24.sh npx tsx scripts/perf-noise-bench/bench.mjs [points=2000000] [octaves=5]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { SimplexNoise } from '../../packages/gen-orogen/src/port/simplex-noise';

const here = dirname(fileURLToPath(import.meta.url));
const n = Number(process.argv[2] ?? 2_000_000), oct = Number(process.argv[3] ?? 5);
const dir = mkdtempSync(join(tmpdir(), 'noise-'));
execFileSync('clang', ['-O2', '-ffp-contract=off', '-fno-fast-math', join(here, 'noise.c'), '-o', join(dir, 'noise')]);
const noise = new SimplexNoise(12345 + 77);
// points on the unit sphere times the usual base frequencies (a Fibonacci spiral, deterministic)
const pts = new Float64Array(3 * n);
for (let i = 0; i < n; i++) { const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = i * 2.399963229728653; pts[3 * i] = r * Math.cos(th) * 12.3 + 5.3; pts[3 * i + 1] = y * 12.3 + 1.7; pts[3 * i + 2] = r * Math.sin(th) * 12.3 + 3.1; }
writeFileSync(join(dir, 'perm.bin'), noise.perm); writeFileSync(join(dir, 'pts.f64'), Buffer.from(pts.buffer));
const js = new Float64Array(n);
const runJs = () => { const t = performance.now(); for (let i = 0; i < n; i++) js[i] = noise.fbm(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2], oct); return (performance.now() - t) / 1000; };
runJs(); // warm-up (JIT)
const jsS = Math.min(runJs(), runJs());
const nat = Math.min(...[0, 1, 2].map(() => Number(execFileSync(join(dir, 'noise'), [join(dir, 'perm.bin'), join(dir, 'pts.f64'), String(n), join(dir, 'out.f64'), String(oct)]).toString())));
const cOut = new Float64Array(readFileSync(join(dir, 'out.f64')).buffer.slice(0));
let diff = 0, maxAbs = 0;
for (let i = 0; i < n; i++) { if (Object.is(js[i], cOut[i]) === false) { diff++; maxAbs = Math.max(maxAbs, Math.abs(js[i] - cOut[i])); } }
console.log(JSON.stringify({ points: n, octaves: oct, noiseCalls: n * oct, jsSeconds: +jsS.toFixed(3), nativeSeconds: +nat.toFixed(3), speedup: +(jsS / nat).toFixed(2), jsNsPerNoise: +((jsS / (n * oct)) * 1e9).toFixed(1), nativeNsPerNoise: +((nat / (n * oct)) * 1e9).toFixed(1), bitDifferences: diff, maxAbsDiff: maxAbs }));
