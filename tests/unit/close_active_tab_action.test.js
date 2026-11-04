import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDesignStore } from "../../src/store/design_store.js";
import { closeActiveDocumentTab } from "../../src/canvas/store/document_tab_close.js";

const initial = useDesignStore.getInitialState();

describe("native menu close-tab action", () => {
  beforeEach(() => {
    useDesignStore.setState(initial, true);
  });

  it("does nothing on the welcome screen instead of closing the window", () => {
    expect(closeActiveDocumentTab(useDesignStore)).toBe(false);
    expect(useDesignStore.getState().welcomeOpen).toBe(true);
    expect(useDesignStore.getState().activeDocumentId).toBeNull();
  });

  it("closes the active tab and returns to welcome when it was the last one", () => {
    useDesignStore.getState().newVooProject({ label: "Only" });
    expect(closeActiveDocumentTab(useDesignStore)).toBe(true);
    expect(useDesignStore.getState().activeDocumentId).toBeNull();
    expect(useDesignStore.getState().openDocuments).toEqual([]);
    expect(useDesignStore.getState().welcomeOpen).toBe(true);
  });

  it("closes only the active tab and keeps the neighbouring tab open", () => {
    useDesignStore.getState().newVooProject({ label: "First" });
    const first = useDesignStore.getState().activeDocumentId;
    useDesignStore.getState().newVooProject({ label: "Second" });
    const second = useDesignStore.getState().activeDocumentId;

    expect(closeActiveDocumentTab(useDesignStore)).toBe(true);
    const state = useDesignStore.getState();
    expect(state.activeDocumentId).toBe(first);
    expect(state.openDocuments.map((document) => document.id)).toEqual([first]);
    expect(state.openDocuments.some((document) => document.id === second)).toBe(false);
  });

  it("keeps a dirty tab open when the confirmation is rejected", () => {
    useDesignStore.getState().newVooProject({ label: "Dirty" });
    useDesignStore.getState().setIsDirty(true);
    const confirmClose = vi.fn(() => false);

    expect(closeActiveDocumentTab(useDesignStore, confirmClose)).toBe(false);
    expect(confirmClose).toHaveBeenCalledOnce();
    expect(useDesignStore.getState().openDocuments).toHaveLength(1);
    expect(useDesignStore.getState().welcomeOpen).toBe(false);
  });
});
