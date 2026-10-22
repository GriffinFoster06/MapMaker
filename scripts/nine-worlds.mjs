/* global console, performance */
// Nine-world bit comparison (OPERATING_GUIDE §5): the structured pipeline at 200k, 1M and 2.56M cells for seeds 1, 777
// and 12345; prints the World hash and every layer array's hash. Usage:
//   NODE_OPTIONS=--max-old-space-size=13000 scripts/node24.sh npx tsx scripts/nine-worlds.mjs out.json [--parallel[=<workers>]]
//   node scripts/nine-worlds.mjs --compare a.json b.json
import fs from 'node:fs';
import process from 'node:process';

if (process.argv[2] === '--compare') {
  const a = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), b = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  let diff = 0, n = 0;
  for (const k of Object.keys(a)) {
    for (const key of new Set([...Object.keys(a[k]), ...Object.keys(b[k] ?? {})])) {
      n++;
      if (a[k][key] !== b[k]?.[key]) { diff++; console.log(`DIFF ${k} ${key}`); }
    }
  }
  console.log(`${Object.keys(a).length} worlds, ${n} hashes compared, ${diff} differences`);
  process.exit(diff ? 1 : 0);
}

const out = process.argv[2];
const par = process.argv.find((s) => s.startsWith('--parallel'));
const { hashWorld } = await import('@mapmaker/core');
const { runPipeline } = await import('@mapmaker/engine');
const gen = await import('@mapmaker/gen-orogen');
const { startNodeKernelPool } = await import('@mapmaker/gen-orogen/node-pool');
const pool = par ? await startNodeKernelPool(par.includes('=') ? Number(par.split('=')[1]) : undefined) : undefined;
const res = {};
for (const N of [200000, 1000000, 2560000]) {
  for (const seed of [1, 777, 12345]) {
    const t = performance.now();
    const world = gen.createOrogenWorld({ N, seed });
    await runPipeline(world, [...gen.orogenStages, ...gen.structuredStages], { variant: gen.STRUCTURED, strict: false });
    const h = { world: await hashWorld(world) };
    for (const key of world.layers.keys()) { const i = key.indexOf('/'); h[key] = await world.layers.hash(key.slice(0, i), key.slice(i + 1)); }
    res[`${N}/${seed}`] = h;
    console.log(`${N} seed ${seed}: ${h.world.slice(0, 16)} (${Object.keys(h).length - 1} arrays, ${((performance.now() - t) / 1000).toFixed(1)} s)`);
  }
}
if (pool) console.log(`parallel calls ${pool.executor.calls}, declined ${pool.executor.declined}, workers ${pool.pool.size}`);
await pool?.terminate();
fs.writeFileSync(out, JSON.stringify(res, null, 1));
