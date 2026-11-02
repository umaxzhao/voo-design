import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.useRealTimers());

describe('packaged smoke with a fresh profile', () => {
  it.each([
    { title: 'Back to canvas', dismiss: true },
    { title: '返回画布', dismiss: true },
    { title: 'Back to canvas', dismiss: false },
  ])('checks canvas visibility ($title, dialog dismisses: $dismiss)', async ({ title, dismiss }) => {
    vi.useFakeTimers();
    let firstRunOpen = true;
    let welcomeOpen = true;
    const loadDependency = vi.fn(name => {
      if (name === 'electron-updater') return { autoUpdater: { checkForUpdates() {} } };
      if (name === 'ws') return { WebSocketServer() {} };
      if (name === 'node:path') return path;
      if (name === 'node:fs') return { mkdirSync() {}, writeFileSync: saveScreenshot };
      throw new Error(`Unexpected dependency: ${name}`);
    });
    const saveScreenshot = vi.fn();
    const canvas = { width: 100, height: 100, getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 100 }) };
    const document = {
      querySelector(selector) {
        if (selector.includes('first-run-onboarding') && firstRunOpen) return {
          closest: () => ({ dispatchEvent: event => { if (event.type === 'cancel' && dismiss) firstRunOpen = false; } }),
        };
        if (selector.includes(`title="${title}"`)) return { click: () => { welcomeOpen = false; } };
        return null;
      },
      querySelectorAll: selector => selector === 'canvas' ? [canvas] : [{}, {}, {}],
      elementFromPoint: () => firstRunOpen || welcomeOpen ? {} : canvas,
    };
    class Event { constructor(type) { this.type = type; } }
    const renderer = { document, Event, CustomEvent: Event, KeyboardEvent: Event, window: { dispatchEvent() {} } };
    let didFinishLoad;
    const wc = {
      on() {},
      once: (_event, callback) => { didFinishLoad = callback; },
      executeJavaScript: async source => vm.runInNewContext(source, renderer),
      capturePage: async () => ({ toPNG: () => Buffer.from('screenshot') }),
    };
    const app = { isPackaged: true, exit: vi.fn() };
    const context = {
      module: { exports: {} }, require: loadDependency,
      process: { env: { VOO_PACKAGED_SMOKE: '1', VOO_SMOKE_SCREENSHOT: '/tmp/smoke.png' } },
      console: { log: vi.fn(), error: vi.fn() }, setTimeout, clearTimeout,
    };
    vm.runInNewContext(readFileSync('electron/packaged_smoke.cjs', 'utf8'), context);
    context.module.exports(app, { webContents: wc });
    const completed = didFinishLoad();
    await vi.advanceTimersByTimeAsync(6000);
    await completed;
    if (dismiss) expect(context.console.error.mock.calls).toEqual([]);
    else expect(context.console.error.mock.calls[0][1].message).toMatch(/covered or invisible/);
    expect(app.exit).toHaveBeenCalledWith(dismiss ? 0 : 1);
    expect(firstRunOpen).toBe(!dismiss);
    expect(welcomeOpen).toBe(false);
    expect(saveScreenshot).toHaveBeenCalledWith('/tmp/smoke.png', expect.any(Buffer));
    expect(loadDependency).toHaveBeenCalledWith('electron-updater');
    expect(loadDependency).toHaveBeenCalledWith('ws');
  });
});
