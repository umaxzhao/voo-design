import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pageSlotAt } from "../../src/canvas/components/use_page_switcher_drag.js";

const rows = [
  { id: "a", top: 100, height: 40 },
  { id: "b", top: 148, height: 40 },
  { id: "c", top: 196, height: 40 },
];

describe("page switcher pointer reorder", () => {
  it("resolves before/after slots from the row midpoint", () => {
    expect(pageSlotAt(rows, 105)).toEqual({ targetId: "a", edge: "before" });
    expect(pageSlotAt(rows, 125)).toEqual({ targetId: "b", edge: "before" });
    expect(pageSlotAt(rows, 200)).toEqual({ targetId: "c", edge: "before" });
    expect(pageSlotAt(rows, 260)).toEqual({ targetId: "c", edge: "after" });
  });

  it("returns null for an empty list", () => {
    expect(pageSlotAt([], 120)).toBeNull();
  });

  it("drives reordering from pointer events instead of HTML5 drag and drop", () => {
    const switcher = readFileSync("src/canvas/components/page_switcher.jsx", "utf8");
    // HTML5 drag never fires on touch, so the rows must not rely on it.
    expect(switcher).not.toContain("onDragStart");
    expect(switcher).not.toContain("onDragOver");
    expect(switcher).not.toContain("draggable=");
    expect(switcher).toContain("beginRowDrag");
    expect(switcher).toContain("ref={listRef}");
  });

  it("holds before dragging on touch, so the list still scrolls", () => {
    const hook = readFileSync(
      "src/canvas/components/use_page_switcher_drag.js",
      "utf8",
    );
    expect(hook).toContain("TOUCH_HOLD_MS");
    expect(hook).toContain("passive: false");
    expect(hook).toContain("pointercancel");
    // A plain click or double click must not be swallowed as a drag.
    expect(hook).toContain("!commit || !session.armed || !session.moved");
  });

  it("keeps the mobile frame clear of the notch and home indicator", () => {
    const css = readFileSync("src/canvas/components/editor_touch_targets.css", "utf8");
    expect(css).toContain("env(safe-area-inset-top, 0px)");
    expect(css).toContain("env(safe-area-inset-bottom, 0px)");
    expect(css).toContain("env(safe-area-inset-left, 0px)");
    expect(css).toContain("env(safe-area-inset-right, 0px)");
  });

  it("uses one 48px touch target for each tool family without overlapping the main action", () => {
    const css = readFileSync("src/canvas/components/editor_touch_targets.css", "utf8");
    expect(css).toContain("[data-toolbar-touch-tool]");
    expect(css).toContain("min-width: 48px;");
    expect(css).toContain("min-height: 48px;");
    expect(css).toContain("pointer-events: none;");
  });
});
