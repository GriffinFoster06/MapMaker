// Derived Earth elevation grid for the "Earth" world option (Phase 6 M5, decision P12). Original code.
// From the cached 5 arc-minute aggregate of ETOPO 2022 (NOAA, public domain) and Natural Earth land polygons
// (public domain): per pixel one Int16 in metres, row 0 at 90 N, column 0 at 180 W. A pixel whose land share is at
// least one half takes its mean land elevation (at least +1 m), any other pixel its mean ocean elevation (at most
// -1 m), so the sign of the value is the Natural Earth coastline at 5'. Output is gzip-compressed and committed.
// Rebuild: scripts/node24.sh node tools/tuning/earthlike/build-earth-grid.mjs   (needs fetch-earth.sh data)
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { G5, earthGrid5m } from './earth-data.mjs';

const OUT = new URL('../../../packages/gen-orogen/assets/earth-5m.i16.gz', import.meta.url);
const { land, elevLand, elevOcean } = earthGrid5m();
const n = G5.W * G5.H;
const out = new Int16Array(n);
for (let i = 0; i < n; i++) {
  const v = land[i] >= 0.5 ? Math.max(1, Math.round(elevLand[i])) : Math.min(-1, Math.round(elevOcean[i]));
  out[i] = Math.max(-32768, Math.min(32767, v));
}
const raw = Buffer.from(out.buffer, out.byteOffset, out.byteLength);
const gz = zlib.gzipSync(raw, { level: 9, mtime: 0 });
fs.writeFileSync(OUT, gz);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
console.log(`${G5.W}x${G5.H} int16, raw sha256 ${sha(raw)}, gz ${gz.length} bytes sha256 ${sha(gz)}`);
