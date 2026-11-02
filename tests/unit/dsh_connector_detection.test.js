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
import { DSH_CONNECTOR_PACKAGE, defaultUserDataDir, readDshStatus } from "../../electron/dsh_connector.js";



import { tempRoot, homeDir, makeAppPath, profileDir, writeProfile, readStatus, connectorDirOf, installCommandOf } from "./dsh-connector-fixture.js";

describe("readDshStatus: what is installed", () => {
  it("reports neither app nor plugin on a clean machine, in a JSON-safe shape", () => {
    const status = readStatus();
    expect(status.appInstalled).toBe(false);
    expect(status.appPath).toBeNull();
    expect(status.pluginInstalled).toBe(false);
    expect(status.profiles).toEqual([]);
    expect(status.connectorDir).toBe(connectorDirOf());
    expect(status.installCommand).toBe(installCommandOf());
    expect(status.targetProfile).toBe("desktop");
    expect(JSON.parse(JSON.stringify(status))).toEqual(status);
  });

  it("detects the harness app even when no DSH profile exists yet", () => {
    const appPath = makeAppPath();
    const status = readStatus({ appPaths: [appPath] });
    expect(status.appInstalled).toBe(true);
    expect(status.appPath).toBe(appPath);
    expect(status.pluginInstalled).toBe(false);
  });

  it("detects the connector from a link: dependency in a profile", () => {
    const appPath = makeAppPath();
    const connectorTarget = path.join(tempRoot, "built-connector");
    writeProfile("desktop", {
      packageJson: {
        name: "dsh-profile-desktop",
        dependencies: { [DSH_CONNECTOR_PACKAGE]: `link:${connectorTarget}` },
      },
    });
    const status = readStatus({ appPaths: [appPath] });
    expect(status.appInstalled).toBe(true);
    expect(status.pluginInstalled).toBe(true);
    expect(status.profiles).toHaveLength(1);
    expect(status.profiles[0]).toMatchObject({
      name: "desktop",
      path: profileDir("desktop"),
      pluginInstalled: true,
      connectorLink: connectorTarget,
    });
  });

  it("detects the connector through node_modules, without a dependency entry", () => {
    const connectorTarget = path.join(tempRoot, "built-connector");
    fs.mkdirSync(connectorTarget, { recursive: true });
    writeProfile("desktop", { nodeModulesTarget: connectorTarget });
    const status = readStatus();
    expect(status.pluginInstalled).toBe(true);
    expect(status.profiles[0].connectorLink).toBe(connectorTarget);
  });

  it("detects the connector from the profile's cordis.patch.yml layer", () => {
    writeProfile("desktop", {
      patch: [
        "- insert:",
        "    - id: mcp-voo",
        "      serverName: voo",
        "",
      ].join("\n"),
    });
    expect(readStatus().pluginInstalled).toBe(true);
  });

  it("treats a bundle listed in dsh.profile.bundles as installed", () => {
    writeProfile("desktop", {
      packageJson: {
        name: "dsh-profile-desktop",
        dsh: { profile: { bundles: [DSH_CONNECTOR_PACKAGE] } },
      },
    });
    expect(readStatus().pluginInstalled).toBe(true);
  });

  it("aggregates several profiles and ignores node_modules", () => {
    writeProfile("desktop", {
      packageJson: {
        dependencies: { [DSH_CONNECTOR_PACKAGE]: "link:/opt/voo/connector" },
      },
    });
    writeProfile("tui", { packageJson: { dependencies: { ws: "8.0.0" } } });
    const nodeModules = path.join(homeDir, ".dsh", "profiles", "node_modules");
    fs.mkdirSync(nodeModules, { recursive: true });

    const status = readStatus();
    expect(status.profiles.map((profile) => profile.name)).toEqual([
      "desktop",
      "tui",
    ]);
    expect(status.profiles[0].pluginInstalled).toBe(true);
    expect(status.profiles[1].pluginInstalled).toBe(false);
    expect(status.pluginInstalled).toBe(true);
  });

  it("re-reads the disk on every call so a fresh install is visible immediately", () => {
    expect(readStatus().pluginInstalled).toBe(false);
    writeProfile("desktop", {
      packageJson: {
        dependencies: { [DSH_CONNECTOR_PACKAGE]: "link:/opt/voo/connector" },
      },
    });
    expect(readStatus().pluginInstalled).toBe(true);
  });

  it("survives unreadable and malformed profiles", () => {
    const dir = profileDir("broken");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), "{ not json");
    fs.writeFileSync(path.join(dir, "cordis.patch.yml"), "");
    const status = readStatus();
    expect(status.profiles).toHaveLength(1);
    expect(status.profiles[0].pluginInstalled).toBe(false);
    expect(status.pluginInstalled).toBe(false);
  });
});

describe("default userData directory probing", () => {
  it("prefers the existing VOO Design directory", () => {
    const appSupport = path.join(homeDir, "Library", "Application Support");
    const vooDesign = path.join(appSupport, "VOO Design");
    fs.mkdirSync(vooDesign, { recursive: true });
    expect(
      defaultUserDataDir({
        home: homeDir,
        platform: "darwin",
        env: { HOME: homeDir },
      }),
    ).toBe(vooDesign);
  });

  it("falls back to a legacy VOO directory, then to VOO Design", () => {
    const appSupport = path.join(homeDir, "Library", "Application Support");
    const legacy = path.join(appSupport, "VOO");
    fs.mkdirSync(legacy, { recursive: true });
    expect(
      defaultUserDataDir({
        home: homeDir,
        platform: "darwin",
        env: { HOME: homeDir },
      }),
    ).toBe(legacy);
    fs.rmSync(legacy, { recursive: true, force: true });
    expect(
      defaultUserDataDir({
        home: homeDir,
        platform: "darwin",
        env: { HOME: homeDir },
      }),
    ).toBe(path.join(appSupport, "VOO Design"));
  });

  it("is what readDshStatus uses when no userDataDir is passed", () => {
    const appSupport = path.join(homeDir, "Library", "Application Support");
    const vooDesign = path.join(appSupport, "VOO Design");
    fs.mkdirSync(vooDesign, { recursive: true });
    const status = readDshStatus({
      home: homeDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      appPaths: [],
    });
    expect(status.connectorDir).toBe(connectorDirOf(vooDesign));
  });

  it("quotes the install command so a path with spaces stays one shell word", () => {
    // The real macOS path is ".../Application Support/VOO Design/...", so an
    // unquoted command would be split by the shell before dsh ever sees it.
    const spacedUserData = path.join(
      tempRoot,
      "Application Support",
      "VOO Design",
    );
    fs.mkdirSync(spacedUserData, { recursive: true });
    const status = readDshStatus({
      home: homeDir,
      userDataDir: spacedUserData,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      appPaths: [],
    });
    const connectorDir = connectorDirOf(spacedUserData);
    expect(connectorDir).toContain(" ");
    expect(status.installCommand).toBe(installCommandOf("desktop", connectorDir));
    // One double-quoted shell word wraps the whole `link:<dir>` spec.
    expect(status.installCommand).toContain(`"link:${connectorDir}"`);
    expect(status.installCommand).not.toContain('""');
  });
});

