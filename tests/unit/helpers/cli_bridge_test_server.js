import { CLI_BRIDGE_CHANNEL } from "../../../src/shared/cli_bridge_protocol.js";
import { registerCliBridgeChannels } from "../../../electron/cli_bridge_server.js";

/** Result the stubbed connect channel answers with (no CLI is started). */
export const STUB_CONNECT_RESULT = Object.freeze({
  ok: true,
  installed: true,
  authenticated: true,
  connected: true,
  ready: true,
  models: [],
});

/**
 * Registers the real bridge channels except `voo:codex-connect`, which would
 * start a real `codex app-server` child process on a machine that has Codex
 * installed (about 1.5 s idle, unbounded under load, and never torn down by a
 * test). Admission (origin/token), framing and every other channel stay real,
 * so the test still measures the bridge round trip only.
 */
export function registerBridgeChannelsWithoutCliSpawn({ ipcMain }) {
  const stubbedIpcMain = {
    ...ipcMain,
    handle(channel, handler) {
      if (channel === CLI_BRIDGE_CHANNEL.CONNECT) {
        ipcMain.handle(channel, async () => ({ ...STUB_CONNECT_RESULT }));
        return;
      }
      ipcMain.handle(channel, handler);
    },
  };
  registerCliBridgeChannels({ ipcMain: stubbedIpcMain });
}
