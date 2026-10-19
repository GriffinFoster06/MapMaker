import { expect, test } from '@playwright/test';
import { runPipeline } from '@mapmaker/engine';
import { STRUCTURED, createOrogenWorld, orogenStages, structuredStages } from '@mapmaker/gen-orogen';
import { GPU_PROJECTION_IDS, MeshSampler, ProjectionView, type ViewOptions, locateRaster, sampleRaster } from '@mapmaker/projection';
import { GPU_TOLERANCES, type ViewStats, compareGeo, compareSample } from './gpu-compare';

// Phase 5 M4: the GLSL inverse of every shader projection against d3 invert, and the shader's data lookup against the
// CPU sampler (MeshSampler), over dense pixel grids that include the poles (polar aspects with a pixel centred on the
// pole), the antimeridian (the left and right edges of unrotated views, and 16× zooms centred on it) and every
// outline edge. Tolerances are in gpu-compare.ts with the measured values.
const N = 20000, SEED = 12345;

/** View options: unrotated, oblique, both polar aspects, and 16× zooms centred on the antimeridian and next to a pole. */
function views(projection: string): ViewOptions[] {
  const out: ViewOptions[] = [
    { projection, width: 360, height: 180 },
    { projection, width: 361, height: 181, rotate: [-30, -40, 20] },
    { projection, width: 201, height: 201, rotate: [0, -90, 0] },
    { projection, width: 201, height: 201, rotate: [0, 90, 0] },
  ];
  const base = new ProjectionView({ projection, width: 360, height: 180 });
  for (const target of [[180, 30], [-179.9, -60], [60, projection === 'mercator' ? 84.5 : 89.5]] as [number, number][]) {
    const p = base.forward(target[0], target[1]);
    if (!p) continue;
    const z = 16, c = [180, 90];
    out.push({ projection, width: 360, height: 180, zoom: z, pan: [-(p[0] - c[0]!) * z, -(p[1] - c[1]!) * z] });
  }
  return out;
}

test('GPU shaders: inverse against d3 invert, lookup against the CPU sampler', async ({ page, browserName }, info) => {
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('./');
  await page.waitForFunction(() => !!window.__globe && !!window.__flat);
  await page.evaluate(([n, seed]) => window.__globe!.generate({ N: n!, seed: seed! }), [N, SEED]);
  const ready = await page.evaluate(() => window.__flat!.ready('elevation'));
  expect(ready.gpu, `WebGL2 GPU path available in ${browserName}`).toBe(true);
  const hashBefore = await page.evaluate(() => window.__flat!.worldHash());

  const w = createOrogenWorld({ N, seed: SEED });
  await runPipeline(w, [...orogenStages, ...structuredStages], { variant: STRUCTURED, strict: false });
  const sampler = new MeshSampler(w.meshes.get('global')!.mesh);
  const elev = w.layers.get('global', 'detail.elevRaw');

  const all: ViewStats[] = [];
  for (const projection of GPU_PROJECTION_IDS) for (const v of views(projection)) {
    const geo = new Uint32Array(Buffer.from(await page.evaluate(([o, m]) => window.__flat!.debug(o as ViewOptions, m as 1), [v, 1] as const), 'base64').buffer.slice(0));
    const smp = new Uint32Array(Buffer.from(await page.evaluate(([o, m]) => window.__flat!.debug(o as ViewOptions, m as 2), [v, 2] as const), 'base64').buffer.slice(0));
    const view = new ProjectionView(v);
    const loc = locateRaster(view, sampler);
    const values = sampleRaster(view, sampler, elev, 'barycentric');
    const stats = { view: v, ...compareGeo(view, geo), ...compareSample(view, geo, smp, loc, values, sampler) };
    all.push(stats);
    if (process.env['GPU_VERBOSE']) console.log(projection, JSON.stringify(v.rotate ?? []), v.zoom ?? 1, `in=${stats.inside} ang=${stats.angleRad.toExponential(2)} px=${stats.pxError.toExponential(2)} dom=${stats.domainMismatch}/${stats.domainMismatchNonEdge} ${stats.nonEdgeExample ?? ''} tri=${stats.triMismatchFrac.toExponential(2)} cell=${stats.cellMismatchFrac.toExponential(2)} val=${stats.valueRelErr.toExponential(2)} triBad=${stats.triUnexplained} cellBad=${stats.cellUnexplained} walk=${stats.maxWalk}/${stats.walkFlags}`);
  }
  await info.attach(`gpu-${browserName}.json`, { body: JSON.stringify(all, null, 1), contentType: 'application/json' });
  const worst = (k: keyof ViewStats, zoomed?: boolean) => Math.max(...all.filter((s) => zoomed === undefined || !!s.view.zoom === zoomed).map((s) => s[k] as number));
  console.log(`[${browserName}] pxError zoom 1 ${worst('pxError', false)}, zoom 16 ${worst('pxError', true)}`);
  console.log(`[${browserName}] worst: ${(['angleRad', 'domainMismatchNonEdge', 'domainMismatch', 'triMismatchFrac', 'triUnexplained', 'cellMismatchFrac', 'cellUnexplained', 'valueRelErr', 'walkFlags', 'maxWalk'] as const).map((k) => `${k}=${worst(k)}`).join(' ')}`);

  for (const s of all) {
    const id = `${s.view.projection} ${JSON.stringify(s.view)}`;
    expect(s.inside, id).toBeGreaterThan(100);
    expect(s.walkFlags, `${id}: walk bound reached`).toBe(0);
    expect(s.domainMismatchNonEdge, `${id}: in/out differs away from an outline edge`).toBe(0);
    expect(s.angleRad, `${id}: angle error`).toBeLessThanOrEqual(GPU_TOLERANCES.angleRad);
    expect(s.pxError, `${id}: pixel error`).toBeLessThanOrEqual(s.view.zoom ? GPU_TOLERANCES.pxErrorZoom16 : GPU_TOLERANCES.pxError);
    expect(s.triUnexplained, `${id}: a triangle the shader's own point is not in`).toBe(0);
    expect(s.triMismatchFrac, `${id}: triangle mismatch fraction`).toBeLessThanOrEqual(GPU_TOLERANCES.triMismatchFrac);
    expect(s.cellUnexplained, `${id}: a nearest cell that is not nearest to the shader's own point`).toBe(0);
    expect(s.cellMismatchFrac, `${id}: nearest-cell mismatch fraction`).toBeLessThanOrEqual(GPU_TOLERANCES.triMismatchFrac);
    expect(s.valueRelErr, `${id}: value error`).toBeLessThanOrEqual(GPU_TOLERANCES.valueRelErr);
  }
  // Switching projection and rendering never touches the World.
  expect(await page.evaluate(() => window.__flat!.worldHash())).toBe(hashBefore);
  expect(errors).toEqual([]);
});
