// The whole surface between the page and the desktop shell. Shared by main.ts and preload.ts.
export type SaveKind = 'mapmaker' | 'png' | 'svg';

export const CHANNELS = { save: 'mapmaker:save', open: 'mapmaker:open', info: 'mapmaker:info' } as const;

export const FILTERS: Record<SaveKind, { name: string; extensions: string[] }> = {
  mapmaker: { name: 'MapMaker world', extensions: ['mapmaker'] },
  png: { name: 'PNG image', extensions: ['png'] },
  svg: { name: 'SVG image', extensions: ['svg'] },
};

export interface DesktopApi {
  /** Native save dialog, then writes `data`. Resolves to the saved path, or null when the user cancelled. */
  saveFile(kind: SaveKind, suggestedName: string, data: Uint8Array): Promise<string | null>;
  /** Native open dialog for a .mapmaker file. Resolves to the file's name and bytes, or null when cancelled. */
  openWorld(): Promise<{ name: string; bytes: Uint8Array } | null>;
  /** App version and platform, for the Diagnostics panel. */
  info(): Promise<{ version: string; platform: string }>;
}
