import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EditorCanvasTreeRow, { getCanvasTypeIcon } from "../../src/canvas/components/editor_canvas_tree_row.jsx";
import {
  IconFrame,
  IconComponent,
  IconBox3,
  IconFilm,
} from "../../src/canvas/icons.jsx";

describe("EditorCanvasTreeRow (Frame vs Component Icon & Tone)", () => {
  it("uses IconFrame for regular default frames", () => {
    const icon = getCanvasTypeIcon("design", false);
    expect(icon).toBe(IconFrame);
  });

  it("uses IconComponent for component objects", () => {
    const icon = getCanvasTypeIcon("design", true);
    expect(icon).toBe(IconComponent);
  });

  it("uses IconBox3 for 3D frames", () => {
    const icon = getCanvasTypeIcon("3d", false);
    expect(icon).toBe(IconBox3);
  });

  it("uses IconFilm for motion frames", () => {
    const icon = getCanvasTypeIcon("motion", false);
    expect(icon).toBe(IconFilm);
  });
});


describe("canvas row highlight", () => {
  it.each([false, true])("uses the same gray for active frames (component=%s)", (isComponent) => {
    const html = renderToStaticMarkup(createElement(EditorCanvasTreeRow, {
      page: { id: "frame", title: "Frame", isComponent },
      isActive: true,
      t: (key) => key,
    }));
    expect(html).toContain("bg-neutral-800");
    expect(html).not.toMatch(/bg-\[#(?:a7ffd4|E5B2FF)\]/);
  });
});

describe("canvas row component accent", () => {
  it("tints the component icon and label purple when not active", () => {
    const html = renderToStaticMarkup(createElement(EditorCanvasTreeRow, {
      page: { id: "comp", title: "Button", isComponent: true },
      t: (key) => key,
    }));
    expect(html).toMatch(/lucide-component shrink-0 text-\[#E5B2FF\]"/);
    expect(html).toMatch(/class="ml-2 shrink-0 text-\[10px\] text-\[#E5B2FF\] font-mono"/);
  });

  it("keeps ordinary frames neutral", () => {
    const html = renderToStaticMarkup(createElement(EditorCanvasTreeRow, {
      page: { id: "frame", title: "Frame" },
      t: (key) => key,
    }));
    expect(html).not.toContain("E5B2FF");
    expect(html).toMatch(/lucide-frame shrink-0 text-neutral-400 group-hover\/canvas:text-neutral-200"/);
  });
});
