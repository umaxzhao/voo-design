import { describe, it, expect, beforeEach } from "vitest";
import {
  getRecentFiles,
  getDrafts,
  getStarredFiles,
  getTrashFiles,
  toggleStarFile,
  renameRecentFile,
  duplicateRecentFile,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
  emptyTrash,
  addRecentFile,
  syncRecentFile,
  removeRecentFile,
  clearRecentFiles,
} from "../../src/canvas/store/recent_files.js";
import { useDesignStore } from "../../src/store/design_store.js";
import { CANVAS_TYPE } from "../../src/canvas/editor/scene_doc_factory.js";

// Node environment localStorage mock
const mockStorage = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => {
      store[key] = String(val);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

if (!globalThis.window) {
  globalThis.window = globalThis;
}
globalThis.window.localStorage = mockStorage;
globalThis.localStorage = mockStorage;

describe("Recent Files Management & Welcome Dashboard State", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("adds and retrieves recent files correctly", () => {
    const item1 = addRecentFile({
      name: "Poster.voo",
      path: "/Users/test/Poster.voo",
      preview: "data:image/png;base64,mock1",
    });

    const item2 = addRecentFile({
      name: "WebLayout.voo",
      path: "/Users/test/WebLayout.voo",
      preview: "data:image/png;base64,mock2",
    });

    const list = getRecentFiles();
    expect(list).toHaveLength(2);
    // Most recent should be first
    expect(list[0].name).toBe("WebLayout.voo");
    expect(list[1].name).toBe("Poster.voo");
  });

  it("treats path-backed files without a project folder as drafts", () => {
    const loose = addRecentFile({
      name: "LooseProject.voo",
      path: "/Users/test/LooseProject.voo",
      isDraft: false,
    });
    const filed = addRecentFile({
      name: "FiledProject.voo",
      path: "/Users/test/Project2/FiledProject.voo",
      isDraft: false,
    });
    syncRecentFile(filed.id, { folder: "Project2" });

    expect(getDrafts().map((item) => item.id)).toContain(loose.id);
    expect(getDrafts().map((item) => item.id)).not.toContain(filed.id);
  });

  it("updates existing item if the same path or name is added again", () => {
    addRecentFile({
      name: "Poster.voo",
      path: "/Users/test/Poster.voo",
    });

    addRecentFile({
      name: "Poster.voo",
      path: "/Users/test/Poster.voo",
      preview: "data:image/png;base64,updated",
    });

    const list = getRecentFiles();
    expect(list).toHaveLength(1);
    expect(list[0].preview).toBe("data:image/png;base64,updated");
  });

  it("removes a specific recent file", () => {
    const item1 = addRecentFile({ name: "Doc1.voo" });
    const item2 = addRecentFile({ name: "Doc2.voo" });

    const updated = removeRecentFile(item1.id);
    expect(updated).toHaveLength(1);
    expect(updated[0].name).toBe("Doc2.voo");
  });

  it("clears all recent files", () => {
    addRecentFile({ name: "Doc1.voo" });
    addRecentFile({ name: "Doc2.voo" });
    clearRecentFiles();
    expect(getRecentFiles()).toHaveLength(0);
  });

  it("toggles star and filters starred files", () => {
    const item1 = addRecentFile({ name: "Alpha.voo" });
    const item2 = addRecentFile({ name: "Beta.voo" });

    expect(getStarredFiles()).toHaveLength(0);

    toggleStarFile(item1.id);
    expect(getStarredFiles()).toHaveLength(1);
    expect(getStarredFiles()[0].id).toBe(item1.id);

    // Toggle again to unstar
    toggleStarFile(item1.id);
    expect(getStarredFiles()).toHaveLength(0);
  });

  it("renames recent files properly", () => {
    const item = addRecentFile({ name: "OldName.voo" });
    renameRecentFile(item.id, "NewBrandName");

    const list = getRecentFiles();
    expect(list[0].name).toBe("NewBrandName.voo");
  });

  it("duplicates files with copy suffix and draft status", () => {
    const item = addRecentFile({ name: "LandingPage.voo", path: "/test/path.voo" });
    const duplicated = duplicateRecentFile(item.id);

    expect(duplicated).not.toBeNull();
    expect(duplicated.name).toBe("LandingPage (Copy).voo");
    expect(duplicated.isDraft).toBe(true);
    expect(duplicated.path).toBeNull();

    const list = getRecentFiles();
    expect(list).toHaveLength(2);
  });

  it("supports moving to trash, restoring, deleting permanently and emptying trash", () => {
    const item1 = addRecentFile({ name: "TrashMe.voo" });
    const item2 = addRecentFile({ name: "KeepMe.voo" });

    moveToTrash(item1.id);

    // Active recents should exclude trashed items
    expect(getRecentFiles()).toHaveLength(1);
    expect(getRecentFiles()[0].name).toBe("KeepMe.voo");

    // Trash should contain the trashed item
    expect(getTrashFiles()).toHaveLength(1);
    expect(getTrashFiles()[0].name).toBe("TrashMe.voo");

    // Restore from trash
    restoreFromTrash(item1.id);
    expect(getRecentFiles()).toHaveLength(2);
    expect(getTrashFiles()).toHaveLength(0);

    // Trash and delete permanently
    moveToTrash(item1.id);
    deletePermanently(item1.id);
    expect(getRecentFiles()).toHaveLength(1);
    expect(getTrashFiles()).toHaveLength(0);

    // Trash and empty trash
    moveToTrash(item2.id);
    expect(getTrashFiles()).toHaveLength(1);
    emptyTrash();
    expect(getTrashFiles()).toHaveLength(0);
    expect(getRecentFiles()).toHaveLength(0);
  });

  it("supports search and sort options", () => {
    addRecentFile({ name: "Zebra.voo" });
    addRecentFile({ name: "Apple.voo" });
    addRecentFile({ name: "Banana.voo" });

    // Search by name substring
    const searched = getRecentFiles({ search: "nan" });
    expect(searched).toHaveLength(1);
    expect(searched[0].name).toBe("Banana.voo");

    // Sort alphabetically A-Z
    const sortedAsc = getRecentFiles({ sortBy: "name", sortOrder: "asc" });
    expect(sortedAsc[0].name).toBe("Apple.voo");
    expect(sortedAsc[1].name).toBe("Banana.voo");
    expect(sortedAsc[2].name).toBe("Zebra.voo");

    // Sort alphabetically Z-A
    const sortedDesc = getRecentFiles({ sortBy: "name", sortOrder: "desc" });
    expect(sortedDesc[0].name).toBe("Zebra.voo");
  });

  it("toggles welcomeOpen state and creates new project from templates", () => {
    useDesignStore.setState({ welcomeOpen: true });
    expect(useDesignStore.getState().welcomeOpen).toBe(true);

    // With no open document there is nothing to go back to: welcome stays.
    useDesignStore.getState().setWelcomeOpen(false);
    expect(useDesignStore.getState().welcomeOpen).toBe(true);

    useDesignStore.getState().newVooProject({ label: "Existing" });
    useDesignStore.getState().setWelcomeOpen(true);
    useDesignStore.getState().setWelcomeOpen(false);
    expect(useDesignStore.getState().welcomeOpen).toBe(false);

    // Creating new project closes welcome dashboard automatically
    useDesignStore.setState({ welcomeOpen: true });
    useDesignStore.getState().newVooProject({
      label: "iPhone 16 Pro Mock",
      width: 393,
      height: 852,
      canvasType: CANVAS_TYPE.DESIGN,
    });

    const state = useDesignStore.getState();
    expect(state.welcomeOpen).toBe(false);
    expect(state.fileName).toBe("iPhone 16 Pro Mock.voo");
    expect(state.nodes).toHaveLength(1);
    expect(state.nodes[0].data.label).toBe("iPhone 16 Pro Mock");
    expect(state.editorArtboardLayouts[state.editingNodeId].width).toBe(393);
    expect(state.editorArtboardLayouts[state.editingNodeId].height).toBe(852);
  });
});
