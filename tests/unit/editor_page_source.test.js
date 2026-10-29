import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildEditorSource } from "../../src/canvas/components/editor_page_source.js";

const { store } = vi.hoisted(() => ({ store: { nodes: [], images: {} } }));
vi.mock("../../src/store/design_store.js", () => ({ useDesignStore: { getState: () => store } }));

beforeEach(() => {
  store.nodes = [{ id: "page", data: { imageId: "picture", editorDoc: { id: "saved" } } }];
  store.images = { picture: "data:image/png;base64,source" };
});

describe("editor page activation source", () => {
  it("prefers eviction artwork and applied baseline while retaining the latest asset URL", () => {
    const snapshot = { doc: { id: "evicted" }, appliedDoc: { id: "applied" } };
    expect(buildEditorSource("page", snapshot)).toMatchObject({
      savedDoc: snapshot.doc, appliedDoc: snapshot.appliedDoc,
      imageId: "picture", src: store.images.picture, fallbackSize: null,
    });
    store.images.picture = "data:image/png;base64,replaced-cache-entry";
    expect(buildEditorSource("page", snapshot).src).toBe(store.images.picture);
  });

  it("accepts a legacy document snapshot and otherwise uses the saved document", () => {
    const legacy = { id: "legacy", nodes: [] };
    expect(buildEditorSource("page", legacy).savedDoc).toBe(legacy);
    expect(buildEditorSource("page", null).savedDoc).toBe(store.nodes[0].data.editorDoc);
  });

  it("uses explicit dimensions while ordinary images keep their decoded native size", () => {
    expect(buildEditorSource("page").fallbackSize).toBe(null);
    store.nodes[0].data = { ...store.nodes[0].data, layoutWidth: 320, layoutHeight: 240 };
    expect(buildEditorSource("page").fallbackSize).toEqual({ width: 320, height: 240 });
    store.nodes[0].data = {};
    const fallback = buildEditorSource("page").fallbackSize;
    expect(fallback.width).toBeGreaterThan(0);
    expect(fallback.height).toBeGreaterThan(0);
  });
});
