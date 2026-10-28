// Node loader for the Earth grid (tests, scripts, the desktop main process). Not imported by browser code.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { setEarthGrid } from './structured/earth';

export const EARTH_GRID_FILE = new URL('../assets/earth-5m.i16.gz', import.meta.url);

export function loadEarthGridNode(): void {
  const raw = zlib.gunzipSync(fs.readFileSync(EARTH_GRID_FILE));
  setEarthGrid(new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2));
}
