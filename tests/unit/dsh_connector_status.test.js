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
import { DSH_CONNECTOR_PACKAGE } from "../../electron/dsh_connector.js";
import { CLI_DEFINITIONS, checkAllCliStatus, checkCliStatus } from "../../electron/local_backend_bridge.js";


import { tempRoot, homeDir, userDataDir, makeAppPath, writeProfile, connectorDirOf, installCommandOf } from "./dsh-connector-fixture.js";

describe("checkCliStatus('deepseek-harness')", () => {
  const options = () => ({
    home: homeDir,
    userDataDir,
    platform: "darwin",
    env: { HOME: homeDir, PATH: "" },
    appPaths: [],
  });

  it("is listed as a CLI without a binary name, so the generic lookup skips it", () => {
    expect(CLI_DEFINITIONS["deepseek-harness"]).toMatchObject({
      names: [],
      defaultCmd: "",
      docsUrl: "https://github.com/deepseek-ai/deepseek-harness",
    });
  });

  it("reports not_installed when the app is missing", async () => {
    const status = await checkCliStatus("deepseek-harness", options());
    expect(status).toMatchObject({
      status: "not_installed",
      installed: false,
      authenticated: false,
      ready: false,
      binPath: null,
      loginCmd: "",
    });
    expect(status.reasonKey).toBe("provider.cli.notInstalled");
    expect(status.installCmd).toBe(installCommandOf());
    expect(status.dsh.appInstalled).toBe(false);
    expect(status.dsh.pluginInstalled).toBe(false);
    expect(status.dsh.profiles).toEqual([]);
  });

  it("reports unauthenticated when the app is installed but the plugin is not", async () => {
    const appPath = makeAppPath();
    const status = await checkCliStatus("deepseek-harness", {
      ...options(),
      appPaths: [appPath],
    });
    expect(status.status).toBe("unauthenticated");
    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe(false);
    expect(status.ready).toBe(false);
    expect(status.binPath).toBe(appPath);
    expect(status.reasonKey).toBe("agent.deepseek.pluginMissing");
    expect(status.reason).toContain("VOO");
    expect(status.installCmd).toBe(installCommandOf());
    expect(status.dsh.appInstalled).toBe(true);
    expect(status.dsh.pluginInstalled).toBe(false);
  });

  it("reports ready once the connector is in a profile", async () => {
    const appPath = makeAppPath();
    writeProfile("desktop", {
      packageJson: {
        dependencies: { [DSH_CONNECTOR_PACKAGE]: "link:/opt/voo/connector" },
      },
    });
    const status = await checkCliStatus("deepseek-harness", {
      ...options(),
      appPaths: [appPath],
    });
    expect(status.status).toBe("ready");
    expect(status.ready).toBe(true);
    expect(status.installed).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(status.reasonKey).toBeNull();
    expect(status.reason).toBeNull();
    expect(status.binPath).toBe(appPath);
    expect(status.dsh.pluginInstalled).toBe(true);
  });

  it("does not resolve a `dsh` binary for detection", async () => {
    // A dsh executable on PATH must not change the answer: detection is
    // app-bundle + profile state only, never a spawn path.
    const binDir = path.join(tempRoot, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, "dsh"), "#!/bin/sh\n");
    const status = await checkCliStatus("deepseek-harness", {
      ...options(),
      env: { HOME: homeDir, PATH: binDir },
    });
    expect(status.installed).toBe(false);
    expect(status.binPath).toBeNull();
  });

  it("is included by checkAllCliStatus with the same shape", async () => {
    const appPath = makeAppPath();
    const all = await checkAllCliStatus({
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      appPaths: [appPath],
      searchDirs: [],
    });
    const status = all["deepseek-harness"];
    expect(status).toBeDefined();
    expect(status).toMatchObject({
      status: "unauthenticated",
      installed: true,
      authenticated: false,
      ready: false,
      binPath: appPath,
    });
    expect(status.dsh.connectorDir).toBe(connectorDirOf());
    expect(JSON.parse(JSON.stringify(status))).toEqual(status);
  });
});

