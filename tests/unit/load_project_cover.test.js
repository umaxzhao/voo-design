import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ driver: {}, read: vi.fn(), draft: vi.fn() }));
vi.mock("../../src/services/workspace_storage.js", () => ({
  workspaceStorage: { getDriver: () => state.driver, readFileBytes: (...args) => state.read(...args) },
}));
vi.mock("../../src/canvas/store/draft_store.js", () => ({ loadDraftBytes: (...args) => state.draft(...args) }));
vi.mock("../../src/canvas/store/recent_files.js", () => ({ getRecentFiles: () => [] }));

import { loadProjectCover } from "../../src/canvas/previews/load_project_cover.js";

describe("project cover loading limits", () => {
  beforeEach(() => {
    state.driver = {};
    state.read.mockReset();
    state.draft.mockReset();
    state.draft.mockResolvedValue(null);
  });

  it("keeps an available cover when a project is too large to reconstruct", async () => {
    const item = { id: "large", size: 101 * 1024 * 1024, preview: "data:image/png;base64,cover" };
    expect(await loadProjectCover(item)).toBe(item.preview);
    expect(await loadProjectCover(item, { ignoreEmbedded: true })).toBeNull();
    expect(state.read).not.toHaveBeenCalled();
    expect(state.draft).not.toHaveBeenCalled();
  });

  it("does not start queued reads against a different workspace", async () => {
    const pending = loadProjectCover({ id: "old-workspace" });
    state.driver = {};
    expect(await pending).toBeNull();
    expect(state.read).not.toHaveBeenCalled();
    expect(state.draft).not.toHaveBeenCalled();
  });
});
