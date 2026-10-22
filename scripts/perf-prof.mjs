// Function-level view of the main-thread CPU profile written by perf-pan.mjs --prof: what ran during each frame gap over
// 25 ms, and the longest stretches of one task. The profile is aligned to performance.now() by the __marker__ call.
// Usage: node scripts/perf-prof.mjs <pan.json> <config> [gapMs=25]
import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const [panFile, config, gapArg] = process.argv.slice(2);
const gapMs = Number(gapArg ?? 25);
const pan = JSON.parse(readFileSync(panFile, 'utf8'));
const d = pan.configs[config];
const p = JSON.parse(readFileSync(d.profileFile, 'utf8'));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const ts = []; let t = p.startTime;
for (let i = 0; i < p.samples.length; i++) { t += p.timeDeltas[i]; ts.push(t); }
const fname = (n) => `${n.callFrame.functionName || '(anon)'}@${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
// align: first sample whose stack contains __marker__
let mk = -1;
for (let i = 0; i < p.samples.length && mk < 0; i++) { let id = p.samples[i]; while (id !== undefined) { if (byId.get(id).callFrame.functionName === '__marker__') { mk = i; break; } id = parent.get(id); } }
if (mk < 0) { console.log('marker not found in profile'); process.exit(1); }
const off = ts[mk] - d.marker * 1000; // profile µs = performance.now() ms * 1000 + off
function window(w0, w1, top = 10) {
  const self = new Map(), incl = new Map();
  for (let i = 0; i < p.samples.length; i++) {
    if (ts[i] < w0 || ts[i] > w1) continue;
    const dt = p.timeDeltas[i + 1] ?? p.timeDeltas[i];
    let id = p.samples[i]; const leaf = fname(byId.get(id)); self.set(leaf, (self.get(leaf) ?? 0) + dt);
    const seen = new Set();
    while (id !== undefined) { const k = fname(byId.get(id)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + dt); } id = parent.get(id); }
  }
  const fmt = (m, n) => [...m.entries()].filter(([k]) => !/\(idle\)|\(program\)|\(root\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`);
  return { self: fmt(self, top), incl: fmt(incl, top) };
}
const fr = d.frames;
let any = false;
for (let i = 3; i < fr.length; i++) {
  const g = fr[i] - fr[i - 1];
  if (g <= gapMs) continue;
  any = true;
  const w = window(fr[i - 1] * 1000 + off, fr[i] * 1000 + off, 8);
  console.log(`gap ${g.toFixed(1)} ms at +${((fr[i - 1] - d.t0) / 1000).toFixed(2)} s\n  inclusive: ${w.incl.join(' | ')}\n  self: ${w.self.join(' | ')}`);
}
if (!any) console.log(`no frame gap over ${gapMs} ms; whole-run profile:`);
const all = window(d.t0 * 1000 + off, d.frames.at(-1) * 1000 + off, 14);
console.log(`whole run inclusive: ${all.incl.join(' | ')}\nwhole run self: ${all.self.join(' | ')}`);
