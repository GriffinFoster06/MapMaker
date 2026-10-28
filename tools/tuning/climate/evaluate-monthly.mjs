/**
 * Scores the monthly Köppen of design note 11 (monthly values synthesised from the two solstice solves, Beck et al.
 * rules; packages/gen-orogen/src/port/monthly-climate.ts) against the same Kottek ground truth and objective as the
 * two-season proxy classifier (evaluate.mjs, baseline.json), on the same Earth context.
 *
 * Usage: scripts/node24.sh npx tsx tools/tuning/climate/evaluate-monthly.mjs [--n 40000] [--seed 1234] [--land-lag 1] [--sea-lag 2] [--att 6]
 * Original code (Phase 6 M3).
 */
import { buildEarthContext } from './lib/earth-context.mjs';
import { runClimate, scoreKoppen } from './lib/score.mjs';
import { classifyKoppenMonthly } from '@mapmaker/gen-orogen';

function parseArgs(argv) {
    const a = { n: 40000, seed: 1234, landLag: 1, seaLag: 2, att: 6 };
    for (let i = 2; i < argv.length; i++) {
        const k = argv[i];
        if (k === '--n') a.n = +argv[++i];
        else if (k === '--seed') a.seed = +argv[++i];
        else if (k === '--land-lag') a.landLag = +argv[++i];
        else if (k === '--sea-lag') a.seaLag = +argv[++i];
        else if (k === '--att') a.att = +argv[++i];
        else throw new Error(`Unknown arg: ${k}`);
    }
    return a;
}

const args = parseArgs(process.argv);
const ctx = await buildEarthContext({ N: args.n, seed: args.seed });
const { r_koppen } = await runClimate(ctx, {});
const proxy = scoreKoppen(ctx, r_koppen);
const L = (id) => ctx.world.layers.get('global', id);
const { koppen } = classifyKoppenMonthly(L('orogen.elevRaw'), L('temp.summer'), L('temp.winter'), L('precip.summer'), L('precip.winter'),
    { landLagMonths: args.landLag, seaLagMonths: args.seaLag, precipAttenuation: args.att });
const monthly = scoreKoppen(ctx, koppen);
const row = (name, m) => console.log(`${name.padEnd(10)} objective ${m.objective.toFixed(4)}  graded ${m.gradedAcc.toFixed(4)}  exact ${m.exactAcc.toFixed(4)}  major ${m.majorAcc.toFixed(4)}  macroF1 ${m.macroF1.toFixed(4)}  balance ${m.groupBalance.toFixed(4)}  watchlist ${m.watchlistF1.toFixed(4)}`);
console.log(`N=${args.n} seed=${args.seed} landLag=${args.landLag} seaLag=${args.seaLag} att=${args.att} scored=${proxy.scored}`);
row('proxy', proxy);
row('monthly', monthly);
console.log(`delta objective ${(monthly.objective - proxy.objective).toFixed(4)}`);
// Flush stdout and leave explicitly: the engine's worker pool otherwise ends the process with an error after the results.
await new Promise((resolve) => process.stdout.write('', resolve));
process.exit(0);
