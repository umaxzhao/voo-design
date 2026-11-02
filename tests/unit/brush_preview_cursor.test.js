import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  brushCircleCursor,
  createHoverCursorController,
} from "../../src/canvas/editor/editor_pointer_hover.js";

describe("brush preview cursor", () => {
  it("does not render a centered preview circle in the editor page", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/canvas/components/editor_page.jsx"),
      "utf8",
    );

    expect(page).not.toContain("BrushPreviewOverlay");
    expect(page).not.toContain("border-white/80 shadow-pop transition-all duration-75");
  });

  it("uses the brush size as the SVG circle diameter", () => {
    const cursor = brushCircleCursor(40, 1);
    const encodedSvg = cursor.match(/data:image\/svg\+xml;utf8,([^']+)/)?.[1];

    expect(encodedSvg).toBeTruthy();
    const svg = decodeURIComponent(encodedSvg);
    expect(svg).toContain('width="44" height="44"');
    expect(svg).toContain('r="20"');
  });

  it("refreshes the cursor immediately after the brush size changes", () => {
    let brushSize = 24;
    const stage = { style: {} };
    const controller = createHoverCursorController({
      api: {
        getTool: () => "brush",
        getViewport: () => ({ zoom: 1 }),
        getBrushWidth: () => brushSize,
      },
      stage,
      hitTest: {},
      isSpaceDown: () => false,
    });

    controller.updateHoverCursor({ clientX: 10, clientY: 20 });
    brushSize = 40;
    controller.refreshBrushCursor();

    expect(stage.style.cursor).toBe(brushCircleCursor(40, 1));
  });
});
