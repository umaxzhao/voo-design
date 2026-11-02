import { beforeEach, describe, expect, it } from "vitest";
import { workspaceStorage, resetWorkspaceStorage } from "../../src/services/workspace_storage.js";
import {
  addRecentFile,
  clearRecentFiles,
  getRecentFiles,
  getTrashFiles,
  moveToTrash,
  renameRecentFile,
  restoreFromTrash,
  syncRecentFile,
  toggleStarFile,
  deletePermanently,
} from "../../src/canvas/store/recent_files.js";
import { clearLegacyFolderMembership, folderOfFile, setFileFolder } from "../../src/canvas/store/file_folders.js";

const testBytes = new Uint8Array([7, 3, 1, 9]);
const localValues = new Map();
const localStorageMock = {
  getItem: (key) => localValues.get(key) ?? null,
  setItem: (key, value) => localValues.set(key, String(value)),
  removeItem: (key) => localValues.delete(key),
};
globalThis.window ||= globalThis;
globalThis.window.localStorage = localStorageMock;
globalThis.localStorage = localStorageMock;

describe("welcome workspace file lifecycle", () => {
  beforeEach(() => {
    localValues.clear();
    resetWorkspaceStorage();
    const driver = workspaceStorage.getDriver();
    driver.memFiles.clear();
    driver.memTrash.clear();
    driver.memFolders.clear();
    clearRecentFiles();
    clearLegacyFolderMembership();
  });

  it("keeps project bytes and both metadata views in sync through lifecycle changes", async () => {
    const created = await workspaceStorage.writeFileBytes("Project.voo", testBytes);
    addRecentFile({ name: created.name, path: created.path, size: created.size, isDraft: false });

    const starred = await workspaceStorage.toggleStar(created.id);
    expect(starred.ok).toBe(true);
    toggleStarFile(created.id);
    syncRecentFile(created.id, { starred: starred.starred });

    const moved = await workspaceStorage.moveToFolder(created.id, "Campaign");
    expect(moved.ok).toBe(true);
    setFileFolder(created.id, null);
    setFileFolder(moved.file.id, "Campaign");
    syncRecentFile(created.id, { id: moved.file.id, folder: "Campaign" });

    const renamed = await workspaceStorage.renameFile(moved.file.id, "Final.voo");
    expect(renamed.ok).toBe(true);
    setFileFolder(moved.file.id, null);
    setFileFolder(renamed.file.id, "Campaign");
    renameRecentFile(moved.file.id, "Final.voo");
    syncRecentFile("Final.voo", { id: renamed.file.id, folder: renamed.file.folder });
    expect(folderOfFile(renamed.file.id)).toBe("Campaign");
    expect((await workspaceStorage.readFileBytes(renamed.file.id))).toEqual(testBytes);
    expect(getRecentFiles()[0]).toMatchObject({ id: renamed.file.id, name: "Final.voo", starred: true, folder: "Campaign" });

    expect((await workspaceStorage.moveToTrash(renamed.file.id)).ok).toBe(true);
    moveToTrash(renamed.file.id);
    expect(getTrashFiles()).toHaveLength(1);
    expect((await workspaceStorage.readFileBytes(renamed.file.id))).toEqual(testBytes);

    expect((await workspaceStorage.restoreFromTrash(renamed.file.id)).ok).toBe(true);
    restoreFromTrash(renamed.file.id);
    expect(getRecentFiles()[0].name).toBe("Final.voo");

    expect((await workspaceStorage.moveToTrash(renamed.file.id)).ok).toBe(true);
    moveToTrash(renamed.file.id);
    expect((await workspaceStorage.deletePermanently(renamed.file.id)).ok).toBe(true);
    deletePermanently(renamed.file.id);
    expect(getTrashFiles()).toHaveLength(0);
    expect(await workspaceStorage.scanFiles({ includeTrashed: true })).toHaveLength(0);
    expect(getRecentFiles({ includeTrashed: true })).toHaveLength(0);
  });

  it("duplicates the stored .voo payload before adding its recent metadata", async () => {
    const source = await workspaceStorage.writeFileBytes("Source.voo", testBytes);
    const bytes = await workspaceStorage.readFileBytes(source.id);
    const duplicate = await workspaceStorage.writeFileBytes("Source (Copy).voo", bytes);

    addRecentFile({ name: duplicate.name, path: duplicate.path, size: duplicate.size, isDraft: false });
    syncRecentFile(duplicate.name, { id: duplicate.id, size: duplicate.size, isDraft: false });

    expect(await workspaceStorage.readFileBytes(duplicate.id)).toEqual(testBytes);
    expect(getRecentFiles().map((file) => file.name)).toContain("Source (Copy).voo");
  });
});
