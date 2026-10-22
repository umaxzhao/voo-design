import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { WebIdbWorkspaceDriver, ElectronWorkspaceDriver } from "../../src/services/workspace_storage.js";

const require = createRequire(import.meta.url);
const workspaceManager = require("../../electron/workspace_manager.cjs");

describe("sandbox workspace folders (IndexedDB driver without a database)", () => {
  it("creates a folder and lists it sorted by name", async () => {
    const driver = new WebIdbWorkspaceDriver();
    driver._openDatabase = async () => null;
    expect((await driver.createFolder("Zeta")).ok).toBe(true);
    expect((await driver.createFolder("Alpha")).ok).toBe(true);
    const names = (await driver.listFolders()).map((folder) => folder.name);
    expect(names).toEqual(["Alpha", "Zeta"]);
  });

  it("reports a name clash instead of merging", async () => {
    const driver = new WebIdbWorkspaceDriver();
    driver._openDatabase = async () => null;
    await driver.createFolder("Brand");
    expect(await driver.createFolder("Brand")).toEqual({ ok: false, error: "already_exists" });
  });

  it("rejects names that would escape or hide the folder", async () => {
    const driver = new WebIdbWorkspaceDriver();
    driver._openDatabase = async () => null;
    for (const bad of ["", "   ", ".hidden", "a/b", "a\\b"]) {
      expect((await driver.createFolder(bad)).error).toBe("invalid_name");
    }
  });
});

describe("Electron workspace folders (driver over the IPC bridge)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards list and create to the bridge", async () => {
    const bridge = {
      listFolders: vi.fn(async () => ({ ok: true, folders: [{ id: "Logo", name: "Logo", path: "/r/Logo" }] })),
      createFolder: vi.fn(async (name) => ({ ok: true, folder: { id: name, name, path: `/r/${name}` } })),
    };
    vi.stubGlobal("window", { electronAPI: { workspace: bridge } });
    const driver = new ElectronWorkspaceDriver();
    expect((await driver.listFolders()).map((f) => f.name)).toEqual(["Logo"]);
    expect((await driver.createFolder("Icons")).ok).toBe(true);
    expect(bridge.createFolder).toHaveBeenCalledWith("Icons");
  });

  it("returns the bridge error when a folder cannot be created", async () => {
    vi.stubGlobal("window", {
      electronAPI: { workspace: { createFolder: async () => ({ ok: false, error: "already_exists" }) } },
    });
    const driver = new ElectronWorkspaceDriver();
    expect(await driver.createFolder("Icons")).toEqual({ ok: false, error: "already_exists" });
  });
});

describe("electron/workspace_manager folder helpers", () => {
  let root;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "voo-folders-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates a folder under the root and lists only visible folders", () => {
    fs.mkdirSync(path.join(root, ".trash"));
    fs.mkdirSync(path.join(root, "__voo_internal"));
    fs.writeFileSync(path.join(root, "loose.voo"), "");

    expect(workspaceManager.createWorkspaceFolder(root, "Campaign").ok).toBe(true);
    expect(fs.statSync(path.join(root, "Campaign")).isDirectory()).toBe(true);

    const listed = workspaceManager.listWorkspaceFolders(root);
    expect(listed.ok).toBe(true);
    expect(listed.folders.map((folder) => folder.name)).toEqual(["Campaign"]);
  });

  it("refuses to create over an existing folder", () => {
    workspaceManager.createWorkspaceFolder(root, "Campaign");
    expect(workspaceManager.createWorkspaceFolder(root, "Campaign")).toEqual({
      ok: false,
      error: "already_exists",
    });
  });

  it("refuses hidden or empty names", () => {
    expect(workspaceManager.createWorkspaceFolder(root, ".secret").error).toBe("invalid_name");
    expect(workspaceManager.createWorkspaceFolder(root, "  ").error).toBe("invalid_name");
  });
});
