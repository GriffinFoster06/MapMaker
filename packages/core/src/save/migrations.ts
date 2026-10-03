// Save-format migrations (ARCHITECTURE §5). Each entry upgrades the raw file map from one format version to the next.
// Empty at v0.1.0: there is nothing older to migrate.
export type FileMap = Map<string, Uint8Array>;
export type Migration = (files: FileMap) => FileMap;

export const FORMAT_VERSION = '0.1.0';

/** keyed by the version being migrated FROM; the result is the next version in `chain`. */
export const migrations: Record<string, { to: string; run: Migration }> = {};

export function migrateToCurrent(from: string, files: FileMap): FileMap {
  let v = from;
  let guard = 0;
  while (v !== FORMAT_VERSION) {
    const m = migrations[v];
    if (!m) throw new Error(`no migration path from format ${v} to ${FORMAT_VERSION}`);
    files = m.run(files);
    v = m.to;
    if (++guard > 100) throw new Error('migration loop');
  }
  return files;
}
