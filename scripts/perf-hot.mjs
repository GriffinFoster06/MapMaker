// Hot functions of a pipeline CPU profile (node --cpu-prof): self time top list and inclusive time of named functions.
// Usage: node scripts/perf-hot.mjs <profile dir> <out.json>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
const dir = process.argv[2];
const f = readdirSync(dir).filter((x) => x.endsWith('.001.cpuprofile'))[0];
const p = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n])), parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const nm = (n) => n.callFrame.functionName || '(anon)';
const loc = (n) => `${nm(n)} ${n.callFrame.url.replace(/.*MapMaker\//, '').replace(/.*node_modules\//, '')}`;
const self = new Map(), incl = new Map(), callers = new Map();
let total = 0;
for (let i = 0; i < p.samples.length; i++) {
  const dt = p.timeDeltas[i]; total += dt;
  let id = p.samples[i]; const leaf = byId.get(id); self.set(loc(leaf), (self.get(loc(leaf)) ?? 0) + dt);
  const seen = new Set(); let first = true;
  const chain = [];
  while (id !== undefined) { const n = byId.get(id), k = nm(n); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + dt); } if (nm(leaf) === 'noise3D' && !first && k !== 'noise3D' && k !== 'fbm' && chain.length < 1) chain.push(k); first = false; id = parent.get(id); }
  if (nm(leaf) === 'noise3D') callers.set(chain[0] ?? '?', (callers.get(chain[0] ?? '?') ?? 0) + dt);
}
const ms = (v) => Math.round(v / 1000);
const NAMED = ['runReferencePass', 'runElevationDetail', 'computeTectonics', 'assignElevation', 'runPostProcessing', 'runClimateDetail', 'runDrainageDetail', 'erodeComposite', 'priorityFloodCarve', 'warpTerrain', 'projectCoarsePlates', 'computeSpatialFields', 'assignDistanceField', 'propagateStress', 'applyCoastalDetail', 'applyTectonicBandNoise', 'applyDetailNoise', 'applyUniformLandNoise', 'fbm', 'noise3D', 'Delaunator', 'SphereMesh', 'buildTopology', 'MultiLevel', 'correct', 'applyPlatePhysics', '(garbage collector)'];
const out = { totalMs: ms(total), selfTop: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => ({ fn: k, ms: ms(v), pct: +(100 * v / total).toFixed(1) })), inclusiveMs: Object.fromEntries(NAMED.map((k) => [k, ms(incl.get(k) ?? 0)])), noiseCallers: Object.fromEntries([...callers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, ms(v)])) };
if (process.argv[3]) writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.inclusiveMs), JSON.stringify(out.noiseCallers));
