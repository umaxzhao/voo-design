/**
 * DeepSeek Harness detection and one-click installation.
 *
 * The fixture is a throwaway HOME plus a throwaway "Applications" directory:
 * the harness app, every DSH profile and the connector build destination all
 * live inside one temp root, so nothing here reads or writes the developer's
 * real `~/.dsh` or `~/Library/Application Support/VOO*`.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";

import path from "node:path";
import { findDshBinary } from "../../electron/dsh_connector.js";
import { registerLocalCliIpc } from "../../electron/local_backend_bridge.js";
import { CLI_BRIDGE_CHANNEL } from "../../src/shared/cli_bridge_protocol.js";

import { tempRoot, homeDir, userDataDir, makeAppPath, connectorDirOf, installCommandOf } from "./dsh-connector-fixture.js";

describe("findDshBinary", () => {
  it("finds a standalone dsh on PATH first", () => {
    const binDir = path.join(tempRoot, "path-bin");
    fs.mkdirSync(binDir, { recursive: true });
    const standalone = path.join(binDir, "dsh");
    fs.writeFileSync(standalone, "#!/bin/sh\n");
    expect(
      findDshBinary({
        home: homeDir,
        platform: "darwin",
        env: { HOME: homeDir, PATH: binDir },
        appPaths: [],
      }),
    ).toBe(standalone);
  });

  it("falls back to the desktop app's bundled launcher", () => {
    const appPath = makeAppPath();
    const launcher = path.join(
      appPath,
      "Contents",
      "Resources",
      "runtime",
      "cli",
      "bin",
      "dsh",
    );
    fs.mkdirSync(path.dirname(launcher), { recursive: true });
    fs.writeFileSync(launcher, "#!/bin/sh\n");
    expect(
      findDshBinary({
        home: homeDir,
        platform: "darwin",
        env: { HOME: homeDir, PATH: "" },
        appPaths: [appPath],
      }),
    ).toBe(launcher);
  });

  it("returns null when nothing is installed", () => {
    expect(
      findDshBinary({
        home: homeDir,
        platform: "darwin",
        env: { HOME: homeDir, PATH: "" },
        appPaths: [],
        searchDirs: [],
      }),
    ).toBeNull();
  });
});

describe("IPC + loopback bridge wiring", () => {
  function fakeIpcMain() {
    const handlers = new Map();
    return {
      handlers,
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
      removeHandler(channel) {
        handlers.delete(channel);
      },
    };
  }

  function register({ isAuthorized = () => true, appPath } = {}) {
    const ipcMain = fakeIpcMain();
    const app = {
      getPath: (name) => (name === "userData" ? userDataDir : undefined),
      getAppPath: () => appPath || tempRoot,
      once: () => {},
    };
    const registration = registerLocalCliIpc(ipcMain, { app, isAuthorized });
    return { ipcMain, registration };
  }

  it("exposes the two connector channels", () => {
    expect(CLI_BRIDGE_CHANNEL.DSH_STATUS).toBe("voo:dsh-connector-status");
    expect(CLI_BRIDGE_CHANNEL.DSH_INSTALL).toBe("voo:dsh-connector-install");
  });

  it("injects Electron's userData directory into check-all", async () => {
    const appPath = makeAppPath();
    const { ipcMain, registration } = register();
    try {
      const status = await ipcMain.handlers.get(CLI_BRIDGE_CHANNEL.DSH_STATUS)(
        {},
        {},
      );
      expect(status.connectorDir).toBe(connectorDirOf());
      expect(status.installCommand).toBe(installCommandOf());

      const all = await ipcMain.handlers.get(CLI_BRIDGE_CHANNEL.CHECK_ALL)(
        {},
        { env: { HOME: homeDir, PATH: "" }, appPaths: [appPath] },
      );
      // The app path passed through, but userData comes from app.getPath.
      expect(all["deepseek-harness"].dsh.connectorDir).toBe(connectorDirOf());
      expect(all["deepseek-harness"].dsh.appPath).toBe(appPath);
    } finally {
      await registration.dispose();
    }
  });

  it("refuses an install from an unauthorized sender", async () => {
    const { ipcMain, registration } = register({ isAuthorized: () => false });
    try {
      const result = await ipcMain.handlers.get(CLI_BRIDGE_CHANNEL.DSH_INSTALL)(
        {},
        {},
      );
      expect(result).toEqual({ ok: false, code: "cli.unauthorizedSender" });
    } finally {
      await registration.dispose();
    }
  });

  it("resolves the repo root on the main side, not from the caller", async () => {
    const previous = process.env.VOO_REPO_ROOT;
    delete process.env.VOO_REPO_ROOT;
    const { ipcMain, registration } = register();
    try {
      const result = await ipcMain.handlers.get(CLI_BRIDGE_CHANNEL.DSH_INSTALL)(
        {},
        { repoRoot: "/", userDataDir: "/" },
      );
      // No builder under the fake app path, so it reports the build failure
      // instead of importing anything the caller named.
      expect(result.ok).toBe(false);
      expect(result.code).toBe("connectorBuildUnavailable");
      expect(result.connectorPath).toBe(connectorDirOf());
    } finally {
      if (previous === undefined) delete process.env.VOO_REPO_ROOT;
      else process.env.VOO_REPO_ROOT = previous;
      await registration.dispose();
    }
  });
});
