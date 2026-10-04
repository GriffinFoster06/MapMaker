// Provenance: orogen tuning/climate/lib/earth-context.mjs @ cc2662b, rewritten to build the Earth evaluation context
// through the shell: core SphereMesh (the `mesh` stage), the shell's heightmap import (gen-orogen importHeightmap), and
// a World whose climate stages the scorer runs. The ground-truth and scoring logic is unchanged.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { runPipeline } from '@mapmaker/engine';
import { createOrogenWorld, orogenStages, importHeightmap, getScratch, STAGE } from '@mapmaker/gen-orogen';
import { loadGroundTruth, truthAt, NO_DATA } from './ground-truth.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EARTH_PNG = path.resolve(__dirname, '../../../../packages/gen-orogen/vendor/assets/earth.png');

/** Decode the Earth heightmap to grayscale (same luminance as import-main.js). */
export function loadEarthGrayscale(pngPath = EARTH_PNG) {
    const png = PNG.sync.read(fs.readFileSync(pngPath));
    const { width, height, data } = png;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        gray[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
    }
    return { gray, width, height };
}

/**
 * The fixed "Earth example" evaluation context: mesh stage, heightmap import (detail noise L1 + L2, soil creep,
 * synthetic plates), ground truth per region. Deterministic for a given (N, seed).
 */
export async function buildEarthContext({ N = 40000, seed = 1234, jitter = 0.75 } = {}) {
    const t0 = performance.now();
    const world = createOrogenWorld({ N, seed, jitter });
    await runPipeline(world, orogenStages, { only: [STAGE.mesh], strict: false });
    const s = getScratch(world);
    const { r_elevation } = importHeightmap(world, loadEarthGrayscale());

    const numRegions = s.mesh.numRegions;
    const r_xyz = s.r_xyz;
    const r_lat = new Float32Array(numRegions);
    const r_lon = new Float32Array(numRegions);
    for (let r = 0; r < numRegions; r++) {
        r_lat[r] = Math.asin(Math.max(-1, Math.min(1, r_xyz[3 * r + 1])));
        r_lon[r] = Math.atan2(r_xyz[3 * r], r_xyz[3 * r + 2]);
    }

    const truthGrid = loadGroundTruth();
    const r_truth = new Uint8Array(numRegions).fill(NO_DATA);
    for (let r = 0; r < numRegions; r++) r_truth[r] = truthAt(truthGrid, r_lat[r], r_lon[r]);

    const r_scored = new Uint8Array(numRegions);
    let simLand = 0, truthLand = 0, bothLand = 0;
    for (let r = 0; r < numRegions; r++) {
        const sl = r_elevation[r] > 0;
        const tl = r_truth[r] !== NO_DATA;
        if (sl) simLand++;
        if (tl) truthLand++;
        if (sl && tl) { bothLand++; r_scored[r] = 1; }
    }

    return {
        world, mesh: s.mesh, r_xyz, r_elevation, r_lat, r_lon,
        truthGrid, r_truth, r_scored,
        maskStats: {
            simLandFrac: simLand / numRegions,
            truthLandFrac: truthLand / numRegions,
            scoredFrac: bothLand / numRegions,
            landAgreement: bothLand / Math.max(1, simLand),
        },
        seed, N,
        buildMs: performance.now() - t0,
    };
}
