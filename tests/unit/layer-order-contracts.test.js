import { describe, expect, it } from "vitest";
import { reorderNode, reorderNodes } from "../../src/canvas/editor/doc_ops_groups.js";

const shape = (id, patch = {}) => ({ id, kind: "rect", x: 20, y: 20, width: 80, height: 80, ...patch });
const document = nodes => ({ width: 800, height: 600, nodes });
const order = doc => doc.nodes.map(node => node.id);

describe("relative layer order contracts", () => {
  for (const ids of [["base", "clip"], ["clip", "base"]]) {
    it.each([1, -1])(`moves the selected mask unit once for ${ids.join("/")} in direction %s`, direction => {
      const doc = document([shape("low"), shape("base"), shape("clip", { clipTo: "base" }), shape("one"), shape("two")]);
      const next = reorderNodes(doc, ids, direction);
      expect(order(next)).toEqual(direction === 1 ? ["low", "one", "base", "clip", "two"] : ["base", "clip", "low", "one", "two"]);
      expect(next.nodes.find(node => node.id === "clip").clipTo).toBe("base");
    });
  }
  for (const kind of ["group", "frame"]) it.each([1, -1])(`respects a locked ${kind} ancestor in direction %s`, direction => {
    const doc = document([shape("host", { kind: "group", isFrame: kind === "frame", locked: true }),
      shape("a", { parentId: "host" }), shape("b", { parentId: "host" })]);
    const id = direction === 1 ? "a" : "b";
    expect(reorderNodes(doc, [id], direction)).toBe(doc);
    expect(reorderNode(doc, id, direction)).toBe(doc);
  });
  it.each([1, -1])("keeps a single Frame API move atomic in direction %s", direction => {
    const block = [shape("host", { kind: "group", isFrame: true }), shape("child", { parentId: "host" })];
    const doc = document(direction === 1 ? [...block, shape("other")] : [shape("other"), ...block]);
    expect(order(reorderNode(doc, "host", direction))).toEqual(direction === 1 ? ["other", "host", "child"] : ["host", "child", "other"]);
  });
  it("does not move a locked node through the single-node API", () => {
    const doc = document([shape("locked", { locked: true }), shape("other")]);
    expect(reorderNode(doc, "locked", 1)).toBe(doc);
  });
  it("treats a clipped-only selection as selecting its stack unit", () => {
    const doc = document([shape("base"), shape("clip", { clipTo: "base" }), shape("other")]);
    expect(order(reorderNode(doc, "clip", 1))).toEqual(["other", "base", "clip"]);
  });
});
