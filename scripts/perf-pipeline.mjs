/* global setTimeout, performance, console */
// Per-stage time, peak memory and CPU use of the structured pipeline in Node (docs/checkpoints/PERFORMANCE_STUDY.md).
// Usage: NODE_OPTIONS=--max-old-space-size=13000 scripts/node24.sh npx tsx scripts/perf-pipeline.mjs <N> [out.json] [--parallel[=<workers>]]
// --parallel runs the per-cell kernels in a worker pool (decision PK1; default hardware threads - 1 workers); its start-up
// time and the RSS it adds before generation are reported separately.
// A sampler thread reads the process RSS and CPU time every 25 ms (the main thread is busy), so peaks are real peaks.
import { Worker } from 'node:worker_threads';
import process from 'node:process';
import fs from 'node:fs';
import { runPipeline } from '@mapmaker/engine';
import { createOrogenWorld, orogenStages, structuredStages, STRUCTURED } from '@mapmaker/gen-orogen';
import { startNodeKernelPool } from '@mapmaker/gen-orogen/node-pool';

const SAMPLER = `const { parentPort } = require('node:worker_threads'); let go = true; parentPort.on('message', () => { go = false; });
const tick = () => { if (!go) return; parentPort.postMessage({ t: performance.now(), rss: process.memoryUsage.rss() }); setTimeout(tick, 25); }; tick();`;
{
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), par = process.argv.find((a) => a.startsWith('--parallel'));
  const N = Number(args[0] ?? 200000), out = args[1];
  const samples = [];
  const sampler = new Worker(SAMPLER, { eval: true, execArgv: [] });
  sampler.on('message', (m) => samples.push(m));
  await new Promise((r) => setTimeout(r, 100));
  const rssBeforePool = process.memoryUsage.rss(), t0 = performance.now();
  const pool = par ? await startNodeKernelPool(par.includes('=') ? Number(par.split('=')[1]) : undefined) : undefined;
  const poolStartMs = performance.now() - t0, poolRssMB = (process.memoryUsage.rss() - rssBeforePool) / 1048576;
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
  const calls = pool ? { parallel: pool.executor.calls, declined: pool.executor.declined, arenaMB: +(pool.executor.arenaBytes / 1048576).toFixed(0), copiedMB: +(pool.executor.copiedBytes / 1048576).toFixed(0) } : undefined;
  await pool?.terminate();
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
  const result = { N, total: +total.toFixed(0), workers: pool ? pool.pool.size : 0, poolStartMs: +poolStartMs.toFixed(0), poolRssMB: +poolRssMB.toFixed(0), calls, ran: res.ran, peakRssMB: +(Math.max(...samples.map((s) => s.rss)) / 1048576).toFixed(0), rows };
  if (out) fs.writeFileSync(out, JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result, null, 1));
}
