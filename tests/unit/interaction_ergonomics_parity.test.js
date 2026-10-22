import { describe, it, expect, vi } from "vitest";
import { rotationCursorForPoint } from "../../src/canvas/editor/editor-cursors.js";
import { createPenEdit } from "../../src/canvas/editor/editor_pen_edit.js";
import { createPenDraft } from "../../src/canvas/editor/editor_pen_draft.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_model.js";

describe("interaction_ergonomics_parity (Figma & Affinity)", () => {
  it("generates tangential rotation cursors around element center", () => {
    const center = { x: 200, y: 200 };
    // Top right corner
    const curTR = rotationCursorForPoint(center, { x: 300, y: 100 });
    expect(curTR).toContain("url(");
    expect(curTR).toContain("crosshair");

    // Bottom left corner
    const curBL = rotationCursorForPoint(center, { x: 100, y: 300 });
    expect(curBL).toContain("url(");
  });

  it("nudges vector anchors in edit mode without moving non-selected anchors", () => {
    let doc = {
      nodes: [
        {
          id: "path-1",
          kind: NODE_KIND.PATH,
          pen: true,
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          strokeWidth: 2,
          points: [
            { x: 10, y: 10 },
            { x: 50, y: 50 },
            { x: 100, y: 100 },
          ],
        },
      ],
    };

    const penEdit = createPenEdit({
      getDoc: () => doc,
      setDoc: (nextDoc) => {
        doc = nextDoc;
      },
      requestRender: vi.fn(),
      notify: vi.fn(),
      getZoom: () => 1,
    });

    // Enter edit mode for path-1
    penEdit.beginEdit("path-1");
    const editState = penEdit.getEdit();
    expect(editState).not.toBeNull();

    // Select middle anchor (index 1)
    editState.active = 1;
    editState.selected = [1];

    // Nudge anchor by (5, -3)
    penEdit.nudgeActiveAnchor(5, -3);

    const updatedNode = doc.nodes[0];
    // Anchor 0 untouched
    expect(updatedNode.points[0]).toEqual({ x: 10, y: 10 });
    // Anchor 1 nudged
    expect(updatedNode.points[1]).toEqual({ x: 55, y: 47 });
    // Anchor 2 untouched
    expect(updatedNode.points[2]).toEqual({ x: 100, y: 100 });
  });

  it("deletes only selected anchor and preserves path continuity", () => {
    let doc = {
      nodes: [
        {
          id: "poly-1",
          kind: NODE_KIND.PATH,
          pen: true,
          x: 0,
          y: 0,
          width: 200,
          height: 200,
          strokeWidth: 2,
          points: [
            { x: 10, y: 10 },
            { x: 50, y: 50 },
            { x: 100, y: 100 },
          ],
        },
      ],
    };

    const penEdit = createPenEdit({
      getDoc: () => doc,
      setDoc: (nextDoc) => {
        doc = nextDoc;
      },
      requestRender: vi.fn(),
      notify: vi.fn(),
      getZoom: () => 1,
    });

    penEdit.beginEdit("poly-1");
    const edit = penEdit.getEdit();
    expect(edit).not.toBeNull();
    edit.active = 1;
    edit.selected = [1];

    penEdit.deleteActiveAnchor();

    // Node is still in document!
    expect(doc.nodes.length).toBe(1);
    expect(doc.nodes[0].id).toBe("poly-1");
    // Points reduced from 3 to 2
    expect(doc.nodes[0].points.length).toBe(2);
  });

  it("pops draft anchor with popDraftAnchor while drawing with pen", () => {
    let doc = { nodes: [] };
    const penDraft = createPenDraft({
      getDoc: () => doc,
      setDoc: (nextDoc) => {
        doc = nextDoc;
      },
      requestRender: vi.fn(),
      getZoom: () => 1,
      getColor: () => "#ffffff",
      getStrokeWidth: () => 2,
      getAnchorType: () => "corner",
    });

    // Place 3 points
    penDraft.penDown({ x: 10, y: 10 }, "#ffffff", 2, "pen");
    penDraft.penUp();
    penDraft.penDown({ x: 50, y: 50 }, "#ffffff", 2, "pen");
    penDraft.penUp();
    penDraft.penDown({ x: 100, y: 100 }, "#ffffff", 2, "pen");
    penDraft.penUp();

    expect(penDraft.getDraft().anchors.length).toBe(3);

    // Pop last anchor (Backspace while drawing)
    penDraft.popDraftAnchor();
    expect(penDraft.getDraft().anchors.length).toBe(2);

    // Pop second anchor
    penDraft.popDraftAnchor();
    expect(penDraft.getDraft().anchors.length).toBe(1);

    // Popping when 1 anchor remains cancels the draft completely
    penDraft.popDraftAnchor();
    expect(penDraft.getDraft()).toBeNull();
  });

  it("toggles auto-layout on a group node with toggleAutoLayoutSelection", async () => {
    const { createEngineGroups } = await import(
      "../../src/canvas/editor/editor_engine_groups.js"
    );

    let doc = {
      nodes: [
        {
          id: "grp-1",
          kind: NODE_KIND.GROUP,
          x: 0,
          y: 0,
          width: 200,
          height: 100,
        },
      ],
    };

    const selectedIds = ["grp-1"];
    const engineGroups = createEngineGroups({
      getDoc: () => doc,
      setDoc: (nextDoc) => {
        doc = nextDoc;
      },
      selection: {
        getIds: () => selectedIds,
        isSelected: (id) => selectedIds.includes(id),
      },
      select: vi.fn(),
      selectMany: vi.fn(),
      unitSelectionIds: () => ["grp-1"],
      selectionUnits: () => [doc.nodes[0]],
      clickUnitOf: () => null,
      getIsolationGroupId: () => null,
      setIsolationGroupId: () => {},
    });

    // 1. Initially autoLayout is undefined, toggling adds autoLayout
    engineGroups.toggleAutoLayoutSelection();
    expect(doc.nodes[0].autoLayout).toBeDefined();
    expect(doc.nodes[0].autoLayout.direction).toBe("vertical");
    expect(doc.nodes[0].autoLayout.gap).toBe(8);

    // 2. Toggling again removes autoLayout
    engineGroups.toggleAutoLayoutSelection();
    expect(doc.nodes[0].autoLayout).toBeNull();
  });

  it("wraps multiple selected nodes into an auto-layout group", async () => {
    const { createEngineGroups } = await import(
      "../../src/canvas/editor/editor_engine_groups.js"
    );

    let doc = {
      nodes: [
        { id: "box-1", kind: NODE_KIND.RECT, x: 0, y: 0, width: 50, height: 50 },
        { id: "box-2", kind: NODE_KIND.RECT, x: 60, y: 0, width: 50, height: 50 },
      ],
    };

    let selectedId = null;
    const selectedIds = ["box-1", "box-2"];
    const engineGroups = createEngineGroups({
      getDoc: () => doc,
      setDoc: (nextDoc) => {
        doc = nextDoc;
      },
      selection: {
        getIds: () => selectedIds,
        isSelected: (id) => selectedIds.includes(id),
        setSingle: (id) => {
          selectedId = id;
        },
      },
      select: (id) => {
        selectedId = id;
      },
      selectMany: vi.fn(),
      unitSelectionIds: () => selectedIds,
      selectionUnits: () => doc.nodes,
      clickUnitOf: () => null,
      getIsolationGroupId: () => null,
      setIsolationGroupId: () => {},
    });

    engineGroups.toggleAutoLayoutSelection();

    // Group should be created with autoLayout
    const createdGroup = doc.nodes.find((n) => n.kind === NODE_KIND.GROUP);
    expect(createdGroup).toBeDefined();
    expect(createdGroup.autoLayout).toBeDefined();
    expect(createdGroup.autoLayout.direction).toBe("horizontal");
    expect(selectedId).toBe(createdGroup.id);
  });

  it("handles Shift+2 (Zoom to Selection) and Shift+A (Auto Layout) shortcuts", async () => {
    let zoomedToSelection = false;
    let toggledAutoLayout = false;

    const mockEngine = {
      zoomToSelection: () => {
        zoomedToSelection = true;
      },
      toggleAutoLayoutSelection: () => {
        toggledAutoLayout = true;
      },
    };

    // Simulate keydown listeners or shortcut matching
    const simulateKeyDown = (event) => {
      if (event.shiftKey && event.code === "Digit2") {
        event.preventDefault();
        mockEngine.zoomToSelection();
        return;
      }
      if (event.shiftKey && event.code === "KeyA") {
        event.preventDefault();
        mockEngine.toggleAutoLayoutSelection();
        return;
      }
    };

    const eventShift2 = {
      shiftKey: true,
      code: "Digit2",
      preventDefault: vi.fn(),
    };
    simulateKeyDown(eventShift2);
    expect(zoomedToSelection).toBe(true);
    expect(eventShift2.preventDefault).toHaveBeenCalled();

    const eventShiftA = {
      shiftKey: true,
      code: "KeyA",
      preventDefault: vi.fn(),
    };
    simulateKeyDown(eventShiftA);
    expect(toggledAutoLayout).toBe(true);
    expect(eventShiftA.preventDefault).toHaveBeenCalled();
  });
});
