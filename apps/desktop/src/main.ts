// Electron main process. Serves the web bundle (dist/web) from the privileged scheme mapmaker://app/ with the COOP/COEP
// headers the engine needs (SharedArrayBuffer, crossOriginIsolated), exactly as the web app's _headers file does.
import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell, type IpcMainInvokeEvent } from 'electron';
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

let mainWindow: BrowserWindow | undefined;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600, show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.once('ready-to-show', () => win.show());
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
