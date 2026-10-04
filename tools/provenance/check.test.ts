import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkProvenance, licenseTokens } from './check';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'prov-'));
  const w = (p: string, c: string) => { mkdirSync(dirname(join(root, p)), { recursive: true }); writeFileSync(join(root, p), c); };
  // A fake upstream repo with one commit.
  const up = join(root, 'upstream', 'fake');
  mkdirSync(up, { recursive: true });
  writeFileSync(join(up, 'a.js'), 'export const a = 1;\n');
  const git = (...a: string[]) => execFileSync('git', ['-C', up, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]).toString().trim();
  git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', 'x');
  const commit = git('rev-parse', 'HEAD');
  w('upstream-manifest.json', JSON.stringify({ repos: [{ name: 'fake', commit }] }));
  w('package.json', JSON.stringify({ name: 'r', dependencies: {} }));
  w('package-lock.json', JSON.stringify({ packages: { '': {} } }));
  return { root, w, commit };
}
const prov = (rows: string) => `# P\n\n| File | Repo | Path | Commit | License |\n|---|---|---|---|---|\n${rows}\n`;

describe('provenance checker', () => {
  it('passes a verbatim vendored file with a matching row', () => {
    const { root, w, commit } = fixture();
    w('packages/x/vendor/a.js', 'export const a = 1;\n');
    w('PROVENANCE.md', prov(`| \`packages/x/vendor/a.js\` | fake | \`a.js\` | \`${commit.slice(0, 7)}\` | MIT |`));
    expect(checkProvenance({ root }).errors).toEqual([]);
  });

  it('fails when a vendored file was modified', () => {
    const { root, w, commit } = fixture();
    w('packages/x/vendor/a.js', 'export const a = 2;\n');
    w('PROVENANCE.md', prov(`| \`packages/x/vendor/a.js\` | fake | \`a.js\` | \`${commit.slice(0, 7)}\` | MIT |`));
    expect(checkProvenance({ root }).errors.join('\n')).toMatch(/differs from fake/);
  });

  it('fails on a missing row, a wrong commit, and an unlisted Provenance header', () => {
    const { root, w } = fixture();
    w('packages/x/vendor/a.js', 'export const a = 1;\n');
    w('packages/x/src/m.ts', '// Provenance: ported from somewhere\nexport {};\n');
    w('PROVENANCE.md', prov(''));
    const e = checkProvenance({ root }).errors.join('\n');
    expect(e).toMatch(/vendored file packages\/x\/vendor\/a.js has no PROVENANCE.md row/);
    expect(e).toMatch(/packages\/x\/src\/m.ts carries a Provenance header/);
    w('PROVENANCE.md', prov('| `packages/x/vendor/a.js` | fake | `a.js` | `deadbee` | MIT |\n| `packages/x/src/m.ts` | - | - | - | - |'));
    expect(checkProvenance({ root }).errors.join('\n')).toMatch(/does not match upstream-manifest/);
  });

  it('checks licenses and direct dependency rows', () => {
    const { root, w } = fixture();
    w('package.json', JSON.stringify({ name: 'r', dependencies: { good: '1.0.0' }, devDependencies: { bad: '2.0.0' } }));
    w('package-lock.json', JSON.stringify({ packages: { '': {}, 'node_modules/good': { version: '1.0.0', license: 'MIT' }, 'node_modules/bad': { version: '2.0.0', license: 'AGPL-3.0' }, 'node_modules/none': { version: '1.0.0' } } }));
    w('PROVENANCE.md', '# P\n\n| good | 1.0.0 | MIT | x |\n');
    const e = checkProvenance({ root }).errors.join('\n');
    expect(e).toMatch(/direct dependency bad@2.0.0.*no PROVENANCE.md row/);
    expect(e).toMatch(/bad@2.0.0: license AGPL-3.0 is not on the allowlist/);
    expect(e).toMatch(/none@1.0.0: no license/);
    expect(e).not.toMatch(/good/);
  });

  it('parses SPDX expressions', () => {
    expect(licenseTokens('(MIT OR Apache-2.0)')).toEqual(['MIT', 'Apache-2.0']);
    expect(licenseTokens('MIT AND BSD-3-Clause')).toEqual(['MIT', 'BSD-3-Clause']);
  });

  it('the real repository passes', () => {
    const r = checkProvenance({ root: join(__dirname, '../..') });
    expect(r.errors).toEqual([]);
  });
});
