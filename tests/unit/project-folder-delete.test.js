import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceStorageEngine, WebIdbWorkspaceDriver, WebFsaWorkspaceDriver, ElectronWorkspaceDriver } from "../../src/services/workspace_storage.js";

afterEach(() => vi.unstubAllGlobals());

it("initializes the workspace before delegating folder deletion", async () => {
  const storage = new WorkspaceStorageEngine("web-idb");
  const init = vi.spyOn(storage.driver, "init").mockResolvedValue({});
  const remove = vi.spyOn(storage.driver, "deleteFolder").mockResolvedValue({ ok: true });
  expect(await storage.deleteFolder("Project")).toEqual({ ok: true });
  expect(init.mock.invocationCallOrder[0]).toBeLessThan(remove.mock.invocationCallOrder[0]);
});

it("deletes only the selected virtual folder and notifies file list consumers", async () => {
  vi.stubGlobal("indexedDB", undefined);
  const driver = new WebIdbWorkspaceDriver();
  await driver.createFolder("Project");
  await driver.createFolder("Other");
  await driver.writeFileBytes("A.voo", new Uint8Array([1]), { folder: "Project" });
  await driver.writeFileBytes("B.voo", new Uint8Array([2]), { folder: "Other" });
  const listener = vi.fn();
  driver.subscribe(listener);
  expect(await driver.deleteFolder("Project")).toEqual({ ok: true });
  expect(driver.memFiles.has("Project/A.voo")).toBe(false);
  expect(driver.memFiles.has("Other/B.voo")).toBe(true);
  expect(listener).toHaveBeenCalled();
  expect((await driver.deleteFolder("Project")).error).toBe("directory_not_found");
  expect((await driver.deleteFolder("../Other")).error).toBe("invalid_name");
});

it("reports an aborted IndexedDB deletion instead of leaving the caller pending", async () => {
  const driver = new WebIdbWorkspaceDriver();
  const tx = { objectStore: () => ({ get: () => ({}) }) };
  vi.spyOn(driver, "_openDatabase").mockResolvedValue({ transaction: () => tx });
  const result = driver.deleteFolder("Project");
  await Promise.resolve();
  tx.onabort();
  expect(await result).toEqual({ ok: false, error: "aborted" });
});

it("checks FSA permissions and folder names before a recursive removal", async () => {
  const driver = new WebFsaWorkspaceDriver();
  const removeEntry = vi.fn();
  driver.dirHandle = { queryPermission: async () => "granted", removeEntry };
  expect(await driver.deleteFolder("Project")).toEqual({ ok: true });
  expect(removeEntry).toHaveBeenCalledWith("Project", { recursive: true });
  expect((await driver.deleteFolder("../Project")).error).toBe("invalid_name");
  driver.dirHandle.queryPermission = async () => "denied";
  driver.dirHandle.requestPermission = async () => "denied";
  expect((await driver.deleteFolder("Project")).error).toBe("permission_denied");
  expect(removeEntry).toHaveBeenCalledOnce();
});

it("uses the desktop trash endpoint and preserves its error response", async () => {
  const deleteFolder = vi.fn().mockResolvedValue({ ok: false, error: "directory_not_found" });
  vi.stubGlobal("window", { electronAPI: { workspace: { deleteFolder } } });
  const driver = new ElectronWorkspaceDriver();
  expect(await driver.deleteFolder("Project")).toEqual({ ok: false, error: "directory_not_found" });
  expect(deleteFolder).toHaveBeenCalledWith("Project");
});
