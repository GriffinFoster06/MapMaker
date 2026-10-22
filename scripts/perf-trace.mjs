// What the renderer main thread did during each frame gap over 25 ms of a pan run, from the Chromium trace written by
// perf-pan.mjs --trace (docs/checkpoints/PERFORMANCE_STUDY.md). Also totals the GC pauses of the whole run.
// Usage: node scripts/perf-trace.mjs <pan.json> <config> [gapMs=25]
import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const [panFile, config, gapArg] = process.argv.slice(2);
const gapMs = Number(gapArg ?? 25);
const pan = JSON.parse(readFileSync(panFile, 'utf8'));
const d = pan.configs[config];
const tr = JSON.parse(readFileSync(d.traceFile, 'utf8'));
const ev = tr.traceEvents ?? tr;
const mark = ev.find((e) => e.name === 'pm-marker');
if (!mark) { console.log('no pm-marker in the trace'); process.exit(1); }
const off = mark.ts - d.marker * 1000; // trace µs = performance.now() ms * 1000 + off
const main = ev.filter((e) => e.pid === mark.pid && e.tid === mark.tid && e.ph === 'X' && e.dur !== undefined);
const gcName = (n) => /GC|Scaveng/i.test(n) && !/GCCallback|GC_.*(Epilogue|Prologue)/.test(n);
const SKIP = new Set(['ThreadControllerImpl::RunTask', 'ThreadControllerImpl::DoWork', 'RunTask', 'ProxyMain::BeginMainFrame', 'AnimationFrame', 'SendBeginMainFrame', 'PipelineReporter']);
const label = (e) => e.name === 'FunctionCall' || e.name === 'v8.callFunction' ? `Call:${e.args?.data?.functionName || '(anon)'}${e.args?.data?.url ? '@' + String(e.args.data.url).split('/').pop() : ''}:${e.args?.data?.lineNumber ?? ''}` : e.name;

function exclusive(w0, w1) {
  const inWin = main.filter((e) => e.ts < w1 && e.ts + e.dur > w0).map((e) => ({ s: Math.max(e.ts, w0), e: Math.min(e.ts + e.dur, w1), n: label(e), raw: e.name })).sort((a, b) => a.s - b.s || b.e - a.e);
  const stack = [], acc = new Map();
  const add = (n, us) => acc.set(n, (acc.get(n) ?? 0) + us);
  for (const x of inWin) {
    while (stack.length && stack.at(-1).e <= x.s) stack.pop();
    if (stack.length) { const p = stack.at(-1); p.child += x.e - x.s; }
    x.child = 0; stack.push(x);
    x.self = () => x.e - x.s - x.child;
    x.done = true;
  }
  for (const x of inWin) if (!SKIP.has(x.raw)) add(x.n, x.e - x.s - x.child);
  return [...acc.entries()].filter(([, v]) => v > 300).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}`);
}

const gcs = main.filter((e) => gcName(e.name) && e.dur > 100);
const major = gcs.filter((e) => /Major|MarkCompact|FinalizeMC|IncrementalMarking/.test(e.name));
console.log(`${pan.target} ${pan.N} ${config}: GC events on the main thread ${gcs.length}, total ${(gcs.reduce((s, e) => s + e.dur, 0) / 1000).toFixed(1)} ms, longest ${(Math.max(0, ...gcs.map((e) => e.dur)) / 1000).toFixed(1)} ms; major-type ${major.length} (${(major.reduce((s, e) => s + e.dur, 0) / 1000).toFixed(1)} ms)`);
const byName = new Map();
for (const e of gcs) byName.set(e.name, [(byName.get(e.name)?.[0] ?? 0) + 1, (byName.get(e.name)?.[1] ?? 0) + e.dur]);
console.log('  GC by name:', [...byName.entries()].sort((a, b) => b[1][1] - a[1][1]).slice(0, 6).map(([k, [c, u]]) => `${k} x${c} ${(u / 1000).toFixed(1)}ms`).join(', '));
const fr = d.frames;
let n = 0;
for (let i = 3; i < fr.length; i++) {
  const g = fr[i] - fr[i - 1];
  if (g <= gapMs) continue;
  n++;
  console.log(`  gap ${g.toFixed(1)} ms at +${((fr[i - 1] - d.t0) / 1000).toFixed(2)} s: ${exclusive(fr[i - 1] * 1000 + off, fr[i] * 1000 + off).join(' | ')}`);
}
if (!n) console.log(`  no frame gap over ${gapMs} ms`);
