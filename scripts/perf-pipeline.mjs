/* global setTimeout, performance, console */
// Per-stage time, peak memory and CPU use of the structured pipeline in Node (docs/checkpoints/PERFORMANCE_STUDY.md).
// Usage: NODE_OPTIONS=--max-old-space-size=13000 scripts/node24.sh npx tsx scripts/perf-pipeline.mjs <N> [out.json]
// A sampler thread reads the process RSS and CPU time every 25 ms (the main thread is busy), so peaks are real peaks.
import { Worker } from 'node:worker_threads';
import process from 'node:process';
import fs from 'node:fs';
import { runPipeline } from '@mapmaker/engine';
import { createOrogenWorld, orogenStages, structuredStages, STRUCTURED } from '@mapmaker/gen-orogen';

const SAMPLER = `const { parentPort } = require('node:worker_threads'); let go = true; parentPort.on('message', () => { go = false; });
const tick = () => { if (!go) return; parentPort.postMessage({ t: performance.now(), rss: process.memoryUsage.rss() }); setTimeout(tick, 25); }; tick();`;
{
  const N = Number(process.argv[2] ?? 200000), out = process.argv[3];
  const samples = [];
  const sampler = new Worker(SAMPLER, { eval: true, execArgv: [] });
  sampler.on('message', (m) => samples.push(m));
  await new Promise((r) => setTimeout(r, 100));
  const marks = [];
  const mark = (label) => marks.push({ label, t: performance.now(), rss: process.memoryUsage().rss, heap: process.memoryUsage().heapUsed, cpu: process.cpuUsage() });
  mark('start');
  const world = createOrogenWorld({ N, seed: 12345 });
  let last = '';
  const res = await runPipeline(world, [...orogenStages, ...structuredStages], {
    variant: STRUCTURED, strict: false,
    onProgress: (e) => { const k = `${e.stageId} | ${e.message ?? ''}`; if (k !== last) { last = k; mark(k); } },
  });
  mark('end');
  sampler.postMessage('stop');
  await new Promise((r) => setTimeout(r, 100));
  await sampler.terminate();
  const rows = [];
  for (let i = 0; i < marks.length - 1; i++) {
    const a = marks[i], b = marks[i + 1];
    const wall = b.t - a.t, cpu = ((b.cpu.user - a.cpu.user) + (b.cpu.system - a.cpu.system)) / 1000;
    const inWin = samples.filter((s) => s.t >= a.t && s.t <= b.t);
    rows.push({ stage: a.label, ms: +wall.toFixed(0), cpuMs: +cpu.toFixed(0), cores: +(cpu / wall).toFixed(2), peakRssMB: +(Math.max(a.rss, b.rss, ...inWin.map((s) => s.rss)) / 1048576).toFixed(0), endHeapMB: +(b.heap / 1048576).toFixed(0) });
  }
  const total = marks.at(-1).t - marks[0].t;
  const result = { N, total: +total.toFixed(0), ran: res.ran, peakRssMB: +(Math.max(...samples.map((s) => s.rss)) / 1048576).toFixed(0), rows };
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
}
