// Markdown tables for the performance study from docs/perf-study/pan-*.json.
import { readFileSync } from 'node:fs';
import console from 'node:console';
const q = (a, x) => { const s = a.slice().sort((p, r) => p - r); return s[Math.floor((s.length - 1) * x)] ?? 0; };
const targets = ['chromium', 'firefox', 'electron'], Ns = [500000, 1000000, 2560000];
const cfgs = ['idle', 'elev', 'elev+ov', 'styled', 'styled+labels', 'styled+labels+ov', 'ring-elev', 'ring-styled+labels'];
const runs = {};
for (const t of targets) for (const n of Ns) runs[`${t}-${n}`] = JSON.parse(readFileSync(`docs/perf-study/pan-${t}-${n}.json`, 'utf8'));
console.log('Frame gaps (max ms, number of gaps over 25 ms) per configuration');
console.log(['browser', 'cells', ...cfgs].join(' | '));
for (const t of targets) for (const n of Ns) {
  const r = runs[`${t}-${n}`];
  console.log([t, n.toLocaleString('en'), ...cfgs.map((c) => { const f = r.configs[c].frames, g = f.slice(1).map((x, i) => x - f[i]).slice(2); return `${Math.max(...g).toFixed(0)} (${g.filter((x) => x > 25).length})`; })].join(' | '));
}
console.log('\nGaps over 16.7 ms (missed a 60 Hz frame) in a 540-move run, same order');
for (const t of targets) for (const n of Ns) {
  const r = runs[`${t}-${n}`];
  console.log([t, n.toLocaleString('en'), ...cfgs.map((c) => { const f = r.configs[c].frames, g = f.slice(1).map((x, i) => x - f[i]).slice(2); return String(g.filter((x) => x > 16.7).length); })].join(' | '));
}
console.log('\nLabel re-plan (the 140 ms timer: plan + SVG write), ms: n, median, max; SVG write median');
for (const t of targets) for (const n of Ns) {
  const r = runs[`${t}-${n}`];
  const row = ['styled+labels', 'styled+labels+ov'].map((c) => { const d = r.configs[c], tm = d.timers.filter((x) => x.delay === 140).map((x) => x.spanMs); return tm.length ? `${tm.length}, ${q(tm, 0.5).toFixed(1)}, ${Math.max(...tm).toFixed(1)}; svg ${d.svg.length ? q(d.svg.map((x) => x.ms), 0.5).toFixed(1) : '-'}` : 'none'; });
  console.log([t, n.toLocaleString('en'), ...row].join(' | '));
}
console.log('\nGeneration time (s) in the app and canvas: ', Ns.map((n) => targets.map((t) => `${t} ${n}: ${(runs[`${t}-${n}`].generate.totalMs / 1000).toFixed(1)}`).join(', ')).join('\n'));
