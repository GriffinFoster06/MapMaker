// Spike 1d — can orogen's coarse-plate stage honour pinned constraints?
// Uses the patched copy spikes/_work/orogen-1d (see apply-pins.py, pins.diff).
//   0. Regression: patched code with no pins == stock orogen, bit for bit.
//   A. Fixed continent shape: a 15° cap forced to be one land plate.
//   B. Region held fixed: a 25° cap copied from a baseline world (seed S1) into
//      a world generated from a different seed (S2); the rest regenerates.
// Usage: node pins-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runOrogen, makeRunner } from '../lib/orogen.mjs';
import { collectArrays, hashArrays } from '../lib/fields.mjs';
import { adjacency, makeLocator, llToXyz } from '../lib/sphere.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const runPinned = await makeRunner(path.join(HERE, '..', '_work', 'orogen-1d'));
const D = Math.PI / 180;
const capTest = (latDeg, lonDeg, radDeg) => {
  const [cx, cy, cz] = llToXyz(latDeg * D, lonDeg * D), c = Math.cos(radDeg * D);
  return (x, y, z) => x * cx + y * cy + z * cz >= c;
};
const out = {};

// 0. Regression
{
  const a = await hashArrays(collectArrays(runOrogen({ N: 20000, seed: 12345 })));
  const b = await hashArrays(collectArrays(runPinned({ N: 20000, seed: 12345 })));
  const diff = Object.keys(a).filter((k) => a[k].sha256 !== b[k]?.sha256);
  out.regressionNoPins = { arrays: Object.keys(a).length, differing: diff };
  console.error('regression', diff.length ? diff : 'identical');
}

// A. Fixed continent shape
out.fixedContinent = [];
{
  const inCap = capTest(20, 30, 15), inCore = capTest(20, 30, 13), inRim = capTest(20, 30, 17);
  const pins = { plateAt: (x, y, z) => (inCap(x, y, z) ? 0 : -1), landAt: (x, y, z) => (inCap(x, y, z) ? 1 : -1) };
  for (const seed of [12345, 777, 4242]) for (const N of [20000, 200000]) {
    const r = runPinned({ N, seed, pins });
    const id = new Map(r._pinIds).get(0);
    const xyz = r.r_xyz, E = r.r_elevation;
    let n = 0, plateOk = 0, land = 0, nCore = 0, landCore = 0, nRim = 0, landRim = 0, landAll = 0;
    for (let i = 0; i < r.numRegions; i++) {
      const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2];
      landAll += E[i] > 0;
      if (inCap(x, y, z)) { n++; plateOk += r.r_plate[i] === id; land += E[i] > 0; }
      if (inCore(x, y, z)) { nCore++; landCore += E[i] > 0; }
      if (inRim(x, y, z) && !inCap(x, y, z)) { nRim++; landRim += E[i] > 0; }
    }
    const row = { seed, N, cells: n, pinnedPlateIsLand: !r.plateIsOcean.includes(id), plateSurvival: plateOk / n,
      finalLandInCap: land / n, finalLandInCore13deg: landCore / nCore, finalLandInRing15to17deg: landRim / nRim,
      worldLandFrac: landAll / r.numRegions, plates: r.plateSeeds.length };
    out.fixedContinent.push(row);
    console.error('A', JSON.stringify(row));
  }
}

// B. Region held fixed
out.heldRegion = [];
for (const N of [20000, 200000]) {
  const S1 = 12345, S2 = 777;
  const inCap = capTest(-10, -60, 25);
  const base = runOrogen({ N, seed: S1 });
  const bAdj = adjacency(base.triangles, base.halfedges, base.numRegions);
  const loc = makeLocator(base.r_xyz, bAdj, base.numRegions);
  const bOcean = new Set(base.plateIsOcean);
  const pins = {
    plateAt: (x, y, z) => (inCap(x, y, z) ? base.r_plate[loc(x, y, z)] : -1),
    landAt: (x, y, z) => (inCap(x, y, z) ? (bOcean.has(base.r_plate[loc(x, y, z)]) ? 0 : 1) : -1),
    plateVec: {},
  };
  for (let i = 0; i < base.numRegions; i++) {
    const x = base.r_xyz[3 * i], y = base.r_xyz[3 * i + 1], z = base.r_xyz[3 * i + 2];
    if (inCap(x, y, z)) pins.plateVec[base.r_plate[i]] = base.plateVec[base.r_plate[i]];
  }
  const unpinned = runOrogen({ N, seed: S2 });
  const variants = { pinned: runPinned({ N, seed: S2, pins }) };
  const { plateVec, ...noVec } = pins;
  variants.pinnedNoEulerPoles = runPinned({ N, seed: S2, pins: noVec });

  const measure = (r, label) => {
    const ids = r._pinIds ? new Map(r._pinIds) : null, ocean = new Set(r.plateIsOcean);
    let n = 0, plateOk = 0, plateLandOk = 0, landOk = 0, mtnI = 0, mtnU = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    let nOut = 0, landOkOut = 0;
    for (let i = 0; i < r.numRegions; i++) {
      const x = r.r_xyz[3 * i], y = r.r_xyz[3 * i + 1], z = r.r_xyz[3 * i + 2];
      const j = loc(x, y, z), eb = base.r_elevation[j], er = r.r_elevation[i];
      if (!inCap(x, y, z)) { nOut++; landOkOut += (eb > 0) === (er > 0); continue; }
      n++;
      const bl = base.r_plate[j];
      if (ids) plateOk += r.r_plate[i] === ids.get(bl);
      plateLandOk += bOcean.has(bl) === ocean.has(r.r_plate[i]);
      landOk += (eb > 0) === (er > 0);
      const mb = eb > 0.55, mr = er > 0.55;   // raw 0.55 ≈ 1.5 km on orogen's S-curve
      mtnI += mb && mr; mtnU += mb || mr;
      sx += eb; sy += er; sxx += eb * eb; syy += er * er; sxy += eb * er;
    }
    const cov = sxy / n - (sx / n) * (sy / n), corr = cov / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
    return { label, N, cellsInRegion: n, plateSurvival: ids ? plateOk / n : null, plateLevelLandAgreement: plateLandOk / n,
      finalLandAgreement: landOk / n, elevationCorrelation: corr, mountainIoU: mtnI / mtnU, outsideFinalLandAgreement: landOkOut / nOut };
  };
  for (const row of [measure(unpinned, 'unpinned seed S2 (control)'), measure(variants.pinned, 'pinned plates+land+Euler poles'), measure(variants.pinnedNoEulerPoles, 'pinned plates+land only')]) {
    out.heldRegion.push(row);
    console.error('B', JSON.stringify(row));
  }
}

fs.mkdirSync(path.join(HERE, 'results'), { recursive: true });
fs.writeFileSync(path.join(HERE, 'results', 'pins-test.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
