import { describe, expect, it } from "vitest";
import { layerPassDocument } from "../../src/canvas/editor/layer-pass-document.js";

describe("layer pass cache boundaries", () => {
  it("reuses an immutable all-layer composition across camera frames", () => {
    const doc = { backgroundColor: "#ffffff", nodes: [{ id: "a", kind: "rect" }, { id: "b", kind: "rect" }] };
    const first = layerPassDocument(doc, ["a", "b"]);
    expect(layerPassDocument(doc, ["a", "b"])).toBe(first);
    expect(first.doc.nodes).toBe(doc.nodes);
    expect(first.doc.backgroundColor).toBe("transparent");
    expect(doc.backgroundColor).toBe("#ffffff");
    expect(layerPassDocument({ ...doc }, ["a", "b"])).not.toBe(first);
  });

  it("separates selected layer scopes without dropping structural containers", () => {
    const doc = { nodes: [{ id: "g", kind: "group" }, { id: "boolean", kind: "boolean", visible: true },
      { id: "a", kind: "rect" }, { id: "b", kind: "rect" }] };
    const first = layerPassDocument(doc, ["a"]);
    expect(first.doc.nodes.map(n => n.id)).toEqual(["g", "boolean", "a"]);
    expect(first.doc.nodes[1].visible).toBe(false);
    expect(doc.nodes[1].visible).toBe(true);
    expect(layerPassDocument(doc, ["a"])).toBe(first);
    expect(layerPassDocument(doc, ["b"])).not.toBe(first);
  });
});
