import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceStorageEngine, WebFsaWorkspaceDriver } from "../../src/services/workspace_storage.js";
import { getSetting, setSetting } from "../../src/shared/settings.js";

function directoryHandle() {
  const folders = new Set();
  return {
    kind: "directory", name: "Design Projects",
    queryPermission: vi.fn(async () => "granted"),
    getDirectoryHandle: vi.fn(async (name, options) => {
      if (!folders.has(name) && !options?.create) throw new DOMException("Missing", "NotFoundError");
      folders.add(name);
      return { kind: "directory", name };
    }),
  };
}

beforeEach(() => {
  setSetting("voo.workspace.type", null);
  setSetting("voo.workspace.path", null);
  vi.stubGlobal("window", { showDirectoryPicker: vi.fn(), dispatchEvent: vi.fn() });
  vi.spyOn(WebFsaWorkspaceDriver.prototype, "_saveStoredHandle").mockResolvedValue(true);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setSetting("voo.workspace.type", null);
  setSetting("voo.workspace.path", null);
});

it("can create browser project folders before the user chooses any local directory", async () => {
  const storage = new WorkspaceStorageEngine();
  expect(storage.getDriverType()).toBe("web-idb");
  expect((await storage.createFolder("Campaign")).ok).toBe(true);
  expect(await storage.listFolders()).toEqual([expect.objectContaining({ name: "Campaign" })]);
  expect(window.showDirectoryPicker).not.toHaveBeenCalled();
});

it("restores a saved native directory before folder operations after a reload", async () => {
  setSetting("voo.workspace.type", "web-fsa");
  const handle = directoryHandle();
  const load = vi.spyOn(WebFsaWorkspaceDriver.prototype, "_loadStoredHandle").mockResolvedValue(handle);
  const storage = new WorkspaceStorageEngine();
  expect((await storage.createFolder("Campaign")).ok).toBe(true);
  expect((await storage.getConfig()).path).toBe(handle.name);
  expect(load).toHaveBeenCalledOnce();
  expect(handle.getDirectoryHandle).toHaveBeenCalledWith("Campaign", { create: true });
});

it("keeps existing browser projects when the directory picker is canceled", async () => {
  window.showDirectoryPicker.mockRejectedValue(new DOMException("Canceled", "AbortError"));
  const storage = new WorkspaceStorageEngine();
  await storage.createFolder("Campaign");
  expect(await storage.chooseDirectory()).toEqual({ ok: false, canceled: true });
  expect(storage.getDriverType()).toBe("web-idb");
  expect(await storage.listFolders()).toHaveLength(1);
  expect(getSetting("voo.workspace.type")).toBeNull();
});

it("opens the picker immediately and persists the selected directory and active driver", async () => {
  const handle = directoryHandle();
  window.showDirectoryPicker.mockResolvedValue(handle);
  const storage = new WorkspaceStorageEngine();
  const pending = storage.chooseDirectory();
  expect(window.showDirectoryPicker).toHaveBeenCalledWith({ mode: "readwrite" });
  expect((await pending).ok).toBe(true);
  expect(storage.getDriverType()).toBe("web-fsa");
  expect(getSetting("voo.workspace.type")).toBe("web-fsa");
  expect(getSetting("voo.workspace.path")).toBe(handle.name);
  expect((await storage.createFolder("Campaign")).ok).toBe(true);
});

it("can explicitly switch back to browser storage and persist that choice", async () => {
  const storage = new WorkspaceStorageEngine();
  window.showDirectoryPicker.mockResolvedValue(directoryHandle());
  await storage.chooseDirectory();
  await storage.setDirectory("Virtual Workspace");
  expect(storage.getDriverType()).toBe("web-idb");
  expect(getSetting("voo.workspace.type")).toBe("web-idb");
});
