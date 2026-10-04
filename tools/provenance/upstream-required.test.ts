// The nightly job sets REQUIRE_UPSTREAM=1 so that a failed restore cannot turn the parity tests into silent skips.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

it.skipIf(!process.env.REQUIRE_UPSTREAM)('upstream/orogen and upstream/Azgaars-Fantasy-Map-Generator are present', () => {
  expect(existsSync(resolve(ROOT, 'upstream/orogen/js/planet-worker.js'))).toBe(true);
  expect(existsSync(resolve(ROOT, 'upstream/Azgaars-Fantasy-Map-Generator/src'))).toBe(true);
});
