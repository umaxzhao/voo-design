import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  scanFiles: vi.fn(),
  moveToTrash: vi.fn(),
  restoreFromTrash: vi.fn(),
  deletePermanently: vi.fn(),
  recent: vi.fn(),
  moveRecent: vi.fn(),
  restoreRecent: vi.fn(),
  deleteRecent: vi.fn(),
  removeRecent: vi.fn(),
}));
vi.mock("../../src/services/workspace_storage.js", () => ({
  workspaceStorage: mocks,
}));
vi.mock("../../src/canvas/store/recent_files.js", () => ({
  getRecentFiles: mocks.recent,
  moveToTrash: mocks.moveRecent,
  restoreFromTrash: mocks.restoreRecent,
  deletePermanently: mocks.deleteRecent,
  removeRecentFile: mocks.removeRecent,
}));
import {
  changeWelcomeTrash,
  forgetDeletedFolderRecents,
} from "../../src/canvas/components/welcome_dashboard/welcome-trash-actions.js";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scanFiles.mockResolvedValue([]);
  mocks.recent.mockReturnValue([]);
  mocks.moveToTrash.mockResolvedValue({ ok: true });
  mocks.restoreFromTrash.mockResolvedValue({ ok: true });
  mocks.deletePermanently.mockResolvedValue({ ok: true });
});
describe("welcome deletion sources", () => {
  it.each([
    ["moveToTrash", "moveRecent"],
    ["restoreFromTrash", "restoreRecent"],
    ["deletePermanently", "deleteRecent"],
  ])(
    "%s handles a pathless draft without sending its ID to disk",
    async (action, recentAction) => {
      mocks.recent.mockReturnValue([
        { id: "draft-1", path: null, name: "Draft.voo" },
      ]);
      await changeWelcomeTrash(action, "draft-1");
      expect(mocks[action]).not.toHaveBeenCalled();
      expect(mocks[recentAction]).toHaveBeenCalledWith("draft-1");
    },
  );
  it("moves owned files on disk before updating the recent record", async () => {
    mocks.scanFiles.mockResolvedValue([
      { id: "/workspace/A.voo", path: "/workspace/A.voo" },
    ]);
    await changeWelcomeTrash("moveToTrash", "/workspace/A.voo");
    expect(mocks.moveToTrash).toHaveBeenCalledWith("/workspace/A.voo");
    expect(mocks.moveRecent).toHaveBeenCalledWith("/workspace/A.voo");
  });
  it("never hides a disk operation failure by deleting the recent entry", async () => {
    mocks.scanFiles.mockResolvedValue([{ id: "file-1" }]);
    mocks.moveToTrash.mockResolvedValue({ ok: false, error: "EACCES" });
    await expect(changeWelcomeTrash("moveToTrash", "file-1")).rejects.toThrow(
      "EACCES",
    );
    expect(mocks.moveRecent).not.toHaveBeenCalled();
  });
  it("removes an external history reference without touching external files", async () => {
    mocks.recent.mockReturnValue([
      { id: "external", path: "/other/Design.voo", name: "Design.voo" },
    ]);
    mocks.scanFiles.mockResolvedValue([
      { id: "/workspace/Design.voo", name: "Design.voo" },
    ]);
    await changeWelcomeTrash("moveToTrash", "external");
    expect(mocks.moveToTrash).not.toHaveBeenCalled();
    expect(mocks.moveRecent).toHaveBeenCalledWith("external");
  });
  it("only forgets recent paths contained in the deleted folder", () => {
    mocks.recent.mockReturnValue([
      { id: "a", path: "/workspace/Project/A.voo" },
      { id: "b", path: "/workspace/Project 2/B.voo" },
    ]);
    forgetDeletedFolderRecents("/workspace/Project");
    expect(mocks.removeRecent).toHaveBeenCalledTimes(1);
    expect(mocks.removeRecent).toHaveBeenCalledWith("a");
  });
});
