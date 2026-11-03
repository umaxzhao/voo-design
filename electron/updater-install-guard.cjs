// Explicit installs share one confirmation and keep dependency side effects behind it.
exports.createUpdaterInstallGuard = function createUpdaterInstallGuard({ updater, closeGuard, reportFailure }) {
  let pending = null;
  let current = null;
  let cancelReadiness = null;
  const queuedQuits = [];
  const autoInstallOnAppQuit = updater.autoInstallOnAppQuit;
  const adapter = updater.app;
  if (adapter?.quit) {
    // BaseUpdater queues this adapter call after install(). Keep a per-request
    // permit so recovery cannot accidentally revive an older failed queued quit.
    updater.app = Object.create(adapter, {
      quit: { value: () => {
        const permit = queuedQuits.shift();
        if (permit && !permit.failed) return adapter.quit();
      } },
    });
  }
  function fail() {
    if (!current) return;
    current.failed = true;
    cancelReadiness?.();
    pending = null;
    closeGuard?.reset();
    // A failed explicit installation must not be retried silently on later Quit.
    updater.autoInstallOnAppQuit = false;
  }
  function downloaded() {
    if (pending && current && !current.failed) return;
    pending = null;
    updater.autoInstallOnAppQuit = autoInstallOnAppQuit;
  }
  function nativeReady() {
    if (!updater.nativeUpdater || updater.squirrelDownloadedUpdate !== false) return Promise.resolve(true);
    // The existing Mac background download owns native fetching. Do not call its
    // deferred quitAndInstall branch, which would leave an uncancellable listener.
    return new Promise(resolve => {
      const native = updater.nativeUpdater;
      const finish = ready => {
        native.removeListener('update-downloaded', onReady);
        cancelReadiness = null;
        resolve(ready);
      };
      const onReady = () => finish(true);
      cancelReadiness = () => finish(false);
      native.on('update-downloaded', onReady);
    });
  }
  function install() {
    if (pending) return pending;
    const request = { failed: false };
    current = request;
    pending = Promise.resolve().then(async () => {
      let expectsQuit = false;
      try {
        if (!closeGuard) throw new Error('Update installation requires close confirmation');
        if (request.failed || !await nativeReady() || request.failed) return false;
        if (!await closeGuard.confirm() || request.failed) {
          if (!request.failed) { closeGuard.reset(); pending = null; current = null; }
          return false;
        }
        expectsQuit = !updater.nativeUpdater || updater.autoRunAppAfterInstall === false;
        if (expectsQuit) queuedQuits.push(request);
        const result = await updater.quitAndInstall();
        // BaseUpdater returns void, but clears this flag when install() fails.
        // MacUpdater has no flag and reports native failures through error events.
        if (result === false || updater.quitAndInstallCalled === false) {
          const index = queuedQuits.indexOf(request);
          if (index !== -1) queuedQuits.splice(index, 1);
          throw new Error('Update installation was not started');
        }
        return !request.failed; // Accepted handoff, never installation completion.
      } catch (error) {
        reportFailure(error);
        if (expectsQuit && updater.quitAndInstallCalled !== true) {
          const index = queuedQuits.indexOf(request);
          if (index !== -1) queuedQuits.splice(index, 1);
        }
        return false;
      }
    });
    return pending;
  }
  return { install, fail, downloaded };
};
