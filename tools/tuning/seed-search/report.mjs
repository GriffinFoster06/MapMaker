// Report of the default-seed search: counts, cost, the funnel's rankings, the winner against the median and the
// current default, and how many seeds are within measurement noise of it. Writes <OUT>/report.json.
import fs from 'node:fs';
import path from 'node:path';
import { CURRENT_DEFAULT, ROBUST_TOL, SAMPLE_SEED, SEED_MAX, readRows, stageBSeeds, stageCSeeds } from './search.mjs';
import { layoutObjective, earthTargets } from './score.mjs';

const OUT = process.env.SEEDSEARCH_OUT ?? new URL('../results/seed-search', import.meta.url).pathname;
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1)); };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rnd = (x) => (typeof x === 'number' ? Math.round(x * 1e4) / 1e4 : x);

export function report() {
  const A = readRows('A'), B = readRows('B'), C = readRows('C');
  const scoredA = A.filter((r) => !r.skipped);
  const out = { sampleSeed: SAMPLE_SEED, seedRange: [1, SEED_MAX], robustTol: ROBUST_TOL };
  const ms = A.map((r) => r.msLayout + r.msScore);
  out.A = {
    scored: A.length, skippedLandFracOutside_0_1_to_0_5: A.length - scoredA.length,
    msPerSeedSingleCore: { layout: mean(A.map((r) => r.msLayout)), score: mean(A.filter((r) => !r.skipped).map((r) => r.msScore)), total: mean(ms) },
    objective: { min: q(scoredA.map((r) => r.objective), 0), p01: q(scoredA.map((r) => r.objective), 0.01), median: q(scoredA.map((r) => r.objective), 0.5), p99: q(scoredA.map((r) => r.objective), 0.99) },
    currentDefaultInSample: A.some((r) => r.seed === CURRENT_DEFAULT),
  };
  // Stage B: the best-500 list, the random reference group, the default seed.
  const { best, refs } = stageBSeeds(500, 200), Bm = new Map(B.map((r) => [r.seed, r])), Am = new Map(A.map((r) => [r.seed, r]));
  const bBest = best.map((s) => Bm.get(s)).filter(Boolean), bRef = refs.map((s) => Bm.get(s)).filter(Boolean);
  const robust = bBest.filter((r) => r.robust.ok).sort((a, b) => a.objective - b.objective || a.seed - b.seed);
  // Measurement noise of one seed's score: the same layout measured on two different meshes (the 20k reference raster
  // of stage A against the 50k world of stage B) differs by d; sd(d)/sqrt(2) is the noise of one measurement.
  const diffs = bBest.filter((r) => Am.has(r.seed) && !Am.get(r.seed).skipped).map((r) => r.objective - Am.get(r.seed).objective);
  const sigma = sd(diffs) / Math.SQRT2;
  out.B = {
    n: bBest.length, robust: robust.length, rejectedNotRobust: bBest.length - robust.length,
    noise: { sigma, meanShiftFromAToB: mean(diffs), n: diffs.length, note: 'sd(B objective - A objective)/sqrt(2) over the stage-B top list' },
    referenceGroup: { n: bRef.length, median: q(bRef.map((r) => r.objective), 0.5), p10: q(bRef.map((r) => r.objective), 0.1), p90: q(bRef.map((r) => r.objective), 0.9) },
    currentDefault: Bm.has(CURRENT_DEFAULT) ? { objective: Bm.get(CURRENT_DEFAULT).objective, terms: Bm.get(CURRENT_DEFAULT).terms } : null,
    top: robust.slice(0, 15).map((r) => ({ seed: r.seed, objective: r.objective, aObjective: Am.get(r.seed)?.objective, terms: r.terms })),
    bestBeforeRobustnessFilter: bBest.slice().sort((a, b) => a.objective - b.objective).slice(0, 5).map((r) => ({ seed: r.seed, objective: r.objective, robust: r.robust })),
  };
  // Within noise of the best stage-B seed.
  if (robust.length) {
    const b0 = robust[0].objective;
    out.B.withinNoiseOfBest = { oneSigma: robust.filter((r) => r.objective <= b0 + sigma).length, twoSigma: robust.filter((r) => r.objective <= b0 + 2 * sigma).length };
  }
  // Stage C.
  const { ranked, seeds } = stageCSeeds(10), Cm = new Map(C.map((r) => [r.seed, r]));
  const cRows = seeds.map((s) => Cm.get(s)).filter(Boolean);
  const cRank = cRows.filter((r) => r.seed !== CURRENT_DEFAULT || ranked.some((x) => x.seed === r.seed)).filter((r) => r.robust.ok).sort((a, b) => a.objective - b.objective || a.seed - b.seed);
  out.C = {
    n: cRows.length, ranking: cRank.map((r) => ({ seed: r.seed, objective: r.objective, bObjective: Bm.get(r.seed)?.objective, terms: r.terms, metrics: { landFrac: r.landFrac, continents: r.continents, top1: r.top1, top3: r.top3, boxFill: r.boxFill, straight: r.straight, areasMkm2: r.areasMkm2 }, robustWorst: r.robust.worst })),
    notRobustAtC: cRows.filter((r) => !r.robust.ok).map((r) => ({ seed: r.seed, objective: r.objective, robust: r.robust })),
    currentDefault: Cm.has(CURRENT_DEFAULT) ? { objective: Cm.get(CURRENT_DEFAULT).objective, terms: Cm.get(CURRENT_DEFAULT).terms } : null,
    orderHeldFromB: cRank.map((r) => r.seed).join(',') === ranked.slice(0, 10).map((r) => r.seed).sort((a, b) => cRank.findIndex((x) => x.seed === a) - cRank.findIndex((x) => x.seed === b)).join(','),
  };
  if (cRank.length) {
    const w = cRank[0];
    out.winner = { seed: w.seed, cObjective: w.objective, bObjective: Bm.get(w.seed)?.objective, aObjective: Am.get(w.seed)?.objective,
      vsReferenceMedianB: out.B.referenceGroup.median - Bm.get(w.seed).objective, vsCurrentDefaultB: out.B.currentDefault ? out.B.currentDefault.objective - Bm.get(w.seed).objective : null,
      vsCurrentDefaultC: out.C.currentDefault ? out.C.currentDefault.objective - w.objective : null,
      within1SigmaOfWinnerAtC: cRank.filter((r) => r.objective <= w.objective + sigma).length - 1 };
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(out, (k, v) => rnd(v), 1));
  console.log(JSON.stringify(out, (k, v) => rnd(v), 1));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) report();
