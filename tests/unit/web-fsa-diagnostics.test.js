import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebFsaWorkspaceDriver } from "../../src/services/drivers/web_fsa_driver.js";

const failure = (name, message = "/Users/private/secret.voo contents token=private") => Object.assign(new Error(message), { name });
const missing = () => failure("NotFoundError");
const directory = (overrides = {}) => ({
  kind: "directory", name: "private workspace", queryPermission: vi.fn().mockResolvedValue("granted"),
  getDirectoryHandle: vi.fn().mockRejectedValue(missing()),
  getFileHandle: vi.fn().mockRejectedValue(missing()),
  removeEntry: vi.fn().mockRejectedValue(missing()),
  async *entries() {}, ...overrides,
});
const mount = handle => { const driver = new WebFsaWorkspaceDriver(); driver.dirHandle = handle; return driver; };
let warn;
beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function expectDiagnostic(operation, errorType) {
  expect(warn).toHaveBeenCalledWith("[WebFsaDriver] Operation failed", { operation, errorType });
  expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private|secret|token|contents/);
}

describe("FSA operation failures", () => {
  it("treats only NotFound as a free folder name", async () => {
    const root = directory({ getDirectoryHandle: vi.fn().mockRejectedValueOnce(missing()).mockResolvedValueOnce({}) });
    expect(await mount(root).createFolder("Project")).toMatchObject({ ok: true });
    expect(root.getDirectoryHandle).toHaveBeenLastCalledWith("Project", { create: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not create a folder after a permission lookup failure", async () => {
    const root = directory({ getDirectoryHandle: vi.fn().mockRejectedValue(failure("SecurityError")) });
    expect(await mount(root).createFolder("Project")).toEqual({ ok: false, error: "permission_denied", operation: "create-folder" });
    expect(root.getDirectoryHandle).toHaveBeenCalledTimes(1);
    expectDiagnostic("create-folder", "SecurityError");
  });

  it("rejects a denied read before attempting file resolution", async () => {
    const root = directory({ queryPermission: vi.fn().mockResolvedValue("denied") });
    await expect(mount(root).readFileBytes("Hero.voo")).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(root.getFileHandle).not.toHaveBeenCalled();
    expectDiagnostic("read-file", "NotAllowedError");
  });

  it("exposes a real read error without logging native messages or names", async () => {
    const error = failure("NotReadableError");
    const root = directory({ getFileHandle: vi.fn().mockResolvedValue({ getFile: vi.fn().mockRejectedValue(error) }) });
    await expect(mount(root).readFileBytes("Hero.voo")).rejects.toMatchObject({ name: "NotReadableError", code: "not_readable", operation: "read-file" });
    expectDiagnostic("read-file", "NotReadableError");
  });

  it("reports a missing requested file without treating optional trash absence as a failure", async () => {
    await expect(mount(directory()).readFileBytes("Hero.voo")).rejects.toMatchObject({ name: "NotFoundError" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("aborts a failed write and never emits a successful save event", async () => {
    const error = failure("QuotaExceededError");
    const stream = { write: vi.fn().mockRejectedValue(error), close: vi.fn(), abort: vi.fn() };
    const root = directory({ getFileHandle: vi.fn().mockResolvedValue({ createWritable: async () => stream }) });
    const driver = mount(root), subscriber = vi.fn(); driver.subscribe(subscriber);
    await expect(driver.writeFileBytes("Hero.voo", new Uint8Array([1]))).rejects.toMatchObject({ name: "QuotaExceededError", code: "quota_exceeded", operation: "write-file" });
    expect(stream.abort).toHaveBeenCalledOnce(); expect(stream.close).not.toHaveBeenCalled();
    expect(subscriber).not.toHaveBeenCalled(); expectDiagnostic("write-file", "QuotaExceededError");
  });

  it("does not report a failed permanent deletion as success or delete its metadata", async () => {
    const root = directory({ removeEntry: vi.fn().mockRejectedValue(failure("NoModificationAllowedError")) });
    const driver = mount(root); const metadata = vi.spyOn(driver, "_deleteMeta");
    expect(await driver.deletePermanently("Hero.voo")).toMatchObject({ ok: false, error: "read_only", operation: "delete-file" });
    expect(metadata).not.toHaveBeenCalled(); expectDiagnostic("delete-file", "NoModificationAllowedError");
  });

  it("keeps deletion idempotent for absent files and trash folders", async () => {
    expect(await mount(directory()).deletePermanently("Hero.voo")).toEqual({ ok: true });
    expect(warn).not.toHaveBeenCalled();
  });

  it("does not treat an inaccessible collision target as a free rename", async () => {
    const source = { name: "Old.voo" };
    const root = directory({ getFileHandle: vi.fn().mockResolvedValueOnce(source).mockRejectedValue(failure("NotAllowedError")) });
    const driver = mount(root), move = vi.spyOn(driver, "_moveHandle");
    expect(await driver.renameFile("Old.voo", "New.voo")).toMatchObject({ ok: false, error: "permission_denied" });
    expect(move).not.toHaveBeenCalled(); expectDiagnostic("rename-file", "NotAllowedError");
  });

  it("does not fall back to copying when native move was denied", async () => {
    const source = { name: "Hero.voo", move: vi.fn().mockRejectedValue(failure("NotAllowedError")), getFile: vi.fn() };
    const root = directory(), target = directory();
    await expect(mount(root)._moveHandle(source, root, target, "New.voo")).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(source.getFile).not.toHaveBeenCalled(); expect(target.getFileHandle).not.toHaveBeenCalled();
  });

  it("uses copy and delete only for an unsupported native move form", async () => {
    const bytes = new Uint8Array([1, 2]);
    const source = { name: "Hero.voo", move: vi.fn().mockRejectedValue(failure("NotSupportedError")), getFile: async () => ({ arrayBuffer: async () => bytes }) };
    const stream = { write: vi.fn(), close: vi.fn() }, root = directory({ removeEntry: vi.fn() });
    const target = directory({ getFileHandle: vi.fn().mockResolvedValue({ createWritable: async () => stream }) });
    await mount(root)._moveHandle(source, root, target, "New.voo");
    expect(stream.write).toHaveBeenCalledWith(bytes); expect(stream.close).toHaveBeenCalledOnce();
    expect(root.removeEntry).toHaveBeenCalledWith("Hero.voo"); expect(warn).not.toHaveBeenCalled();
  });

  it("rejects a failed directory scan rather than returning an empty successful list", async () => {
    const error = failure("NotReadableError");
    const root = directory({ async *entries() { throw error; } });
    await expect(mount(root).scanFiles()).rejects.toMatchObject({ operation: "scan-files" });
    expectDiagnostic("scan-files", "NotReadableError");
  });

  it("ignores a file that disappeared during a directory scan", async () => {
    const root = directory({ async *entries() { yield ["Gone.voo", { kind: "file", getFile: async () => { throw missing(); } }]; } });
    expect(await mount(root).scanFiles()).toEqual([]); expect(warn).not.toHaveBeenCalled();
  });

  it("retains partial empty-trash counts when a later removal fails", async () => {
    const trash = directory({ removeEntry: vi.fn().mockResolvedValueOnce().mockRejectedValueOnce(failure("NotAllowedError")),
      async *entries() { yield ["One.voo", { kind: "file" }]; yield ["Two.voo", { kind: "file" }]; } });
    const root = directory({ getDirectoryHandle: vi.fn().mockResolvedValue(trash) });
    expect(await mount(root).emptyTrash()).toMatchObject({ ok: false, error: "permission_denied", deletedCount: 1 });
    expectDiagnostic("empty-trash", "NotAllowedError");
  });

  it("keeps picker cancellation silent and preserves the previous mount", async () => {
    vi.stubGlobal("window", { showDirectoryPicker: vi.fn().mockRejectedValue(failure("AbortError")) });
    const previous = directory(), driver = mount(previous);
    expect(await driver.chooseDirectory()).toEqual({ ok: false, canceled: true });
    expect(driver.dirHandle).toBe(previous); expect(warn).not.toHaveBeenCalled();
  });

  it("returns a sanitized directory-picker permission failure", async () => {
    vi.stubGlobal("window", { showDirectoryPicker: vi.fn().mockRejectedValue(failure("NotAllowedError")) });
    expect(await mount(null).chooseDirectory()).toEqual({ ok: false, error: "permission_denied", operation: "choose-directory" });
    expectDiagnostic("choose-directory", "NotAllowedError");
  });

  it("reports invalid stored metadata and continues with an empty metadata map", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => "null" } });
    expect(mount(directory())._loadMetadata()).toEqual({});
    expectDiagnostic("read-metadata", "SyntaxError");
  });

  it("reports metadata quota errors without exposing the stored payload", () => {
    vi.stubGlobal("window", { localStorage: { setItem: () => { throw failure("QuotaExceededError"); } } });
    mount(directory())._saveMetadata({ privateName: "private payload" });
    expectDiagnostic("write-metadata", "QuotaExceededError");
  });

  it("settles an aborted remembered-handle transaction, reports once and closes the database", async () => {
    const error = failure("QuotaExceededError"), request = {};
    const tx = { objectStore: () => ({ put: () => {
      queueMicrotask(() => {
        request.error = error; request.onerror(); tx.error = error;
        tx.onerror(); tx.onabort();
      });
      return request;
    } }) };
    const db = { transaction: () => tx, close: vi.fn() };
    vi.stubGlobal("indexedDB", { open: () => {
      const opened = {};
      queueMicrotask(() => { opened.result = db; opened.onsuccess(); });
      return opened;
    } });
    expect(await mount(directory())._saveStoredHandle(directory())).toBeNull();
    expect(db.close).toHaveBeenCalledOnce(); expect(warn).toHaveBeenCalledOnce();
    expectDiagnostic("access-handle-store", "QuotaExceededError");
  });

  it("does not expose an unknown native error name or message in diagnostics", async () => {
    const error = failure("private /Users/private/native-error");
    const root = directory({ async *entries() { throw error; } });
    await expect(mount(root).scanFiles()).rejects.toMatchObject({ operation: "scan-files" });
    expectDiagnostic("scan-files", "UnknownError");
  });

});
