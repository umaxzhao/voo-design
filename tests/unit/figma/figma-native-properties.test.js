import { describe, expect, it } from "vitest";
import { figmaMessageToPages, figmaMessageToVooFile } from "../../../src/canvas/figma/figma-to-voo.js";
import { reflowConstraints } from "../../../src/canvas/editor/scene_constraints.js";
import { reflowAutoLayout } from "../../../src/canvas/editor/scene_auto_layout.js";
import { serialiseDocument, deserialiseDocument } from "../../../src/canvas/editor/scene_model_serialization.js";

const guid = (localID) => ({ sessionID: 0, localID });
const solid = [{ type: "SOLID", visible: true, color: { r: 1, g: 0, b: 0, a: 1 } }];
const node = (id, type, parent, fields = {}) => ({
  guid: guid(id), type, name: `Node ${id}`,
  parentIndex: { guid: guid(parent), position: String.fromCharCode(33 + id) },
  transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
  size: { x: 100, y: 50 }, ...fields,
});
const message = (children) => ({ nodeChanges: [
  node(0, "DOCUMENT", 0), node(1, "CANVAS", 0), ...children,
] });
const imported = (children) => figmaMessageToPages(message(children)).pages[0];

describe("native Figma properties from real-file losses", () => {
  it("honors native clipping flags, locks and independent corner/stroke fields", () => {
    const page = imported([
      node(2, "FRAME", 1, { frameMaskDisabled: true }),
      node(3, "RECTANGLE", 2, { fillPaints: solid, locked: true,
        rectangleTopLeftCornerRadius: 4, rectangleTopRightCornerRadius: 8,
        rectangleBottomRightCornerRadius: 12, rectangleBottomLeftCornerRadius: 16,
        strokePaints: solid, strokeWeight: 3, strokeAlign: "OUTSIDE",
        dashPattern: [4, 2], strokeJoin: "BEVEL", strokeCap: "ROUND",
      }),
    ]);
    expect(page.nodes[0].clipContent).toBe(false);
    expect(page.nodes.find(n => n.name === "Node 3")).toMatchObject({
      locked: true, cornerRadius: { tl: 4, tr: 8, br: 12, bl: 16 },
      strokeAlign: "outside", strokeDash: [4, 2], strokeJoin: "bevel", strokeCap: "round",
    });
  });

  it("keeps constraints functional after importing, resizing and serialization", () => {
    const page = imported([
      node(2, "FRAME", 1, { size: { x: 200, y: 100 } }),
      node(3, "RECTANGLE", 2, { transform: { m02: 150, m12: 10 }, size: { x: 30, y: 20 },
        horizontalConstraint: "MAX", verticalConstraint: "STRETCH" }),
    ]);
    const doc = deserialiseDocument(serialiseDocument({ ...page, backgroundColor: "transparent" }));
    const frame = doc.nodes.find(n => n.name === "Node 2");
    const child = doc.nodes.find(n => n.name === "Node 3");
    expect(child.constraints).toEqual({ horizontal: "right", vertical: "topBottom" });
    const resized = reflowConstraints(doc, { parentId: frame.id, oldBox: frame, newBox: { ...frame, width: 300, height: 150 } });
    expect(resized.nodes.find(n => n.id === child.id)).toMatchObject({ x: 250, y: 10, height: 70 });
  });

  it("keeps layout sizing, spacing and absolute children editable", () => {
    const page = imported([
      node(2, "FRAME", 1, { size: { x: 200, y: 100 }, stackMode: "HORIZONTAL",
        stackSpacing: 12, stackHorizontalPadding: 10, stackPaddingRight: 10,
        stackVerticalPadding: 8, stackPaddingBottom: 8,
        stackPrimarySizing: "FIXED", stackCounterSizing: "FIXED", stackPrimaryAlignItems: "SPACE_EVENLY" }),
      node(3, "RECTANGLE", 2, { size: { x: 30, y: 20 } }),
      node(4, "RECTANGLE", 2, { size: { x: 20, y: 20 }, stackPositioning: "ABSOLUTE",
        transform: { m02: 140, m12: 60 } }),
    ]);
    expect(page.nodes[0].autoLayout).toMatchObject({ direction: "horizontal", gap: 12,
      padding: { top: 8, right: 10, bottom: 8, left: 10 } });
    const result = reflowAutoLayout(page);
    expect(result.nodes.find(n => n.name === "Node 3")).toMatchObject({ x: 10, y: 8 });
    expect(result.nodes.find(n => n.name === "Node 4")).toMatchObject({ x: 140, y: 60, layoutPosition: "absolute" });
  });

  it("composes parent rotation into a child's world transform", () => {
    const page = imported([
      node(2, "FRAME", 1, { transform: { m00: 0, m01: -1, m02: 100, m10: 1, m11: 0, m12: 50 } }),
      node(3, "RECTANGLE", 2, { transform: { m02: 10, m12: 5 }, size: { x: 20, y: 10 } }),
    ]);
    const child = page.nodes.find(n => n.name === "Node 3");
    // Its world centre is parent(20, 10), rebased by page origin (100, 50).
    expect(child).toMatchObject({ rotation: 90, width: 20, height: 10 });
    expect(page.left + child.x + child.width / 2).toBeCloseTo(90);
    expect(page.top + child.y + child.height / 2).toBeCloseTo(70);
  });

  it("imports variable records as typed modes instead of visible rectangles", () => {
    const source = message([
      node(2, "RECTANGLE", 1, { fillPaints: solid }),
      node(3, "VARIABLE_SET", 1, { name: "Colors", key: "collection-key",
        variableSetModes: [{ id: guid(40), name: "Light" }, { id: guid(41), name: "Dark" }] }),
      node(4, "VARIABLE", 1, { name: "Brand", variableResolvedType: "COLOR",
        variableSetID: { assetRef: { key: "collection-key" } },
        variableDataValues: { entries: [
          { modeID: guid(40), variableData: { value: { colorValue: { r: 1, g: 0, b: 0, a: 1 } } } },
          { modeID: guid(41), variableData: { value: { colorValue: { r: 0, g: 0, b: 1, a: 1 } } } },
        ] } }),
    ]);
    const { vooFile } = figmaMessageToVooFile(source);
    expect(vooFile.document.nodes).toHaveLength(1);
    const doc = deserialiseDocument(serialiseDocument(vooFile.document));
    expect(doc.variablesV2.collections).toHaveLength(1);
    expect(doc.variablesV2.collections[0]).toMatchObject({ name: "Colors",
      variables: [{ name: "Brand", type: "color", valuesByMode: { "figma-mode:0:40": "#ff0000", "figma-mode:0:41": "#0000ff" } }] });
  });
});
