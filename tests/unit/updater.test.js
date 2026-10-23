import { createRequire } from 'node:module';
import { describe, it, expect, vi } from 'vitest';
const { setupUpdater } = createRequire(import.meta.url)('../../electron/updater.cjs');
function context(packaged = true) {
  return { app: { isPackaged: packaged }, ipcMain: { handle: vi.fn() }, getWindow: () => null, env: {}, logger: { warn: vi.fn() }, loadUpdater: vi.fn() };
}
describe('offline-safe updater', () => {
  it('does not load or check in development or when disabled', () => {
    for (const options of [context(false), { ...context(), env: { VOO_DISABLE_UPDATES: '1' } }]) {
      setupUpdater(options); expect(options.loadUpdater).not.toHaveBeenCalled();
    }
  });
  it('swallows asynchronous offline errors', async () => {
    const options = context();
    const updater = { on: vi.fn(), checkForUpdates: vi.fn().mockRejectedValue(new Error('offline')) };
    options.loadUpdater.mockReturnValue(updater);
    setupUpdater(options);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(options.logger.warn).toHaveBeenCalledWith('[updates]', 'offline');
    expect(updater.autoDownload).toBe(true); expect(updater.autoInstallOnAppQuit).toBe(true);
  });
  it('swallows initialization errors and forwards events, installing only when ready', () => {
    const options = context(); options.loadUpdater.mockImplementation(() => { throw new Error('offline'); });
    expect(() => setupUpdater(options)).not.toThrow();
    const next = context(); const handlers = {}; const events = {};
    next.ipcMain.handle.mockImplementation((name, handler) => { handlers[name] = handler; });
    const send = vi.fn(); next.getWindow = () => ({ isDestroyed: () => false, webContents: { send } });
    const updater = { on: (name, fn) => { events[name] = fn; }, checkForUpdates: () => null, quitAndInstall: vi.fn() };
    next.loadUpdater.mockReturnValue(updater); setupUpdater(next);
    expect(handlers['updates:install']()).toBe(false);
    events['update-available'](); expect(send).toHaveBeenCalledWith('updates:status', { state: 'available' });
    events['update-downloaded'](); expect(handlers['updates:install']()).toBe(true);
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
    events.error(new Error('offline')); expect(handlers['updates:status']()).toEqual({ state: 'error' });
  });
});
