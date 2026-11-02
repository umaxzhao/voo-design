/**
 * DeepSeek Harness detection and one-click installation.
 *
 * The fixture is a throwaway HOME plus a throwaway "Applications" directory:
 * the harness app, every DSH profile and the connector build destination all
 * live inside one temp root, so nothing here reads or writes the developer's
 * real `~/.dsh` or `~/Library/Application Support/VOO*`.
 */

import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";

import path from "node:path";
import { installDshConnector } from "../../electron/dsh_connector.js";



import { tempRoot, homeDir, userDataDir, writeProfile, connectorDirOf, installCommandOf, makeFakeRepo } from "./dsh-connector-fixture.js";

describe("installDshConnector", () => {
  it("builds the connector, then runs dsh plugin add link:<dir>", async () => {
    const repoDir = makeFakeRepo();
    writeProfile("desktop", { packageJson: { name: "dsh-profile-desktop" } });
    const exec = vi.fn(async () => ({
      code: 0,
      stdout: "added 1 package",
      stderr: "",
    }));

    const result = await installDshConnector({
      repoRoot: repoDir,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec,
      findBinary: () => "/fake/bin/dsh",
    });

    expect(result.ok).toBe(true);
    expect(result.connectorPath).toBe(connectorDirOf());
    expect(result.command).toBe(installCommandOf());
    expect(result.output).toContain("added 1 package");
    // The builder wrote its files into the connector directory.
    expect(fs.existsSync(path.join(connectorDirOf(), "package.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(connectorDirOf(), "cordis.patch.yml")),
    ).toBe(true);

    expect(exec).toHaveBeenCalledTimes(1);
    const [bin, args] = exec.mock.calls[0];
    expect(bin).toBe("/fake/bin/dsh");
    expect(args).toEqual([
      "plugin",
      "--profile",
      "desktop",
      "add",
      `link:${connectorDirOf()}`,
    ]);
  });

  it("replaces a stale connector directory instead of failing the build", async () => {
    const repoDir = makeFakeRepo();
    fs.mkdirSync(connectorDirOf(), { recursive: true });
    fs.writeFileSync(path.join(connectorDirOf(), "stale.txt"), "old");
    const result = await installDshConnector({
      repoRoot: repoDir,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec: async () => ({ code: 0 }),
      findBinary: () => "/fake/bin/dsh",
    });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(connectorDirOf(), "stale.txt"))).toBe(false);
  });

  it("targets the only existing profile when it is not `desktop`", async () => {
    const repoDir = makeFakeRepo();
    writeProfile("tui", { packageJson: { name: "dsh-profile-tui" } });
    const exec = vi.fn(async () => ({ code: 0 }));
    await installDshConnector({
      repoRoot: repoDir,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec,
      findBinary: () => "/fake/bin/dsh",
    });
    expect(exec.mock.calls[0][1]).toEqual([
      "plugin",
      "--profile",
      "tui",
      "add",
      `link:${connectorDirOf()}`,
    ]);
  });

  it("falls back to the bare pnpm-forward form when the CLI rejects --profile", async () => {
    const repoDir = makeFakeRepo();
    // The bundled 0.2.1-rc.3 CLI requires --profile; a future build may not
    // know the flag. The install must survive that rather than fail outright.
    const exec = vi.fn(async (_bin, args) =>
      args.includes("--profile")
        ? { code: 1, stderr: "error: unknown option '--profile'" }
        : { code: 0, stdout: "linked" },
    );
    const result = await installDshConnector({
      repoRoot: repoDir,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec,
      findBinary: () => "/fake/bin/dsh",
    });
    expect(result.ok).toBe(true);
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec.mock.calls[0][1]).toContain("--profile");
    expect(exec.mock.calls[1][1]).toEqual([
      "plugin",
      "add",
      `link:${connectorDirOf()}`,
    ]);
  });

  it("does not retry when the failure is a real pnpm error", async () => {
    const repoDir = makeFakeRepo();
    const exec = vi.fn(async () => ({ code: 1, stderr: "ERR_PNPM_FETCH_404" }));
    const result = await installDshConnector({
      repoRoot: repoDir,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec,
      findBinary: () => "/fake/bin/dsh",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("dshPluginAddFailed");
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("still builds the connector when no dsh CLI can be found", async () => {
    const repoDir = makeFakeRepo();
    const result = await installDshConnector({
      repoRoot: repoDir,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec: vi.fn(),
      findBinary: () => null,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("dshCliNotFound");
    expect(result.command).toBe(installCommandOf());
    // The connector exists, so the manual command the user copies works.
    expect(fs.existsSync(path.join(connectorDirOf(), "package.json"))).toBe(true);
  });

  it("returns connectorBuildUnavailable when the repo has no builder", async () => {
    const result = await installDshConnector({
      repoRoot: path.join(tempRoot, "missing-repo"),
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec: vi.fn(),
      findBinary: () => null,
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("connectorBuildUnavailable");
    expect(result.command).toBe(installCommandOf());
  });

  it("reports a failing builder without throwing", async () => {
    const repoDir = makeFakeRepo({ throws: true });
    const result = await installDshConnector({
      repoRoot: repoDir,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec: vi.fn(),
      findBinary: () => "/fake/bin/dsh",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("connectorBuildFailed");
    expect(result.error).toContain("boom");
  });

  it("reports a non-zero dsh exit with its output", async () => {
    const repoDir = makeFakeRepo();
    const result = await installDshConnector({
      repoRoot: repoDir,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec: async () => ({ code: 1, stderr: "ERR_PNPM_NO_MATCHING_VERSION" }),
      findBinary: () => "/fake/bin/dsh",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("dshPluginAddFailed");
    expect(result.error).toContain("ERR_PNPM_NO_MATCHING_VERSION");
    expect(result.command).toBe(installCommandOf());
  });

  it("reports a timeout as a structured failure", async () => {
    const repoDir = makeFakeRepo();
    const result = await installDshConnector({
      repoRoot: repoDir,
      home: homeDir,
      userDataDir,
      platform: "darwin",
      env: { HOME: homeDir, PATH: "" },
      exec: async () => ({ timedOut: true, stdout: "still running" }),
      findBinary: () => "/fake/bin/dsh",
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("dshInstallTimeout");
  });
});

