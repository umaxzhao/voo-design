import { describe, it, expect, vi } from "vitest";
import { moveIntoGroup } from "../../src/canvas/editor/doc_ops_groups.js";
import { createEngineGroups } from "../../src/canvas/editor/editor_engine_groups.js";

describe("Linux QA: Multi-selection layer drag reparent into Frame", () => {
  const createMockScene = () => {
    const sourceRoot = {
      id: "source-root",
      kind: "group",
      isFrame: true,
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
      parentId: null,
      visible: true,
    };
    const rect1 = {
      id: "rect-1",
      kind: "rect",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      parentId: "source-root",
      visible: true,
    };
    const rect2 = {
      id: "rect-2",
      kind: "rect",
      x: 400,
      y: 300,
      width: 250,
      height: 200,
      parentId: "source-root",
      visible: true,
    };
    const targetRoot = {
      id: "target-root",
      kind: "group",
      isFrame: true,
      x: 1500,
      y: 0,
      width: 1000,
      height: 800,
      parentId: null,
      visible: true,
    };

    return {
      width: 3000,
      height: 1000,
      nodes: [sourceRoot, rect1, rect2, targetRoot],
    };
  };

  it("moves all selected sibling layers into target Frame in a single operation", () => {
    const doc = createMockScene();
    const result = moveIntoGroup(doc, ["rect-1", "rect-2"], "target-root");

    expect(result).not.toBe(doc);
    const moved1 = result.nodes.find((n) => n.id === "rect-1");
    const moved2 = result.nodes.find((n) => n.id === "rect-2");

    // Both layers must have parentId set to target-root
    expect(moved1.parentId).toBe("target-root");
    expect(moved2.parentId).toBe("target-root");

    // World coordinates and dimensions must be preserved
    expect(moved1.x).toBe(100);
    expect(moved1.y).toBe(100);
    expect(moved1.width).toBe(200);
    expect(moved1.height).toBe(150);

    expect(moved2.x).toBe(400);
    expect(moved2.y).toBe(300);
    expect(moved2.width).toBe(250);
    expect(moved2.height).toBe(200);

    // Source root must no longer have these children
    const childrenOfSource = result.nodes.filter(
      (n) => n.parentId === "source-root",
    );
    expect(childrenOfSource).toHaveLength(0);

    // Target root must have both children
    const childrenOfTarget = result.nodes.filter(
      (n) => n.parentId === "target-root",
    );
    expect(childrenOfTarget.map((n) => n.id)).toEqual(["rect-1", "rect-2"]);
  });

  it("engine.moveIntoGroup commits once for batch moves allowing single-step Undo/Redo", () => {
    let currentDoc = createMockScene();
    const history = [currentDoc];
    let historyIndex = 0;

    const setDoc = vi.fn((next) => {
      currentDoc = next;
      history.push(next);
      historyIndex++;
    });

    const engine = createEngineGroups({
      getDoc: () => currentDoc,
      setDoc,
      select: vi.fn(),
      selectMany: vi.fn(),
      selection: {
        getIds: () => ["rect-1", "rect-2"],
        isSelected: (id) => ["rect-1", "rect-2"].includes(id),
      },
      clickUnitOf: (node) => node.id,
      selectionUnits: () => ["rect-1", "rect-2"],
    });

    const success = engine.moveIntoGroup(["rect-1", "rect-2"], "target-root");
    expect(success).toBe(true);
    expect(setDoc).toHaveBeenCalledTimes(1);

    // Verify after move
    expect(
      currentDoc.nodes.find((n) => n.id === "rect-1").parentId,
    ).toBe("target-root");
    expect(
      currentDoc.nodes.find((n) => n.id === "rect-2").parentId,
    ).toBe("target-root");

    // Undo: restore previous doc
    const prevDoc = history[historyIndex - 1];
    expect(
      prevDoc.nodes.find((n) => n.id === "rect-1").parentId,
    ).toBe("source-root");
    expect(
      prevDoc.nodes.find((n) => n.id === "rect-2").parentId,
    ).toBe("source-root");
  });

  it("prevents circular reparenting when attempting to move a container into its own descendant", () => {
    const doc = createMockScene();
    // Attempting to move source-root into rect-1 (its own child) must be rejected
    const invalid = moveIntoGroup(doc, ["source-root"], "rect-1");
    expect(invalid).toBe(doc);

    // Attempting to move target-root into target-root must be rejected
    const selfMove = moveIntoGroup(doc, ["target-root"], "target-root");
    expect(selfMove).toBe(doc);
  });
});
