/* global console */
// Markdown tables for "After the first fixes" in docs/checkpoints/PERFORMANCE_STUDY.md, from docs/perf-study/{before,after}/*.json
// (scripts/perf-fixes-run.sh and perf-fixes-flat.sh). Usage: node scripts/perf-fixes-summary.mjs
import { existsSync, readFileSync } from 'node:fs';
const load = (tag, name) => { const f = `docs/perf-study/${tag}/${name}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null; };
const q = (a, x) => { const s = a.slice().sort((p, r) => p - r); return s[Math.floor((s.length - 1) * x)] ?? 0; };
const gaps = (d) => d.frames.slice(1).map((t, i) => t - d.frames[i]).slice(2);
const fmt = (n, k = 1) => (Number.isFinite(n) ? n.toFixed(k) : '-');
const targets = ['chromium', 'firefox', 'electron'], Ns = [500000, 1000000, 2560000];
const name = (n) => (n >= 1e6 ? `${n / 1e6}M`.replace('1M', '1M') : `${n / 1000}k`);
const row = (...c) => `| ${c.join(' | ')} |`;

console.log('### Label re-plan: main-thread cost of one stretch of work (ms)\n');
console.log('Before: the whole re-plan is one task (the 140 ms timer: plan and SVG write); n, median, max. After: each slice (n, median, p95, max). Styled layer with labels, 540-move stop-and-go drag.\n');
console.log(row('browser', 'cells', 'before: re-plans, median, max', 'after: slices, median, p95, max', 'after: re-plans (slice 1 of each)'), '\n' + row('---', '---', '---', '---', '---'));
for (const t of targets) for (const n of Ns) {
  const b = load('before', `pan-${t}-${n}`), a = load('after', `pan-${t}-${n}`);
  const bt = b?.configs['styled+labels']?.timers.filter((x) => x.delay === 140).map((x) => x.spanMs) ?? [];
  const as = a?.configs['styled+labels']?.labelSlices ?? [];
  const at = a?.configs['styled+labels']?.timers.filter((x) => x.delay === 140).length ?? 0;
  console.log(row(t, name(n), bt.length ? `${bt.length}, ${fmt(q(bt, 0.5))}, ${fmt(Math.max(...bt))}` : '-', as.length ? `${as.length}, ${fmt(q(as, 0.5))}, ${fmt(q(as, 0.95))}, ${fmt(Math.max(...as))}` : '-', String(at)));
}

console.log('\n### Panning the zoomed-out globe: longest frame gap in ms (gaps over 25 ms), before -> after\n');
const cfgs = ['styled+labels', 'styled+labels+ov', 'elev', 'ring-elev', 'ring-styled+labels'];
console.log(row('browser', 'cells', ...cfgs), '\n' + row('---', '---', ...cfgs.map(() => '---')));
for (const t of targets) for (const n of Ns) {
  const b = load('before', `pan-${t}-${n}`), a = load('after', `pan-${t}-${n}`);
  const cell = (d, c) => { const x = d?.configs[c]; if (!x) return '-'; const g = gaps(x); return `${fmt(Math.max(...g), 0)} (${g.filter((v) => v > 25).length})`; };
  console.log(row(t, name(n), ...cfgs.map((c) => `${cell(b, c)} -> ${cell(a, c)}`)));
}

console.log('\n### Layer switches (elevation, styled, koppen): latency of `setLayer` (ms, median of 5; the worker now does the colouring, so latency can rise) and what the page felt: longest frame gap in ms (gaps over 25 ms), before -> after\n');
console.log(row('browser', 'cells', 'setLayer latency', 'longest frame gap (n over 25 ms)'), '\n' + row('---', '---', '---', '---'));
for (const t of targets) for (const n of Ns) {
  const lat = (d) => { const x = d?.configs['switch']; return x?.switches ? fmt(q(x.switches.map((s) => s.ms), 0.5), 0) : '-'; };
  const gap = (d) => { const x = d?.configs['switch']; if (!x) return '-'; const g = gaps(x); return `${fmt(Math.max(...g), 0)} (${g.filter((v) => v > 25).length})`; };
  const b = load('before', `pan-${t}-${n}`), a = load('after', `pan-${t}-${n}`);
  console.log(row(t, name(n), `${lat(b)} -> ${lat(a)}`, `${gap(b)} -> ${gap(a)}`));
}

console.log('\n### Render cost: GPU plus draw per frame, ms (median / p95), before -> after\n');
console.log(row('browser', 'cells', 'globe, zoomed out', 'flat, elevation shader', 'globe pixelSum'), '\n' + row('---', '---', '---', '---', '---'));
for (const t of ['chromium', 'electron', 'firefox']) for (const n of [1000000, 2560000]) {
  const b = load('before', `render-${t}-${n}`)?.variants.base, a = load('after', `render-${t}-${n}`)?.variants.base;
  const g = (v) => (v ? `${fmt(v.globe.out_frac1.total.median, 2)} / ${fmt(v.globe.out_frac1.total.p95, 2)}` : '-');
  const f = (v) => (v ? `${fmt(v.flat.elev.gpuDraw.median, 2)} / ${fmt(v.flat.elev.gpuDraw.p95, 2)}` : '-');
  console.log(row(t, name(n), `${g(b)} -> ${g(a)}`, `${f(b)} -> ${f(a)}`, `${b?.globe.pixelSum ?? '-'} -> ${a?.globe.pixelSum ?? '-'}`));
}

console.log('\n### Flat map: first switch from the globe (ms to drawn, longest frame gap, longest worker-message handler ms), before -> after\n');
console.log(row('browser', 'cells', 'time to drawn', 'longest frame gap', 'main-thread handler of the lookup message'), '\n' + row('---', '---', '---', '---', '---'));
for (const n of [1000000, 2560000]) for (const t of targets) {
  const b = load('before', `flat-${t}-${n}`)?.configs['flat-switch'], a = load('after', `flat-${t}-${n}`)?.configs['flat-switch'];
  const f = (x, k) => (x ? (k === 'ms' ? fmt(x.switches[0].ms, 0) : k === 'gap' ? fmt(Math.max(...gaps(x)), 0) : fmt(Math.max(0, ...x.msgs.map((m) => m.spanMs)), 0)) : '-');
  console.log(row(t, name(n), `${f(b, 'ms')} -> ${f(a, 'ms')}`, `${f(b, 'gap')} -> ${f(a, 'gap')}`, `${f(b, 'msg')} -> ${f(a, 'msg')}`));
}

console.log('\n### Flat map, drag-panning at 4x zoom with overlays: gap p50/p95/max in ms (gaps over 25 ms), rAF callback ms (median), SVG writes (count, median ms), before -> after\n');
console.log(row('browser', 'cells', 'configuration', 'before', 'after'), '\n' + row('---', '---', '---', '---', '---'));
for (const n of [1000000, 2560000]) for (const t of targets) for (const c of ['flat-pan', 'flat-pan-styled']) {
  const f = (d) => { const x = d?.configs[c]; if (!x) return '-'; const g = gaps(x).filter((v) => v > 0.5); return `${fmt(q(g, 0.5), 1)}/${fmt(q(g, 0.95), 1)}/${fmt(Math.max(...g), 0)} (${g.filter((v) => v > 25).length}); raf ${fmt(q(x.raf.map((r) => r.ms), 0.5), 1)}; svg ${x.svg.length}, ${fmt(q(x.svg.map((s) => s.ms), 0.5), 1)}`; };
  console.log(row(t, name(n), c, f(load('before', `flat-${t}-${n}`)), f(load('after', `flat-${t}-${n}`))));
}
