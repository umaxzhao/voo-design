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

  it("scans design files inside project folders with a folder field", () => {
    workspaceManager.createWorkspaceFolder(root, "Campaign");
    fs.writeFileSync(path.join(root, "Root.voo"), "");
    fs.writeFileSync(path.join(root, "Campaign", "Hero.voo"), "");
    fs.writeFileSync(path.join(root, "Campaign", "notes.txt"), "skip");

    const scan = workspaceManager.scanWorkspaceFiles(root);
    expect(scan.ok).toBe(true);
    const byName = Object.fromEntries(scan.files.map((file) => [file.name, file]));
    expect(byName["Root.voo"].folder).toBeNull();
    expect(byName["Hero.voo"].folder).toBe("Campaign");
    expect(byName["Hero.voo"].path).toBe(path.join(root, "Campaign", "Hero.voo"));
    expect(scan.files.some((file) => file.name === "notes.txt")).toBe(false);
  });

  it("moves a file into a project folder and back to the root", () => {
    workspaceManager.createWorkspaceFolder(root, "Campaign");
    const source = path.join(root, "Hero.voo");
    fs.writeFileSync(source, "design");

    const into = workspaceManager.moveWorkspaceFileToFolder(source, "Campaign", root);
    expect(into.ok).toBe(true);
    expect(into.file.folder).toBe("Campaign");
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.existsSync(into.file.path)).toBe(true);

    const back = workspaceManager.moveWorkspaceFileToFolder(into.file.path, null, root);
    expect(back.ok).toBe(true);
    expect(back.file.folder).toBeNull();
    expect(fs.existsSync(path.join(root, "Hero.voo"))).toBe(true);
  });

  it("renames on collision when the destination already has that file", () => {
    workspaceManager.createWorkspaceFolder(root, "Campaign");
    fs.writeFileSync(path.join(root, "Campaign", "Hero.voo"), "kept");
    const source = path.join(root, "Hero.voo");
    fs.writeFileSync(source, "moved");

    const into = workspaceManager.moveWorkspaceFileToFolder(source, "Campaign", root);
    expect(into.ok).toBe(true);
    expect(into.file.name).toBe("Hero-2.voo");
    expect(fs.readFileSync(path.join(root, "Campaign", "Hero.voo"), "utf8")).toBe("kept");
  });
});

describe("sandbox moveToFolder (IndexedDB driver without a database)", () => {
  it("stores membership on the file record and changes its id", async () => {
    const driver = new WebIdbWorkspaceDriver();
    driver._openDatabase = async () => null;
    await driver.createFolder("Campaign");
    await driver.writeFileBytes("Hero.voo", new Uint8Array([1, 2, 3]));

    const moved = await driver.moveToFolder("Hero.voo", "Campaign");
    expect(moved.ok).toBe(true);
    expect(moved.file).toMatchObject({ id: "Campaign/Hero.voo", name: "Hero.voo", folder: "Campaign" });

    const listed = await driver.scanFiles();
    expect(listed).toHaveLength(1);
    expect(listed[0].folder).toBe("Campaign");
    expect(listed[0].id).toBe("Campaign/Hero.voo");

    const back = await driver.moveToFolder("Campaign/Hero.voo", null);
    expect(back.file.folder).toBeNull();
    expect(back.file.id).toBe("Hero.voo");
  });
});

describe("Electron driver moveToFolder over the IPC bridge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards the move and migrates starred metadata onto the new path", async () => {
    const bridge = {
      moveToFolder: vi.fn(async () => ({
        ok: true,
        previousPath: "/r/Hero.voo",
        file: { id: "/r/Campaign/Hero.voo", name: "Hero.voo", path: "/r/Campaign/Hero.voo", folder: "Campaign" },
      })),
    };
    vi.stubGlobal("window", {
      electronAPI: { workspace: bridge },
      localStorage: {
        store: { voo_workspace_meta_electron: JSON.stringify({ "/r/Hero.voo": { starred: true } }) },
        getItem(key) {
          return this.store[key] ?? null;
        },
        setItem(key, value) {
          this.store[key] = String(value);
        },
      },
    });
    const driver = new ElectronWorkspaceDriver();
    const res = await driver.moveToFolder("/r/Hero.voo", "Campaign");
    expect(res.ok).toBe(true);
    expect(bridge.moveToFolder).toHaveBeenCalledWith("/r/Hero.voo", "Campaign");
    expect(JSON.parse(window.localStorage.getItem("voo_workspace_meta_electron"))).toEqual({
      "/r/Campaign/Hero.voo": { starred: true },
    });
  });
});
