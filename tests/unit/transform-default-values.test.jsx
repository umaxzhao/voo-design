import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { commonValue, MIXED } from "../../src/canvas/editor/selection_values.js";
import TransformSection from "../../src/canvas/components/editor_properties/transform_section.jsx";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

const rect = (id, patch = {}) => ({
  id, kind: "rect", x: 10, y: 20, width: 100, height: 80, ...patch,
});

describe("effective transform values for sparse documents", () => {
  it("treats omitted transforms like explicit renderer defaults", () => {
    const nodes = [rect("a"), rect("b", { rotation: 0, shear: 0, opacity: 1 })];
    expect(commonValue(nodes, "rotation", 0)).toBe(0);
    expect(commonValue(nodes, "shear", 0)).toBe(0);
    expect(commonValue(nodes, "opacity", 1)).toBe(1);
    expect(commonValue([nodes[0], rect("c", { rotation: 20 })], "rotation", 0)).toBe(MIXED);
  });

  it("preserves null and undefined distinctions for callers without defaults", () => {
    expect(commonValue([{ fill: null }, { fill: null }], "fill")).toBeNull();
    expect(commonValue([{ fill: null }, {}], "fill")).toBe(MIXED);
    expect(commonValue([{}, {}], "rotation")).toBeUndefined();
    expect(commonValue([], "rotation", 0)).toBe(MIXED);
  });

  it("renders finite numeric fields for sparse multi-selections", () => {
    const nodes = [rect("a"), rect("b")];
    const html = renderToStaticMarkup(
      <TransformSection object={nodes[0]} selectedNodes={nodes} edit={vi.fn()} editAndCommit={vi.fn()} commitNow={vi.fn()} />,
    );
    expect(html).not.toMatch(/undefined|NaN/);
    for (const label of ["editor.props.rotation", "editor.props.shear"]) {
      expect(html).toMatch(new RegExp(`aria-label="${label}"[^>]*value="0"`));
    }
  });

  it("shows a frame child's X/Y relative to that frame", () => {
    const frame = {
      id: "frame", kind: "group", isFrame: true,
      x: 800, y: 600, width: 400, height: 300,
    };
    const child = rect("child", { parentId: "frame", x: 900, y: 700 });
    const html = renderToStaticMarkup(
      <TransformSection
        object={child}
        selectedNodes={[child]}
        parentNode={frame}
        parentIsFrame
        edit={vi.fn()}
        editAndCommit={vi.fn()}
        commitNow={vi.fn()}
      />,
    );
    expect(html).toMatch(/aria-label="X"[^>]*value="100"/);
    expect(html).toMatch(/aria-label="Y"[^>]*value="100"/);
    expect(html).not.toMatch(/aria-label="X"[^>]*value="900"/);
    expect(html).not.toMatch(/aria-label="Y"[^>]*value="700"/);
  });

  it("does not borrow one frame's origin for a mixed-parent selection", () => {
    const frame = {
      id: "frame", kind: "group", isFrame: true,
      x: 800, y: 600, width: 400, height: 300,
    };
    const child = rect("child", { parentId: "frame", x: 900, y: 700 });
    const loose = rect("loose", { x: 1200, y: 900 });
    const html = renderToStaticMarkup(
      <TransformSection
        object={child}
        selectedNodes={[child, loose]}
        parentNode={frame}
        parentIsFrame
        edit={vi.fn()}
        editAndCommit={vi.fn()}
        commitNow={vi.fn()}
      />,
    );
    // Different parents make a common X/Y meaningless; show the mixed dash
    // rather than presenting the frame child's local value as everyone's.
    expect(html).toMatch(/aria-label="X"[^>]*value=""/);
    expect(html).toMatch(/aria-label="Y"[^>]*value=""/);
  });
});
