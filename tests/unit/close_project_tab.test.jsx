import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDesignStore } from "../../src/store/design_store.js";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

vi.mock("../../src/canvas/components/use_tab_bar_overflow.js", () => ({
  useTabBarOverflow: () => ({
    scrollRef: { current: null },
    canScrollLeft: false,
    canScrollRight: false,
    scrollByStep: vi.fn(),
  }),
}));

import CanvasTabStrip from "../../src/canvas/components/canvas_tab_strip.jsx";

function findElement(tree, predicate) {
  let match = null;
  function walk(node) {
    if (!node || match) return;
    if (predicate(node)) {
      match = node;
      return;
    }
    if (node.props?.children) {
      React.Children.forEach(node.props.children, walk);
    }
  }
  walk(tree);
  return match;
}

describe("desktop close project tab", () => {
  const initial = useDesignStore.getInitialState();

  beforeEach(() => {
    useDesignStore.setState(initial, true);
  });

  it("stops event propagation and invokes onClose when desktop close button is clicked", () => {
    const onSwitch = vi.fn();
    const onClose = vi.fn();
    const stopPropagation = vi.fn();
    const documents = [{ id: "document-1", isDirty: false }];

    const tree = CanvasTabStrip({
      documents,
      activeId: "document-1",
      fileName: "Test.voo",
      isDirty: false,
      welcomeOpen: false,
      onSwitch,
      onClose,
      onNew: vi.fn(),
    });

    const closeButton = findElement(
      tree,
      (el) =>
        el.type === "button" && el.props?.["aria-label"] === "canvasTabs.close",
    );
    expect(closeButton).toBeTruthy();

    closeButton.props.onClick({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith("document-1");
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it("sets welcomeOpen to true and clears openDocuments when closing the only open document", () => {
    const store = useDesignStore.getState();
    store.newVooProject({ label: "Single Project" });

    expect(useDesignStore.getState().welcomeOpen).toBe(false);
    expect(useDesignStore.getState().openDocuments).toHaveLength(1);
    const docId = useDesignStore.getState().activeDocumentId;

    const closed = useDesignStore.getState().closeDocument(docId);
    expect(closed).toBe(true);

    const updated = useDesignStore.getState();
    expect(updated.welcomeOpen).toBe(true);
    expect(updated.openDocuments).toEqual([]);
    expect(updated.activeDocumentId).toBeNull();
    expect(updated.nodes).toEqual([]);
  });

  it("returns to welcomeOpen: true when closing the last project via desktop tab strip", () => {
    useDesignStore.getState().newVooProject({ label: "Sole Document" });
    const current = useDesignStore.getState();
    const docId = current.activeDocumentId;

    const onClose = vi.fn((id) => {
      useDesignStore.getState().closeDocument(id);
    });
    const onSwitch = vi.fn((id) => {
      useDesignStore.getState().switchDocument(id);
    });
    const stopPropagation = vi.fn();

    const tree = CanvasTabStrip({
      documents: current.openDocuments,
      activeId: current.activeDocumentId,
      fileName: current.fileName,
      isDirty: current.isDirty,
      welcomeOpen: current.welcomeOpen,
      onSwitch,
      onClose,
      onNew: vi.fn(),
    });

    const closeButton = findElement(
      tree,
      (el) =>
        el.type === "button" && el.props?.["aria-label"] === "canvasTabs.close",
    );
    expect(closeButton).toBeTruthy();

    closeButton.props.onClick({ stopPropagation });

    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(docId);
    expect(onSwitch).not.toHaveBeenCalled();

    const finalState = useDesignStore.getState();
    expect(finalState.welcomeOpen).toBe(true);
    expect(finalState.openDocuments).toEqual([]);
    expect(finalState.activeDocumentId).toBeNull();
  });

  it("prevents close when dirty document close is rejected and closes when confirmed", () => {
    useDesignStore.getState().newVooProject({ label: "Dirty Doc" });
    useDesignStore.getState().setIsDirty(true);
    const docId = useDesignStore.getState().activeDocumentId;

    const rejectClose = vi.fn(() => false);
    const cancelResult = useDesignStore.getState().closeDocument(docId, rejectClose);
    expect(cancelResult).toBe(false);
    expect(rejectClose).toHaveBeenCalledOnce();
    expect(useDesignStore.getState().welcomeOpen).toBe(false);
    expect(useDesignStore.getState().openDocuments).toHaveLength(1);

    const acceptClose = vi.fn(() => true);
    const acceptResult = useDesignStore.getState().closeDocument(docId, acceptClose);
    expect(acceptResult).toBe(true);
    expect(acceptClose).toHaveBeenCalledOnce();
    expect(useDesignStore.getState().welcomeOpen).toBe(true);
    expect(useDesignStore.getState().openDocuments).toHaveLength(0);
    expect(useDesignStore.getState().activeDocumentId).toBeNull();
  });

  it("switches to neighbor tab when closing active document, then returns to welcome when closing last document", () => {
    useDesignStore.getState().newVooProject({ label: "Project 1" });
    const firstId = useDesignStore.getState().activeDocumentId;
    useDesignStore.getState().newVooProject({ label: "Project 2" });
    const secondId = useDesignStore.getState().activeDocumentId;

    expect(useDesignStore.getState().openDocuments).toHaveLength(2);
    expect(useDesignStore.getState().activeDocumentId).toBe(secondId);

    // Close the second (active) document
    useDesignStore.getState().closeDocument(secondId);
    expect(useDesignStore.getState().activeDocumentId).toBe(firstId);
    expect(useDesignStore.getState().welcomeOpen).toBe(false);
    expect(useDesignStore.getState().openDocuments).toHaveLength(1);

    // Close the first (and only remaining) document
    useDesignStore.getState().closeDocument(firstId);
    expect(useDesignStore.getState().activeDocumentId).toBeNull();
    expect(useDesignStore.getState().welcomeOpen).toBe(true);
    expect(useDesignStore.getState().openDocuments).toHaveLength(0);
  });
});
