import { describe, expect, test } from 'vitest';
import { OrogenLcg, SphereMesh } from '@mapmaker/core';
import { QGIS_HILLSHADE_DEFAULT, cellDerivatives, cellHillshade, flatGray, hillshadeGray } from './hillshade';

// Golden values: the C++ expressions of qgshillshaderenderer.cpp:435-472 evaluated independently (a Python transcription of
// the same lines) for QGIS's default settings (azimuth 315, light angle 45, z factor 1), and for azimuth 225, light angle 30,
// z factor 2.
const GOLDEN: { d: [number, number]; single: number; multi: number; single2: number; multi2: number }[] = [
  { d: [0, 0], single: 179.60512242138304, multi: 180.60512242138304, single2: 219.9704525612474, multi2: 220.9704525612474 },
  { d: [0.5, 0], single: 217.4398317650483, multi: 99.46602819670508, single2: 219.0425986667318, multi2: 71.01772159861866 },
  { d: [0, 0.5], single: 103.847578508059, multi: 108.76307345282983, single2: 219.0425986667318, multi2: 79.23522628062369 },
  { d: [0.3, -0.4], single: 240.15828241644613, multi: 142.59836327407368, single2: 142.8425986667318, multi2: 109.14167987564082 },
  { d: [-0.3, 0.4], single: 81.12912785666111, multi: 146.7698326001392, single2: 168.2425986667318, multi2: 112.82877268560658 },
  { d: [2, 2], single: 59.86837414046105, multi: 1, single2: 163.35289559637806, multi2: 1 },
];

describe('QGIS hillshade formula', () => {
  test('equals the renderer expressions at golden derivatives, single and multi-directional, two settings', () => {
    const p2 = { azimuthDeg: 225, lightAngleDeg: 30, zFactor: 2 };
    for (const g of GOLDEN) {
      expect(hillshadeGray(g.d[0], g.d[1], QGIS_HILLSHADE_DEFAULT), String(g.d)).toBeCloseTo(g.single, 10);
      expect(hillshadeGray(g.d[0], g.d[1], { ...QGIS_HILLSHADE_DEFAULT, multiDirectional: true }), String(g.d)).toBeCloseTo(g.multi, 10);
      expect(hillshadeGray(g.d[0], g.d[1], { ...p2, multiDirectional: false }), String(g.d)).toBeCloseTo(g.single2, 10);
      expect(hillshadeGray(g.d[0], g.d[1], { ...p2, multiDirectional: true }), String(g.d)).toBeCloseTo(g.multi2, 10);
    }
  });
  test('flat ground is 254·sin(90° − lightAngle) (single) and one more (multi)', () => {
    expect(flatGray()).toBeCloseTo(254 * Math.SQRT1_2, 10);
    expect(flatGray({ ...QGIS_HILLSHADE_DEFAULT, multiDirectional: true })).toBeCloseTo(1 + 254 * Math.SQRT1_2, 10);
  });
  test('a slope facing the light is brighter than flat, one facing away is darker; the output stays within 0..255', () => {
    // Light from the north-west (azimuth 315): a surface facing north-west rises to the east and falls to the north.
    const toward = hillshadeGray(0.3, -0.3), away = hillshadeGray(-0.3, 0.3);
    expect(toward).toBeGreaterThan(flatGray());
    expect(away).toBeLessThan(flatGray());
    for (const dx of [-50, -1, 0, 1, 50]) for (const dy of [-50, 0, 50]) for (const multi of [false, true]) {
      const g = hillshadeGray(dx, dy, { ...QGIS_HILLSHADE_DEFAULT, multiDirectional: multi });
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(255);
    }
  });
});

const mesh = (() => { const rng = new OrogenLcg('mesh', 3); return SphereMesh.build({ N: 20000, jitter: 0.75, rng: () => rng.next(), precision: 'f64' }); })();
const R = 6_371_000;

describe('cell derivatives on the sphere mesh', () => {
  test('recover the gradient of a plane tangent at a point, at the equator, mid-latitude and next to the pole', () => {
    for (const [lonDeg, latDeg] of [[10, 0], [-120, 45], [75, 82]] as const) {
      const lon = (lonDeg * Math.PI) / 180, lat = (latDeg * Math.PI) / 180;
      const c = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
      const e = [-Math.sin(lon), Math.cos(lon), 0], nn = [-Math.sin(lat) * Math.cos(lon), -Math.sin(lat) * Math.sin(lon), Math.cos(lat)];
      const A = 0.04, B = -0.015; // gradient east and north, metres per metre
      const elev = new Float64Array(mesh.numRegions);
      for (let i = 0; i < elev.length; i++) {
        const p = [mesh.points[3 * i]!, mesh.points[3 * i + 1]!, mesh.points[3 * i + 2]!];
        elev[i] = R * (A * (p[0]! * e[0]! + p[1]! * e[1]!) + B * (p[0]! * nn[0]! + p[1]! * nn[1]! + p[2]! * nn[2]!));
      }
      const { derX, derY } = cellDerivatives(mesh, elev, R);
      // The cells within 3° of the point.
      let n = 0;
      for (let i = 0; i < elev.length; i++) {
        const dot = mesh.points[3 * i]! * c[0]! + mesh.points[3 * i + 1]! * c[1]! + mesh.points[3 * i + 2]! * c[2]!;
        if (Math.acos(Math.min(1, dot)) > (3 * Math.PI) / 180) continue;
        n++;
        // The plane is defined in this point's tangent frame, so the local frame of a cell a few degrees away is rotated by
        // up to that angle (and by the meridian convergence near the pole): compare the gradient's magnitude and, away from
        // the pole, its components.
        expect(Math.hypot(derX[i]!, derY[i]!)).toBeGreaterThan(0.03);
        expect(Math.hypot(derX[i]!, derY[i]!)).toBeLessThan(0.05);
        if (latDeg < 60) { expect(derX[i]!).toBeGreaterThan(0.025); expect(derY[i]!).toBeLessThan(0); }
      }
      expect(n, `${lonDeg},${latDeg}`).toBeGreaterThan(10);
    }
  });
  test('a flat field has zero derivatives and the flat gray; sea cells are flattened', () => {
    const flat = new Float64Array(mesh.numRegions).fill(100);
    const { derX, derY } = cellDerivatives(mesh, flat, R);
    expect(Math.max(...derX.map(Math.abs), ...derY.map(Math.abs))).toBe(0);
    const sh = cellHillshade(mesh, flat, R);
    expect(sh[0]).toBeCloseTo(flatGray() / 255, 6);
    const sea = new Float64Array(mesh.numRegions);
    for (let i = 0; i < sea.length; i++) sea[i] = -1000 + 800 * Math.sin(i);
    for (const v of cellHillshade(mesh, sea, R)) expect(v).toBeCloseTo(flatGray() / 255, 6);
    expect(cellHillshade(mesh, sea, R, QGIS_HILLSHADE_DEFAULT, { seaFlat: false }).some((v) => Math.abs(v - flatGray() / 255) > 0.01)).toBe(true);
  });
  test('is deterministic', () => {
    const e = new Float64Array(mesh.numRegions);
    for (let i = 0; i < e.length; i++) e[i] = 500 * Math.sin(0.01 * i) * Math.cos(0.003 * i);
    const a = cellHillshade(mesh, e, R), b = cellHillshade(mesh, e, R);
    expect(a).toEqual(b);
  });
});
