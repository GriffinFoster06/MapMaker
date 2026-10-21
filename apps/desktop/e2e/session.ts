// Launches the built desktop app for tests and scripts without ever opening a window in front of the user's work.
//   default   hidden window (MAPMAKER_TEST=1). Screenshots come from webContents.capturePage(), which does not depend on the
//             window being visible.
//   record    hidden window plus a Playwright video and a numbered screenshot sequence saved under docs/feedback/<name>/, for the
//             user to watch afterwards.
//   watch     MAPMAKER_TEST_WATCH=1: a small click-through window at 40% opacity in the bottom-right corner, shown with
//             showInactive(). Only when the user asks to watch.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = resolve(APP_DIR, '..', '..');

export interface SessionOptions {
  /** Save a video and numbered screenshots to `<feedbackDir>/<record>/`. */
  record?: string;
  /** Show the small click-through watch window (only on the user's request). */
  watch?: boolean;
  feedbackDir?: string;
  env?: Record<string, string>;
}

export interface Session {
  app: ElectronApplication;
  page: Page;
  /** Full-window PNG through webContents.capturePage() (works hidden, covered or minimised). With `record`, also saved as NN-name.png. */
  shot(name: string, rect?: { x: number; y: number; width: number; height: number }): Promise<Buffer>;
  close(): Promise<void>;
}

/** The PNG of the main window's web contents, as the compositor painted it, whether or not the window is visible. */
export async function capture(app: ElectronApplication, rect?: { x: number; y: number; width: number; height: number }): Promise<Buffer> {
  const b64 = await app.evaluate(async ({ BrowserWindow }, r) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    const img = r ? await win.webContents.capturePage({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }) : await win.webContents.capturePage();
    return img.toPNG().toString('base64');
  }, rect);
  return Buffer.from(b64, 'base64');
}

export async function launchSession(opts: SessionOptions = {}): Promise<Session> {
  const exe = process.env['DESKTOP_EXE'];
  const dir = opts.record ? join(opts.feedbackDir ?? join(REPO, 'docs', 'feedback'), opts.record) : undefined;
  if (dir) mkdirSync(dir, { recursive: true });
  const app = await electron.launch({
    ...(exe ? { executablePath: exe } : { args: [APP_DIR] }),
    env: { ...process.env, MAPMAKER_NO_UPDATE_CHECK: '1', ...(opts.watch ? { MAPMAKER_TEST_WATCH: '1' } : { MAPMAKER_TEST: '1' }), ...opts.env } as Record<string, string>,
    ...(dir ? { recordVideo: { dir, size: { width: 1280, height: 800 } } } : {}),
  });
  const page = await app.firstWindow();
  let n = 0;
  return {
    app, page,
    async shot(name, rect) {
      const png = await capture(app, rect);
      if (dir) writeFileSync(join(dir, `${String(++n).padStart(2, '0')}-${name}.png`), png);
      return png;
    },
    async close() { await app.close(); },
  };
}
