const { closeMessages } = require("./native-messages.cjs");

/** Share the decision for window-close and application-quit; cancellation
 * must happen before process/service disposal, never after it. */
exports.createCloseGuard = function createCloseGuard({ app, dialog, getWindow }) {
  let pending = null;
  let approvedWindow = null;
  function confirm() {
    const win = getWindow();
    if (!win || win.isDestroyed()) return Promise.resolve(true);
    if (approvedWindow === win) return Promise.resolve(true);
    if (pending) return pending;
    pending = (async () => {
      const dirty = await win.webContents.executeJavaScript(
        "!window.dispatchEvent(new Event('beforeunload', { cancelable: true }))",
      );
      if (dirty) {
        const text = closeMessages(app.getLocale?.() ?? "en");
        const { response } = await dialog.showMessageBox(win, { type: "question",
          title: text.title, message: text.message, detail: text.detail,
          buttons: [text.keep, text.discard], defaultId: 0, cancelId: 0, noLink: true,
        });
        if (response !== 1) return false;
      }
      approvedWindow = win;
      return true;
    })().finally(() => { pending = null; });
    return pending;
  }
  function attach(win) {
    win.webContents.on("will-prevent-unload", event => {
      // Electron requires an explicit override after the native discard choice.
      if (approvedWindow === win) event.preventDefault();
    });
    win.on("close", event => {
      if (approvedWindow === win) return;
      event.preventDefault();
      confirm().then(allowed => {
        if (allowed && !win.isDestroyed()) win.close();
      }).catch(error => console.error("[electron] Close confirmation failed:", error));
    });
  }
  return { confirm, attach };
};
