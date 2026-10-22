// Summarises the pan runs written by perf-pan.mjs: frame-gap statistics per configuration and, for every frame gap over
// 25 ms, which instrumented work overlapped it (docs/checkpoints/PERFORMANCE_STUDY.md).
// Usage: node scripts/perf-analyze.mjs docs/perf-study/pan-*.json  [--spikes]
import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const files = process.argv.slice(2).filter((a) => a.endsWith('.json'));
const showSpikes = process.argv.includes('--spikes');
const q = (a, x) => { const s = a.slice().sort((p, r) => p - r); return s[Math.floor((s.length - 1) * x)] ?? 0; };
const ov = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

for (const f of files) {
  const o = JSON.parse(readFileSync(f, 'utf8'));
  console.log(`\n### ${o.target} ${o.N.toLocaleString('en')} cells  (${o.env?.renderer ?? '?'}, generate ${(o.generate?.totalMs / 1000).toFixed(1)} s)`);
  console.log('config | frames | gap p50 | p95 | p99 | max | >16.7 | >25 | >50 | >100 | draws | longtask | loaf');
  for (const [name, d] of Object.entries(o.configs)) {
    const fr = d.frames, gaps = fr.slice(1).map((t, i) => t - fr[i]).slice(2);
    const c = (th) => gaps.filter((g) => g > th).length;
    console.log(`${name} | ${fr.length} | ${q(gaps, 0.5).toFixed(1)} | ${q(gaps, 0.95).toFixed(1)} | ${q(gaps, 0.99).toFixed(1)} | ${Math.max(...gaps).toFixed(1)} | ${c(16.7)} | ${c(25)} | ${c(50)} | ${c(100)} | ${d.cnt?.draws ?? '-'} | ${d.long.length} | ${d.loaf.length}`);
  }
  console.log('\nspike attribution (frame gaps over 25 ms): config: n spikes -> overlapping work (ms of overlap summed over spikes)');
  for (const [name, d] of Object.entries(o.configs)) {
    const fr = d.frames, spikes = [];
    for (let i = 3; i < fr.length; i++) if (fr[i] - fr[i - 1] > 25) spikes.push({ a: fr[i - 1], b: fr[i] });
    if (!spikes.length) continue;
    const tot = { labelReplan: 0, timerOther: 0, engineMsg: 0, glUpload: 0, glDraw: 0, rafCb: 0, svgWrite: 0, unexplained: 0 };
    const rows = [];
    for (const s of spikes) {
      const row = { at: +((s.a - d.t0) / 1000).toFixed(2), gap: +(s.b - s.a).toFixed(1) };
      let seen = 0;
      for (const t of d.timers) { const m = ov(s.a, s.b, t.t, t.t + t.spanMs); if (m > 0) { const k = t.delay === 140 ? 'labelReplan' : 'timerOther'; tot[k] += m; row[k] = +((row[k] ?? 0) + t.spanMs).toFixed(1); seen += m; } }
      for (const m of d.msgs) { const x = ov(s.a, s.b, m.t, m.t + m.spanMs); if (x > 0) { tot.engineMsg += x; row.engineMsg = +((row.engineMsg ?? 0) + m.spanMs).toFixed(1); row.msgType = m.type; seen += x; } }
      for (const g of d.gl) { const x = ov(s.a, s.b, g.t, g.t + g.ms); if (x > 0) { const k = g.fn === 'drawElements' ? 'glDraw' : 'glUpload'; tot[k] += x; row[k] = +((row[k] ?? 0) + g.ms).toFixed(1); seen += x; } }
      for (const r of d.raf) { const x = ov(s.a, s.b, r.t, r.t + r.ms); if (x > 0) { tot.rafCb += x; row.rafCb = +((row.rafCb ?? 0) + r.ms).toFixed(1); seen += x; } }
      for (const w of d.svg) { const x = ov(s.a, s.b, w.t, w.t + w.ms); if (x > 0) { tot.svgWrite += x; row.svgWrite = +((row.svgWrite ?? 0) + w.ms).toFixed(1); seen += x; } }
      tot.unexplained += Math.max(0, s.b - s.a - seen);
      rows.push(row);
    }
    console.log(`${name}: ${spikes.length} spikes (max ${Math.max(...spikes.map((s) => s.b - s.a)).toFixed(0)} ms) -> ${Object.entries(tot).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}`);
    if (showSpikes) for (const r of rows) console.log('   ', JSON.stringify(r));
  }
}
