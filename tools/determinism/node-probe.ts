// Node entry: `npm run probe` compares with golden.json; `npm run probe -- --write` regenerates it.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareHashes, formatReport, splitMismatches } from './compare';
import { runProbe } from './probe';

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, 'golden.json');
const r = await runProbe();
if (process.argv.includes('--write')) {
  writeFileSync(goldenPath, JSON.stringify({ version: r.version, hashes: r.hashes }, null, 1) + '\n');
  console.log(`wrote ${Object.keys(r.hashes).length} hashes to golden.json (node ${process.version}, ${process.platform}/${process.arch})`);
} else {
  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as { version: number; hashes: Record<string, string> };
  const mism = compareHashes(r.hashes, golden.hashes);
  const { strict, soft } = splitMismatches(mism);
  console.log(`node ${process.version} ${process.platform}/${process.arch}: ${Object.keys(r.hashes).length} hashes, ${strict.length} strict mismatches, ${soft.length} transcendental-dependent mismatches`);
  if (soft.length) console.log('DIVERGENT (transcendental-dependent, reported not failed):\n' + formatReport(soft));
  if (strict.length) { console.error(formatReport(strict)); process.exit(1); }
}
