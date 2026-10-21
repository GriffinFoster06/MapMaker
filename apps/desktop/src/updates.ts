// Update check against GitHub Releases (docs/RELEASING.md, decision E2). Nothing is signed, so the behaviour is "check,
// tell the user, let them choose":
//  - Windows (unsigned NSIS): electron-updater can download and install an unsigned update, so we offer that.
//  - macOS (unsigned, not notarized): Squirrel.Mac refuses to install an update into an unsigned app, so we only
//    open the release page for a manual download.
// Never downloads or installs without the user's yes. Failures (offline, no release yet) are silent.
import { app, dialog, shell, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';

const RELEASES = 'https://github.com/GriffinFoster06/MapMaker/releases/latest';

export function checkForUpdates(win: BrowserWindow): void {
  if (!app.isPackaged || process.env['MAPMAKER_NO_UPDATE_CHECK']) return;
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('update-available', (info) => {
    void (async () => {
      const canInstall = process.platform === 'win32';
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        message: `MapMaker ${info.version} is available`,
        detail: `You have ${app.getVersion()}. ` + (canInstall ? 'Download and install it now?' : 'Open the download page? (This build is not signed, so macOS cannot install updates by itself.)'),
        buttons: [canInstall ? 'Download and install' : 'Open download page', 'Later'],
        defaultId: 0, cancelId: 1,
      });
      if (response !== 0) return;
      if (!canInstall) { await shell.openExternal(RELEASES); return; }
      autoUpdater.once('update-downloaded', () => { autoUpdater.quitAndInstall(); });
      await autoUpdater.downloadUpdate();
    })().catch(() => { /* offline or release removed: stay quiet */ });
  });
  autoUpdater.on('error', () => { /* no release yet, offline, or rate limited */ });
  void autoUpdater.checkForUpdates().catch(() => undefined);
}
