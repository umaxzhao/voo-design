const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { setupUpdater } = require('../../electron/updater.cjs');
const { createCloseGuard } = require('../../electron/close-guard.cjs');

// Execute installed dependency methods without constructing Electron or installers.
function dependencyClass(file, name, native) {
  const exports = {};
  const denied = new Proxy({}, { get(_target, key) { throw new Error(`Unexpected IO: ${String(key)}`); } });
  vm.runInNewContext(fs.readFileSync(require.resolve(`electron-updater/out/${file}`), 'utf8'), {
    exports, setImmediate,
    require(id) {
      if (id === 'events') return { EventEmitter };
      if (id === 'builder-util-runtime') return { CancellationToken: class {}, CancellationError: class extends Error {}, asArray: value => Array.isArray(value) ? value : [value] };
      if (id === './types') return { UPDATE_DOWNLOADED: 'update-downloaded' };
      if (id === './AppUpdater') return { AppUpdater: class {} };
      if (id === 'electron') return { autoUpdater: native };
      if (id === 'path') return path;
      return denied;
    },
  }, { filename: file });
  return exports[name];
}

exports.flush = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
exports.bootUpdateChain = function bootUpdateChain({ kind = 'base', response = 0, dirty = true, installResult = true, startup = Promise.resolve(), bridgeClose = Promise.resolve() } = {}) {
  const events = [];
  const app = new EventEmitter();
  const native = new EventEmitter();
  const updateEvents = new EventEmitter();
  const handlers = new Map();
  const state = { response, dirty, installResult, installError: null, queryError: null, query: null, prompt: null };
  const windowEvents = new Map();
  const win = { isDestroyed: () => false, close: () => events.push('window.close'), on: (name, fn) => windowEvents.set(name, fn),
    webContents: { on: (name, fn) => windowEvents.set(name, fn), send: (_name, status) => events.push(`status:${status.state}`),
      executeJavaScript: async () => { events.push('dirty.query'); if (state.queryError) throw state.queryError; return state.query ? state.query : state.dirty; } } };
  app.isPackaged = true;
  app.getLocale = () => 'en';
  app.quit = () => {
    events.push('app.quit');
    let prevented = false;
    app.emit('before-quit', { preventDefault() { prevented = true; events.push('quit.prevented'); } });
    if (!prevented) { events.push('quit.completed'); app.emit('quit', {}, 0); }
  };
  const dialog = { showMessageBox: async () => { events.push('prompt'); return state.prompt ? state.prompt : { response: state.response }; } };
  const guard = createCloseGuard({ app, dialog, getWindow: () => win });
  guard.attach(win);
  const mainSource = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8');
  const quitBlock = mainSource.slice(mainSource.indexOf('app.on("before-quit",'), mainSource.indexOf('\napp.whenReady().then('));
  vm.runInNewContext(`let cliBridgeQuitComplete = false; let cliBridgeShutdown = null;
    let cliBridgeRetry = null; let cliBridgeStartup = startup;
    let cliBridge = { close: async () => { events.push('bridge.close'); await bridgeClose; } }; ${quitBlock}`,
  { app, closeGuard: guard, startup, bridgeClose, clearTimeout, events, console,
    startDesktopCliBridge: async () => events.push('bridge.restart') });
  native.quitAndInstall = () => { events.push('native.install'); if (state.installError) throw state.installError; };
  native.checkForUpdates = () => { throw new Error('Network forbidden'); };
  native.on('before-quit-for-update', () => events.push('native.before-quit-for-update'));
  const Actual = dependencyClass(kind === 'base' ? 'BaseUpdater.js' : 'MacUpdater.js', kind === 'base' ? 'BaseUpdater' : 'MacUpdater', native);
  const Adapter = dependencyClass('ElectronAppAdapter.js', 'ElectronAppAdapter', native);
  const updater = Object.create(Actual.prototype);
  Object.assign(updater, { app: new Adapter(app), _logger: { info() {}, warn() {} },
    on: updateEvents.on.bind(updateEvents), checkForUpdates: () => Promise.resolve(null),
    autoRunAppAfterInstall: true, quitHandlerAdded: false,
    downloadedUpdateHelper: { file: '/NONEXISTENT-TEST-NO-INSTALL', downloadedFileInfo: {} },
    squirrelDownloadedUpdate: true, closeServerIfExists() { events.push('server.close'); },
    dispatchError(error) { updateEvents.emit('error', error); },
    doInstall() { events.push('install.boundary'); state.installHook?.(); if (state.installError) throw state.installError; return state.installResult; },
  });
  if (kind === 'base') updater.quitAndInstallCalled = false;
  else updater.nativeUpdater = native;
  setupUpdater({ app, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, getWindow: () => win,
    closeGuard: guard, env: {}, loadUpdater: () => updater, logger: { warn: error => events.push(`warn:${error}`) } });
  updateEvents.emit('update-downloaded');
  return { events, state, app, native, guard, updater, updateEvents, handlers, windowEvents,
    install: () => handlers.get('updates:install')(), status: () => handlers.get('updates:status')() };
};

exports.dependencyClass = dependencyClass;
