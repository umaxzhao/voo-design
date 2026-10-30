import { describe, expect, it } from "vitest";
import { normalizeAutoLayout, reflowAutoLayout } from "../../src/canvas/editor/scene_auto_layout.js";

const node = (id, patch) => ({ id, kind: "rect", parentId: "frame", x: 0, y: 0, width: 30, height: 20, ...patch });
const frame = (patch) => node("frame", { kind: "group", parentId: null, x: 50, y: 60, width: 200, height: 160, ...patch });
const find = (doc, id) => doc.nodes.find((item) => item.id === id);

function reflow(nodes) {
  const doc = { width: 600, height: 400, nodes };
  const before = JSON.stringify(doc);
  const next = reflowAutoLayout(doc);
  expect(JSON.stringify(doc)).toBe(before);
  expect(reflowAutoLayout(next)).toEqual(next);
  return next;
}

describe("stretch layout delivery boundaries", () => {
  it("stretches a vertical frame's inner width, excluding absolute and invisible children", () => {
    const next = reflow([
      frame({ autoLayout: { direction: "vertical", alignItems: "stretch", gap: 5, padding: { left: 12, right: 18, top: 10, bottom: 10 } } }),
      node("a", {}), node("b", { height: 40 }),
      node("absolute", { layoutPosition: "absolute", x: 300, y: 310 }),
      node("hidden", { visible: false, x: 400, y: 410 }),
    ]);
    expect(find(next, "a")).toMatchObject({ x: 62, y: 70, width: 170, height: 20 });
    expect(find(next, "b")).toMatchObject({ x: 62, y: 95, width: 170, height: 40 });
    expect(find(next, "absolute")).toMatchObject({ x: 300, y: 310, width: 30, height: 20 });
    expect(find(next, "hidden")).toMatchObject({ x: 400, y: 410, width: 30, height: 20 });
  });

  it.each(["horizontal", "vertical"])("respects nested child min/max on the %s cross axis", (direction) => {
    const horizontal = direction === "horizontal";
    const cross = horizontal ? "height" : "width";
    const min = horizontal ? "minHeight" : "minWidth";
    const max = horizontal ? "maxHeight" : "maxWidth";
    const next = reflow([
      frame({ autoLayout: { direction, alignItems: "stretch", padding: 10 } }),
      node("limited", { kind: "group", autoLayout: { direction, [max]: 60 } }),
      node("minimum", { kind: "group", autoLayout: { direction, [min]: 220, [max]: 100 } }),
    ]);
    expect(find(next, "limited")[cross]).toBe(60);
    expect(find(next, "minimum")[cross]).toBe(220);
  });

  it("stretches a vertical wrapped frame within each column rather than across the entire frame", () => {
    const next = reflow([
      frame({ width: 300, autoLayout: { direction: "vertical", alignItems: "stretch", wrap: true, gap: 10, crossGap: 12, padding: 10 } }),
      node("a", { width: 20, height: 60 }),
      node("b", { width: 40, height: 60 }),
      node("c", { width: 30, height: 60 }),
    ]);
    expect(find(next, "a")).toMatchObject({ x: 60, y: 70, width: 40, height: 60 });
    expect(find(next, "b")).toMatchObject({ x: 60, y: 140, width: 40, height: 60 });
    expect(find(next, "c")).toMatchObject({ x: 112, y: 70, width: 30, height: 60 });
  });

  it("keeps measured widths when a vertical frame hugs its cross axis", () => {
    const next = reflow([
      frame({ autoLayout: { direction: "vertical", alignItems: "stretch", widthMode: "hug", padding: 10 } }),
      node("a", { width: 20 }), node("b", { width: 40 }),
    ]);
    expect(find(next, "frame").width).toBe(60);
    expect(find(next, "a").width).toBe(20);
    expect(find(next, "b").width).toBe(40);
  });

  it("passes an imposed stretch size into a nested hugging frame before arranging its children", () => {
    const next = reflow([
      frame({ autoLayout: { direction: "horizontal", alignItems: "stretch", padding: 10 } }),
      node("nested", { kind: "group", width: 60, autoLayout: { direction: "vertical", heightMode: "hug", justifyContent: "end", padding: 5 } }),
      node("leaf", { parentId: "nested", width: 20, height: 20 }),
    ]);
    expect(find(next, "nested")).toMatchObject({ x: 60, y: 70, width: 60, height: 140 });
    expect(find(next, "leaf")).toMatchObject({ x: 65, y: 185, width: 20, height: 20 });
  });

  it("retains stretch through JSON persistence normalization", () => {
    const value = { direction: "vertical", alignItems: "stretch", widthMode: "fixed", heightMode: "hug" };
    expect(normalizeAutoLayout(JSON.parse(JSON.stringify(value))).alignItems).toBe("stretch");
  });
});
