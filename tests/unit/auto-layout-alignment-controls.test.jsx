import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AutoLayoutFields } from "../../src/canvas/components/editor_properties/auto_layout_section.jsx";
import { reflowAutoLayout } from "../../src/canvas/editor/scene_auto_layout.js";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

function descendants(element) {
  if (!React.isValidElement(element)) return [];
  return [
    element,
    ...React.Children.toArray(element.props.children).flatMap(descendants),
  ];
}

describe("auto layout alignment controls", () => {
  it.each(["horizontal", "vertical"])(
    "bottom-left aligns children geometrically in %s layout",
    (direction) => {
      const frame = {
        id: "frame",
        kind: "group",
        isFrame: true,
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        autoLayout: {
          direction,
          gap: 0,
          padding: 0,
          widthMode: "fixed",
          heightMode: "fixed",
        },
      };
      const editAndCommit = vi.fn();
      const tree = AutoLayoutFields({
        object: frame,
        editAndCommit,
        hideDirection: true,
        hideSizing: true,
      });
      const points = descendants(tree).filter(
        (element) =>
          element.props["aria-label"] === "editor.autoLayout.alignmentPoint",
      );
      expect(points).toHaveLength(9);
      points[6].props.onClick();
      const doc = {
        nodes: [
          { ...frame, ...editAndCommit.mock.calls[0][0] },
          {
            id: "child",
            kind: "rect",
            parentId: "frame",
            x: 0,
            y: 0,
            width: 20,
            height: 10,
          },
        ],
      };
      const child = reflowAutoLayout(doc).nodes.find(
        (node) => node.id === "child",
      );
      expect(child.x).toBe(0);
      expect(child.y).toBe(90);
    },
  );
});
