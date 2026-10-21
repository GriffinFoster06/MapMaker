// Electron main process. Serves the web bundle (dist/web) from the privileged scheme mapmaker://app/ with the COOP/COEP
// headers the engine needs (SharedArrayBuffer, crossOriginIsolated), exactly as the web app's _headers file does.
import { app, BrowserWindow, dialog, ipcMain, net, protocol, screen, shell, type IpcMainInvokeEvent } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHANNELS, FILTERS, type SaveKind } from './ipc';
import { checkForUpdates } from './updates';

const SCHEME = 'mapmaker';
const ORIGIN = `${SCHEME}://app`;
const WEB_ROOT = join(__dirname, 'web');

protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function serveWeb(): void {
  protocol.handle(SCHEME, async (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = normalize(join(WEB_ROOT, rel));
    if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + sep)) return new Response('forbidden', { status: 403 });
    try {
      const res = await net.fetch(pathToFileURL(file).toString());
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(ISOLATION_HEADERS)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    } catch {
      return new Response('not found', { status: 404, headers: ISOLATION_HEADERS });
    }
  });
}

/** Only the app's own page may call the shell. */
function trusted(e: IpcMainInvokeEvent): boolean {
  const u = e.senderFrame?.url ?? '';
  return u === `${ORIGIN}/` || u.startsWith(`${ORIGIN}/?`) || u.startsWith(`${ORIGIN}/#`) || u.startsWith(`${ORIGIN}/index.html`);
}

function registerIpc(getWindow: () => BrowserWindow | undefined): void {
  ipcMain.handle(CHANNELS.save, async (e, kind: SaveKind, suggestedName: string, data: Uint8Array) => {
    if (!trusted(e)) throw new Error('untrusted sender');
    const filter = FILTERS[kind];
    if (!filter || !(data instanceof Uint8Array)) throw new Error('bad save request');
    const win = getWindow();
    const opts = { defaultPath: basename(String(suggestedName)), filters: [filter] };
    const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
    if (r.canceled || !r.filePath) return null;
    await writeFile(r.filePath, data);
    return r.filePath;
  });
  ipcMain.handle(CHANNELS.open, async (e) => {
    if (!trusted(e)) throw new Error('untrusted sender');
    const win = getWindow();
    const opts = { properties: ['openFile' as const], filters: [FILTERS.mapmaker] };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    const p = r.filePaths[0];
    if (r.canceled || !p) return null;
    const buf = await readFile(p);
    return { name: basename(p), bytes: new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength) };
  });
  ipcMain.handle(CHANNELS.info, (e) => {
    if (!trusted(e)) throw new Error('untrusted sender');
    return { version: app.getVersion(), platform: process.platform };
  });
}

// Test modes (never on by default; the normal launch is unchanged). Tests and scripts must never open a window in front of the
// user's work. There are two modes:
//   MAPMAKER_TEST=1        hidden (the default for every test and script): the window is never shown, no Dock icon. It keeps
//                          painting, so webContents.capturePage() and Playwright screenshots work. "Recorded" runs are this mode
//                          plus Playwright video and numbered screenshots saved by the harness (apps/desktop/e2e/session.ts).
//   MAPMAKER_TEST_WATCH=1  watch, only on the user's request: a small window in the bottom-right corner at 40% opacity that clicks
//                          pass through, shown with showInactive() (no keyboard focus).
// Both stop Chromium from throttling a hidden, covered or minimised window, and on macOS use the accessory activation policy.
const TEST_WATCH = process.env['MAPMAKER_TEST_WATCH'] === '1';
const TEST_MODE = TEST_WATCH || process.env['MAPMAKER_TEST'] === '1';
if (TEST_MODE) {
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  // Windows 10/11 computes native occlusion and pauses a covered window's rendering; this turns that off.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}
if (TEST_MODE && process.platform === 'darwin') {
  app.setActivationPolicy('accessory');
  if (!TEST_WATCH) app.dock?.hide();
}

let mainWindow: BrowserWindow | undefined;

const WATCH_W = 560, WATCH_H = 360, WATCH_MARGIN = 16, WATCH_OPACITY = 0.4;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: TEST_WATCH ? WATCH_W : 1400, height: TEST_WATCH ? WATCH_H : 900, minWidth: TEST_WATCH ? 0 : 900, minHeight: TEST_WATCH ? 0 : 600, show: false,
    ...(TEST_WATCH ? { focusable: false, skipTaskbar: true, alwaysOnTop: false } : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Hidden or unfocused test windows must keep rendering (WebGL, rAF).
      ...(TEST_MODE ? { backgroundThrottling: false } : {}),
    },
  });
  // In test mode nothing calls show() or focus(): hidden stays hidden, watch uses showInactive().
  win.once('ready-to-show', () => {
    if (!TEST_MODE) { win.show(); return; }
    if (!TEST_WATCH) return;
    const { workArea } = screen.getPrimaryDisplay();
    win.setBounds({ x: workArea.x + workArea.width - WATCH_W - WATCH_MARGIN, y: workArea.y + workArea.height - WATCH_H - WATCH_MARGIN, width: WATCH_W, height: WATCH_H });
    win.setOpacity(WATCH_OPACITY);
    win.setIgnoreMouseEvents(true);
    win.showInactive();
  });
  // Nothing but the app's own origin loads in the window; links open in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith(ORIGIN + '/')) { ev.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url); } });
  win.webContents.session.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  void win.loadURL(`${ORIGIN}/${process.env['MAPMAKER_QUERY'] ?? ''}`);
  return win;
}

app.whenReady().then(() => {
  serveWeb();
  registerIpc(() => mainWindow);
  mainWindow = createWindow();
  checkForUpdates(mainWindow);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(); });
}).catch((e: unknown) => { console.error(e); app.exit(1); });

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
