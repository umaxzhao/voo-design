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
});
