import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { setupUpdater } = require('../../electron/updater.cjs');
const { dependencyClass, flush } = require('./updater-chain-fixture.cjs');

function recoveryFixture() {
  const Actual = dependencyClass('AppUpdater.js', 'AppUpdater', {});
  const updater = Object.create(Actual.prototype);
  EventEmitter.call(updater);
  const handlers = new Map();
  const checks = [];
  const downloads = [];
  Object.assign(updater, {
    app: { isPackaged: true }, currentVersion: { format: () => '1.0.0' },
    _logger: { info() {}, warn() {} }, checkForUpdatesPromise: null, downloadPromise: null,
    getUpdateInfoAndProvider: async () => {
      checks.push('check');
      return { info: { version: '1.0.1', files: [{ url: 'ISOLATED-NO-FEED' }] }, provider: {} };
    },
    isUpdateAvailable: async () => true, computeRequestHeaders: () => ({}),
    doDownloadUpdate: vi.fn(async () => { downloads.push('download-boundary'); throw new Error('offline download'); }),
    quitAndInstall: vi.fn(),
  });
  const warn = vi.fn();
  setupUpdater({ app: { isPackaged: true }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
    getWindow: () => null, closeGuard: { confirm: async () => false, reset() {} },
    env: {}, loadUpdater: () => updater, logger: { warn } });
  return { updater, handlers, checks, downloads, warn };
}

describe('existing update check/download recovery without a new retry entry', () => {
  it('observes rejected background download, clears real cached promises, and permits another check/download', async () => {
    const f = recoveryFixture(); await flush();
    expect(f.handlers.get('updates:status')()).toEqual({ state: 'error' });
    expect(f.warn).toHaveBeenCalled(); expect(f.updater.downloadPromise).toBe(null);
    expect(f.updater.checkForUpdatesPromise).toBe(null);
    expect(f.updater.autoDownload).toBe(true); expect(f.updater.autoInstallOnAppQuit).toBe(true);
    f.updater.doDownloadUpdate.mockImplementationOnce(async () => {
      f.downloads.push('recovered-download-boundary'); f.updater.dispatchUpdateDownloaded({ version: '1.0.1' });
      return ['/ISOLATED-NO-DOWNLOAD'];
    });
    const result = await f.updater.checkForUpdates();
    expect(await result.downloadPromise).toEqual(['/ISOLATED-NO-DOWNLOAD']);
    expect(f.checks).toHaveLength(2); expect(f.downloads).toHaveLength(2);
    expect(f.handlers.get('updates:status')()).toEqual({ state: 'downloaded' });
    expect(f.updater.quitAndInstall).not.toHaveBeenCalled();
    expect([...f.handlers.keys()].sort()).toEqual(['updates:install', 'updates:status']);
  });
  it('deduplicates real check promises and recovers after check rejection', async () => {
    const f = recoveryFixture(); await flush();
    let reject; f.updater.getUpdateInfoAndProvider = () => new Promise((_resolve, fail) => { reject = fail; });
    const first = f.updater.checkForUpdates(); const second = f.updater.checkForUpdates();
    expect(second).toBe(first); reject(new Error('check offline'));
    await expect(first).rejects.toThrow('check offline');
    expect(f.updater.checkForUpdatesPromise).toBe(null);
    f.updater.getUpdateInfoAndProvider = async () => ({ info: { version: '1.0.1', files: [] }, provider: {} });
    f.updater.autoDownload = false;
    expect((await f.updater.checkForUpdates()).isUpdateAvailable).toBe(true);
  });
});
