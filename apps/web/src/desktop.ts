// The web app runs in a browser (npm run dev) and inside the Electron shell (apps/desktop). In Electron the preload
// exposes window.mapmakerDesktop and files go through native dialogs; in a browser the same calls download or use a file
// input. Callers do not need to know which.
export type SaveKind = 'mapmaker' | 'png' | 'svg';
interface DesktopApi {
  saveFile(kind: SaveKind, suggestedName: string, data: Uint8Array): Promise<string | null>;
  openWorld(): Promise<{ name: string; bytes: Uint8Array } | null>;
  info(): Promise<{ version: string; platform: string }>;
}
declare global { interface Window { mapmakerDesktop?: DesktopApi } }

export const desktop = (): DesktopApi | undefined => window.mapmakerDesktop;

const MIME: Record<SaveKind, string> = { mapmaker: 'application/zip', png: 'image/png', svg: 'image/svg+xml' };

/** Saves a file: a native save dialog in Electron, a download in a browser. Resolves false when the user cancelled. */
export async function saveFile(kind: SaveKind, name: string, data: Uint8Array | string): Promise<boolean> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const d = desktop();
  if (d) return (await d.saveFile(kind, name, bytes)) !== null;
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: MIME[kind] }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
