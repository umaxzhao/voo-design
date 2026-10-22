import { describe, expect, it } from "vitest";
import { figmaMessageToPages } from "../../../src/canvas/figma/figma-to-voo.js";

const guid = (localID) => ({ sessionID: 0, localID });

function change(localID, parentLocalID, position, props) {
  return {
    guid: guid(localID),
    ...(parentLocalID === null ? {} : { parentIndex: { guid: guid(parentLocalID), position } }),
    ...props,
  };
}

function solid(r, g, b, a = 1) {
  return { type: "SOLID", color: { r, g, b, a }, opacity: 1, visible: true };
}

describe("Figma Multi-Level Frame and Group Nesting Architecture", () => {
  it("distinctly preserves Frame as frame and Group as group across multiple nesting levels", () => {
    // Structure:
    // CANVAS (Page 1)
    // ├── FrameA (top-level Frame: 500x400)
    // │   ├── FrameBackground (rect)
    // │   ├── Group1 (group inside FrameA)
    // │   │   ├── SubFrame (nested Frame inside Group1: 200x150)
    // │   │   │   ├── SubFrameBackground (rect)
    // │   │   │   └── SubText (text inside SubFrame)
    // │   │   └── ShapeInGroup (rect inside Group1)
    // │   └── DirectCard (rect inside FrameA)
    // ├── FrameB (top-level Frame: 300x300, completely independent)
    // │   ├── FrameBBackground (rect)
    // │   └── TextInB (text inside FrameB)
    // └── LooseVector (standalone vector at canvas root, not inside any frame)
    const message = {
      nodeChanges: [
        change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        change(1, 0, "!", { type: "CANVAS", name: "Page 1" }),

        // Top Frame A
        change(10, 1, "!", {
          type: "FRAME",
          name: "ScreenA",
          transform: { m02: 0, m12: 0 },
          size: { x: 500, y: 400 },
          fillPaints: [solid(1, 1, 1)],
          cornerRadius: 16,
        }),
        // Direct child of ScreenA
        change(11, 10, "!", {
          type: "RECTANGLE",
          name: "DirectCard",
          transform: { m02: 20, m12: 20 },
          size: { x: 100, y: 60 },
          fillPaints: [solid(0.9, 0.9, 0.9)],
        }),
        // Group1 inside ScreenA
        change(20, 10, '"', {
          type: "GROUP",
          name: "ButtonGroup",
          transform: { m02: 50, m12: 100 },
          size: { x: 300, y: 200 },
        }),
        // Rect inside Group1
        change(21, 20, "!", {
          type: "RECTANGLE",
          name: "ShapeInGroup",
          transform: { m02: 10, m12: 10 },
          size: { x: 40, y: 40 },
          fillPaints: [solid(0, 0, 1)],
        }),
        // SubFrame nested inside Group1
        change(30, 20, '"', {
          type: "FRAME",
          name: "NestedModal",
          transform: { m02: 60, m12: 20 },
          size: { x: 200, y: 150 },
          fillPaints: [solid(0.2, 0.2, 0.2)],
          cornerRadius: 8,
        }),
        // Text inside SubFrame
        change(31, 30, "!", {
          type: "TEXT",
          name: "ModalTitle",
          transform: { m02: 16, m12: 24 },
          size: { x: 150, y: 30 },
          textData: { characters: "Nested Title" },
          fontSize: 16,
          fillPaints: [solid(1, 1, 1)],
        }),

        // Top Frame B (independent sibling of ScreenA)
        change(50, 1, '"', {
          type: "FRAME",
          name: "ScreenB",
          transform: { m02: 600, m12: 0 },
          size: { x: 300, y: 300 },
          fillPaints: [solid(0.95, 0.95, 0.95)],
        }),
        change(51, 50, "!", {
          type: "TEXT",
          name: "TextInB",
          transform: { m02: 30, m12: 30 },
          size: { x: 100, y: 20 },
          textData: { characters: "Side Screen" },
          fontSize: 14,
          fillPaints: [solid(0, 0, 0)],
        }),

        // Loose vector shape on root canvas
        change(90, 1, "#", {
          type: "VECTOR",
          name: "LooseShape",
          transform: { m02: 1000, m12: 50 },
          size: { x: 50, y: 50 },
          fillPaints: [solid(1, 0, 0)],
        }),
      ],
    };

    const { pages } = figmaMessageToPages(message);
    expect(pages.length).toBe(1);
    const nodes = pages[0].nodes;

    // 1. Find all key structural containers
    const screenA = nodes.find((n) => n.name === "ScreenA");
    const screenB = nodes.find((n) => n.name === "ScreenB");
    const buttonGroup = nodes.find((n) => n.name === "ButtonGroup");
    const nestedModal = nodes.find((n) => n.name === "NestedModal");
    const directCard = nodes.find((n) => n.name === "DirectCard");
    const shapeInGroup = nodes.find((n) => n.name === "ShapeInGroup");
    const modalTitle = nodes.find((n) => n.name === "ModalTitle");
    const textInB = nodes.find((n) => n.name === "TextInB");
    const looseShape = nodes.find((n) => n.name === "LooseShape");

    // 2. Validate Frame vs Group semantic discrimination
    expect(screenA.frame).toBe(true);
    expect(screenA.isFrame).toBe(true);
    expect(screenA.containerType).toBe("frame");
    expect(screenA.cornerRadius).toBe(16);

    expect(screenB.frame).toBe(true);
    expect(screenB.isFrame).toBe(true);
    expect(screenB.containerType).toBe("frame");

    expect(nestedModal.frame).toBe(true);
    expect(nestedModal.isFrame).toBe(true);
    expect(nestedModal.containerType).toBe("frame");
    expect(nestedModal.cornerRadius).toBe(8);

    expect(buttonGroup.frame).toBe(false);
    expect(buttonGroup.isFrame).toBe(false);
    expect(buttonGroup.containerType).toBe("group");

    // 3. Validate that objects are NOT forced into one single frame wrapper
    // Both ScreenA and ScreenB are independent root frames
    expect(screenA.parentId).toBeNull();
    expect(screenB.parentId).toBeNull();
    expect(looseShape.parentId).toBeNull();

    // 4. Validate exact multi-level nesting hierarchy:
    // ScreenA -> DirectCard
    expect(directCard.parentId).toBe(screenA.id);

    // ScreenA -> ButtonGroup
    expect(buttonGroup.parentId).toBe(screenA.id);

    // ButtonGroup -> ShapeInGroup
    expect(shapeInGroup.parentId).toBe(buttonGroup.id);

    // ButtonGroup -> NestedModal (Frame nested inside a Group)
    expect(nestedModal.parentId).toBe(buttonGroup.id);

    // NestedModal -> ModalTitle (Text nested inside nested Frame)
    expect(modalTitle.parentId).toBe(nestedModal.id);

    // ScreenB -> TextInB
    expect(textInB.parentId).toBe(screenB.id);

    // 5. Text node remains high-performance native text with full styling
    expect(modalTitle.kind).toBe("text");
    expect(modalTitle.text).toBe("Nested Title");
    expect(modalTitle.fontSize).toBe(16);
  });
});
