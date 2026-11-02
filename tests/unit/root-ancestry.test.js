import { expect, it } from "vitest";
import { isHiddenByGroup, isInsideBooleanGroup, isLockedByGroup } from "../../src/canvas/editor/scene_model_groups.js";

it("checks root objects without indexing or walking the document", () => {
  const doc = { get nodes() { throw new Error("Root ancestry must not read the scene"); } };
  const root = { id: "root", kind: "rect" };
  expect(isHiddenByGroup(doc, root)).toBe(false);
  expect(isInsideBooleanGroup(doc, root)).toBe(false);
  expect(isLockedByGroup(doc, root)).toBe(false);
});

it("still inherits hidden, locked and boolean state from nested parents", () => {
  const nodes = [
    { id: "outer", kind: "boolean", visible: false, locked: true },
    { id: "inner", kind: "group", parentId: "outer" },
    { id: "child", kind: "rect", parentId: "inner" },
  ];
  const doc = { nodes };
  expect(isHiddenByGroup(doc, nodes[2])).toBe(true);
  expect(isInsideBooleanGroup(doc, nodes[2])).toBe(true);
  expect(isLockedByGroup(doc, nodes[2])).toBe(true);
});
