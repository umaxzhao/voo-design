/**
 * Renderer IPC for web image generation.
 *
 * One extension bridge per app process. Progress is pushed to the window
 * that asked; cancel aborts the wait on this side (the Chrome tab stays
 * open so a sign-in in progress is not thrown away).
 */

import ExtensionBridge from "./extension_bridge.js";
import { ensureChrome } from "./chrome-launcher.js";
import { createWebImageService } from "./web_image_service.js";

export function registerWebImageIpc(ipcMain, { getWindow, bridge, service } = {}) {
  const relays = new Set();
  const link = bridge ?? new ExtensionBridge({
    onRelay: (name, payload) => {
      for (const listener of relays) listener(name, payload);
    },
  });
  if (!bridge) link.start();

  const imageService = service ?? createWebImageService({
    ensureChrome,
    bridge: link,
    subscribeRelay: (listener) => {
      relays.add(listener);
      return () => relays.delete(listener);
    },
    onProgress: (event) => {
      const win = getWindow?.();
      if (win && !win.isDestroyed?.()) {
        win.webContents.send("webImage:progress", event);
      }
    },
  });

  ipcMain.handle("webImage:generate", async (_event, args) => {
    try {
      return await imageService.generate(args ?? {});
    } catch (error) {
      return {
        ok: false,
        code: error?.code || "generic",
        error: error?.message || error?.code || "generic",
      };
    }
  });

  ipcMain.handle("webImage:cancel", async (_event, jobId) => imageService.cancel(jobId));

  return { bridge: link, service: imageService };
}
