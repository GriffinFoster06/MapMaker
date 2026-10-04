// Provenance checker (ARCHITECTURE §7 Phase 3). Original shell code.
//  1. Every file under packages/*/vendor/ has a PROVENANCE.md row naming its upstream repo, path and commit; the
//     commit matches upstream-manifest.json, and (when upstream/ is present) the bytes match `git show commit:path`.
//  2. Every source file with a `// Provenance:` header has a PROVENANCE.md row.
//  3. Every file copied from an npm package matches that package's file in node_modules and has a row.
//  4. Every direct npm dependency has a row with its installed version and license; every package in the lockfile
//     has a license on the GPL-3.0-only-compatible allowlist.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LICENSE_ALLOWLIST = new Set([
  'MIT', 'MIT-0', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Apache-2.0', 'BlueOak-1.0.0', 'CC0-1.0', 'Unlicense',
  'Python-2.0', 'CC-BY-4.0', 'GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later', 'LGPL-3.0', 'LGPL-3.0-only', 'LGPL-3.0-or-later',
  'MPL-2.0', 'Zlib', 'WTFPL',
]);

export interface CheckOptions {
  root: string;
  /** Skip content comparison against upstream/ (set when it is absent). */
  upstreamDir?: string;
}
export interface CheckResult { errors: string[]; notes: string[] }

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-types', '.git', '.tools', 'upstream', 'spikes', 'audit', 'test-results', 'playwright-report', 'coverage']);

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p); else yield p;
  }
}

const posix = (p: string) => p.split(sep).join('/');

export function licenseTokens(expr: string): string[] {
  return expr.replace(/[()]/g, ' ').split(/\s+(?:AND|OR|WITH)\s+|\s+/).map((t) => t.trim()).filter((t) => t && !['AND', 'OR', 'WITH'].includes(t));
}

interface PkgJson { name?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }
interface Lock { packages: Record<string, { version?: string; license?: string; link?: boolean }> }

export function checkProvenance(opts: CheckOptions): CheckResult {
  const { root } = opts;
  const errors: string[] = [], notes: string[] = [];
  const provPath = join(root, 'PROVENANCE.md');
  if (!existsSync(provPath)) return { errors: ['PROVENANCE.md missing'], notes };
  const rows = readFileSync(provPath, 'utf8').split('\n').filter((l) => l.trimStart().startsWith('|'));
  const rowFor = (needle: string) => rows.find((r) => r.includes('`' + needle + '`'));

  // Source files: vendored, header-marked, npm-copied.
  const all = [...walk(root)].map((p) => posix(relative(root, p)));
  const manifestPath = join(root, 'upstream-manifest.json');
  const manifest = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as { repos: { name: string; commit: string }[] }) : { repos: [] };
  const upstreamDir = opts.upstreamDir ?? join(root, 'upstream');

  let vendored = 0;
  for (const f of all.filter((p) => /^packages\/[^/]+\/vendor\//.test(p))) {
    vendored++;
    const row = rowFor(f);
    if (!row) { errors.push(`vendored file ${f} has no PROVENANCE.md row`); continue; }
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    // | `path` | repo | upstream path | commit | license |
    const [, repo, upPathCell, commitCell] = cells;
    const upPath = upPathCell?.replace(/`/g, '');
    const commit = commitCell?.replace(/`/g, '');
    const m = manifest.repos.find((r) => r.name === repo);
    if (!m) { errors.push(`${f}: repo ${repo} is not in upstream-manifest.json`); continue; }
    if (!commit || !m.commit.startsWith(commit)) { errors.push(`${f}: commit ${commit} does not match upstream-manifest.json (${m.commit.slice(0, 7)})`); continue; }
    if (existsSync(join(upstreamDir, repo!))) {
      try {
        const want = execFileSync('git', ['-C', join(upstreamDir, repo!), 'show', `${m.commit}:${upPath}`], { maxBuffer: 1 << 28 });
        if (!want.equals(readFileSync(join(root, f)))) errors.push(`${f}: differs from ${repo}@${commit}:${upPath} (vendored files must be verbatim)`);
      } catch (e) { errors.push(`${f}: cannot read ${repo}@${commit}:${upPath}: ${(e as Error).message.split('\n')[0]}`); }
    } else notes.push(`upstream/${repo} absent: ${f} not compared byte-for-byte`);
  }
  notes.push(`${vendored} vendored file(s) checked`);

  let headers = 0;
  for (const f of all.filter((p) => /\.(ts|js|mjs)$/.test(p) && !p.startsWith('apps/web/public/') && !/\/vendor\//.test(p))) {
    const head = readFileSync(join(root, f), 'utf8').split('\n').slice(0, 5).join('\n');
    if (/^\/\/ Provenance:/m.test(head)) {
      headers++;
      if (!rowFor(f)) errors.push(`${f} carries a Provenance header but has no PROVENANCE.md row`);
    }
  }
  notes.push(`${headers} file(s) with Provenance headers checked`);

  // npm-copied files: | `path` | `package@version` | `file in package` | license |
  for (const row of rows) {
    const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
    const m = /^`([^`]+)`$/.exec(cells[0] ?? '');
    const pk = /^`([^`@]+)@([^`]+)`$/.exec(cells[1] ?? '');
    const file = /^`([^`]+)`$/.exec(cells[2] ?? '');
    if (!m || !pk || !file || !m[1]!.startsWith('apps/')) continue;
    const src = join(root, 'node_modules', pk[1]!, file[1]!);
    if (!existsSync(join(root, m[1]!))) { errors.push(`${m[1]} listed in PROVENANCE.md but missing`); continue; }
    if (!existsSync(src)) { errors.push(`${m[1]}: ${pk[1]}/${file[1]} not installed, cannot verify`); continue; }
    if (!readFileSync(src).equals(readFileSync(join(root, m[1]!)))) errors.push(`${m[1]} differs from ${pk[1]}@${pk[2]}/${file[1]}`);
    const ver = (JSON.parse(readFileSync(join(root, 'node_modules', pk[1]!, 'package.json'), 'utf8')) as { version: string }).version;
    if (ver !== pk[2]) errors.push(`${m[1]}: PROVENANCE says ${pk[1]}@${pk[2]} but ${ver} is installed`);
  }
  for (const f of all.filter((p) => p.startsWith('apps/web/public/') && p.endsWith('.js'))) {
    if (!rowFor(f)) errors.push(`${f} has no PROVENANCE.md row (files in apps/*/public must be logged)`);
  }

  // Dependencies.
  const lockPath = join(root, 'package-lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8')) as Lock;
    const direct = new Map<string, string>();
    const pkgFiles = ['package.json', ...all.filter((p) => /^(apps|packages|tools)\/[^/]+\/package\.json$/.test(p))];
    for (const pf of pkgFiles) {
      const j = JSON.parse(readFileSync(join(root, pf), 'utf8')) as PkgJson;
      for (const n of Object.keys({ ...j.dependencies, ...j.devDependencies })) if (!n.startsWith('@mapmaker/')) direct.set(n, pf);
    }
    for (const [name, pf] of [...direct].sort()) {
      const e = lock.packages[`node_modules/${name}`];
      if (!e?.version) { errors.push(`${name} (${pf}) is not in package-lock.json`); continue; }
      const row = rows.find((r) => r.includes('`' + name + '`') || new RegExp(`\\|\\s*${name.replace(/[/@.]/g, '\\$&')}\\s*\\|`).test(r));
      if (!row) errors.push(`direct dependency ${name}@${e.version} (${pf}) has no PROVENANCE.md row`);
      else {
        if (!row.includes(e.version)) errors.push(`${name}: PROVENANCE.md row does not list installed version ${e.version}`);
        if (e.license && !row.includes(e.license)) errors.push(`${name}: PROVENANCE.md row does not list license ${e.license}`);
      }
    }
    let checked = 0;
    for (const [path, e] of Object.entries(lock.packages)) {
      if (!path.startsWith('node_modules/') || e.link) continue;
      checked++;
      const name = path.replace(/^.*node_modules\//, '');
      if (!e.license) { errors.push(`${name}@${e.version}: no license in package-lock.json`); continue; }
      const bad = licenseTokens(e.license).filter((t) => !LICENSE_ALLOWLIST.has(t));
      if (bad.length) errors.push(`${name}@${e.version}: license ${e.license} is not on the allowlist (${bad.join(', ')})`);
    }
    notes.push(`${direct.size} direct and ${checked} total npm packages checked`);
  } else errors.push('package-lock.json missing');

  return { errors, notes };
}

/** Markdown rows for direct dependencies, for pasting into PROVENANCE.md. */
export function printDepRows(root: string): string {
  const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as Lock;
  const out: string[] = [];
  const seen = new Map<string, { dev: boolean }>();
  for (const pf of ['package.json', ...[...walk(root)].map((p) => posix(relative(root, p))).filter((p) => /^(apps|packages|tools)\/[^/]+\/package\.json$/.test(p))]) {
    const j = JSON.parse(readFileSync(join(root, pf), 'utf8')) as PkgJson;
    for (const n of Object.keys(j.dependencies ?? {})) if (!n.startsWith('@mapmaker/')) seen.set(n, { dev: seen.get(n)?.dev === false ? false : false });
    for (const n of Object.keys(j.devDependencies ?? {})) if (!n.startsWith('@mapmaker/') && !seen.has(n)) seen.set(n, { dev: true });
  }
  for (const [n, { dev }] of [...seen].sort()) {
    const e = lock.packages[`node_modules/${n}`]!;
    out.push(`${dev ? 'dev' : 'runtime'} | ${n} | ${e.version} | ${e.license ?? '?'}`);
  }
  return out.join('\n');
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  if (process.argv.includes('--print-deps')) { console.log(printDepRows(root)); process.exit(0); }
  const r = checkProvenance({ root });
  for (const n of r.notes) console.log(`note: ${n}`);
  for (const e of r.errors) console.error(`error: ${e}`);
  console.log(r.errors.length ? `provenance check FAILED (${r.errors.length})` : 'provenance check passed');
  process.exit(r.errors.length ? 1 : 0);
}
