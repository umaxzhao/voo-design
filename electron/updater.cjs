const { createUpdaterInstallGuard } = require('./updater-install-guard.cjs');
// Kept independent of Electron so offline and development behavior is testable.
function setupUpdater({ app, ipcMain, getWindow, closeGuard, env = process.env, loadUpdater = () => require('electron-updater').autoUpdater, logger = console }) {
  let updater;
  let installGuard;
  let status = null;
  const report = (value) => {
    status = value;
    try {
      const win = getWindow();
      if (win && !win.isDestroyed()) win.webContents.send('updates:status', value);
    } catch { /* Window may have closed while an update was finishing. */ }
  };
  const fail = (error) => {
    installGuard?.fail();
    logger.warn('[updates]', error?.message || String(error));
    report({ state: 'error' });
  };
  ipcMain.handle('updates:status', () => status);
  ipcMain.handle('updates:install', () => {
    if (status?.state !== 'downloaded') return false;
    return installGuard?.install() ?? false;
  });
  if (!app.isPackaged || env.VOO_DISABLE_UPDATES === '1') return;
  try {
    updater = loadUpdater();
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    installGuard = createUpdaterInstallGuard({ updater, closeGuard, reportFailure: fail });
    updater.on('error', fail);
    updater.on('update-available', () => report({ state: 'available' }));
    updater.on('update-downloaded', () => {
      installGuard.downloaded();
      report({ state: 'downloaded' });
    });
    Promise.resolve(updater.checkForUpdates()).then(result => result?.downloadPromise).catch(fail);
  } catch (error) { fail(error); }
}
module.exports = { setupUpdater };
