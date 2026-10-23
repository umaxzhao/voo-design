import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PageSwitcher from "../../src/canvas/components/page_switcher.jsx";
import { useDesignStore as store } from "../../src/store/design_store.js";
import {
  rememberPageCamera,
  restorePageCamera,
  pageCameraCache,
} from "../../src/canvas/page_camera.js";

// SSR should exercise the current test state, rather than Zustand's boot snapshot.
vi.mock("../../src/store/design_store.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useDesignStore: Object.assign(
      (selector) => selector(actual.useDesignStore.getState()),
      actual.useDesignStore,
    ),
  };
});

describe("page list polish", () => {
  beforeEach(() =>
    store.setState({
      nodes: [],
      editingNodeId: null,
      editingNodeIds: [],
      editorPageCameras: {},
      editorCamera: { panX: 0, panY: 0, zoom: 1 },
      isDirty: false,
    }),
  );
  it("adds, renames, duplicates without ID collisions, reorders and deletes", () => {
    const id = store.getState().addEditorPage({ label: "Page 1" });
    store.getState().renameEditorPage(id, "  Hero  ");
    store.getState().renameEditorPage(id, "  ");
    expect(store.getState().nodes[0].data.label).toBe("Hero");
    const a = store.getState().duplicateEditorPage(id);
    const b = store.getState().duplicateEditorPage(id);
    expect(new Set([id, a, b]).size).toBe(3);
    expect(store.getState().nodes[1].data.editorDoc).not.toBe(
      store.getState().nodes[0].data.editorDoc,
    );
    store.getState().reorderEditorPage(b, -1);
    expect(store.getState().nodes.map((n) => n.id)).toEqual([id, b, a]);
    store.getState().reorderEditorPage(id, -1);
    expect(store.getState().nodes[0].id).toBe(id);
    for (const node of store.getState().nodes)
      store.getState().deleteEditorPage(node.id);
    expect(store.getState().editingNodeId).toBeNull();
    expect(renderToStaticMarkup(React.createElement(PageSwitcher))).toContain(
      'data-testid="pages-empty"',
    );
  });
  it("duplicates current engine content when a reader is registered", () => {
    const id = store.getState().addEditorPage();
    store.setState({
      editorPageDocumentReader: () => ({
        width: 640,
        nodes: [{ id: "live-edit" }],
      }),
    });
    const copy = store
      .getState()
      .duplicateEditorPage(id, { copySuffix: "副本" });
    expect(
      store.getState().nodes.find((n) => n.id === copy).data.editorDoc.nodes[0]
        .id,
    ).toBe("live-edit");
    expect(
      store.getState().nodes.find((n) => n.id === copy).data.label,
    ).toContain("副本");
    store.setState({ editorPageDocumentReader: null });
  });
  it("remembers shared camera per page and ignores unknown focus", () => {
    const a = store.getState().addEditorPage();
    const b = store.getState().addEditorPage();
    store.getState().setEditorCamera({ panX: 50, panY: -12, zoom: 2 });
    store.getState().focusEditorPage(a);
    store.getState().setEditorCamera({ panX: 8, panY: 9, zoom: 0.5 });
    store.getState().focusEditorPage(b);
    expect(store.getState().editorCamera).toEqual({
      panX: 50,
      panY: -12,
      zoom: 2,
    });
    store.getState().focusEditorPage("missing");
    expect(store.getState().editingNodeId).toBe(b);
    store.getState().focusEditorPage(a);
    expect(store.getState().editorCamera.zoom).toBe(0.5);
  });
  it.each([undefined, []])(
    "keeps legacy single-page payload untouched (%j)",
    (pages) => {
      const doc = {
        width: 300,
        height: 200,
        nodes: [],
        ...(pages ? { pages } : {}),
      };
      const before = JSON.stringify(doc);
      store.getState().loadVooProject({ vooData: { document: doc } });
      expect(store.getState().nodes).toHaveLength(1);
      expect(store.getState().nodes[0].data.editorDoc).toBe(doc);
      expect(JSON.stringify(doc)).toBe(before);
      expect(store.getState().isDirty).toBe(false);
      expect(store.getState().editorPageCameras).toEqual({});
    },
  );
  it("loads ordered multi-page documents with valid focus", () => {
    store.getState().loadVooProject({
      vooData: {
        document: {
          pages: [
            { id: "b", sceneDoc: { nodes: [] } },
            { id: "a", sceneDoc: { nodes: [] } },
          ],
          editingNodeId: "a",
        },
      },
    });
    expect(store.getState().nodes.map((n) => n.id)).toEqual(["b", "a"]);
    expect(store.getState().editingNodeIds).toEqual(["a"]);
  });
  it("isolates local camera caches between document sessions", () => {
    const first = pageCameraCache(100);
    rememberPageCamera(first, "same-id", { panX: 1, panY: 2, zoom: 3 });
    expect(pageCameraCache(100)).toBe(first);
    expect(pageCameraCache(101).has("same-id")).toBe(false);
    // An outgoing engine's late cleanup cannot mutate the new session.
    rememberPageCamera(first, "same-id", { panX: 9, panY: 9, zoom: 9 });
    expect(pageCameraCache(101).size).toBe(0);
  });
  it("copies valid local cameras and safely handles absent APIs", () => {
    const cameras = new Map();
    const camera = { panX: 4, panY: 6, zoom: 2 };
    rememberPageCamera(cameras, "a", camera);
    camera.zoom = 8;
    rememberPageCamera(cameras, "b", { zoom: NaN });
    let restored;
    restorePageCamera(cameras, "a", {
      setViewport: (value) => {
        restored = value;
      },
    });
    expect(restored).toEqual({ panX: 4, panY: 6, zoom: 2 });
    expect(cameras.has("b")).toBe(false);
    expect(() => restorePageCamera(cameras, "a", {})).not.toThrow();
  });
});
