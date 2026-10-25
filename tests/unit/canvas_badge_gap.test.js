import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EDITOR_PAGE_TOOLBAR_GAP } from "../../src/canvas/components/editor_panel_layout.js";

const SRC_PATH = "src/canvas/components/editor_page.jsx";
const src = readFileSync(SRC_PATH, "utf8");

/**
 * The canvas size badge wrapper: the div whose class list follows the
 * "Canvas size presets" comment in editor_page.jsx.
 */
function sizeBadgeOpeningTag() {
  const start = src.indexOf("Canvas size presets sit above the artboard.");
  expect(start).toBeGreaterThan(-1);
  const open = src.indexOf("<div", start);
  const close = src.indexOf(">", src.indexOf("style={{", open));
  return src.slice(open, close + 1);
}

/** Tailwind pb-px is 1px; the page header hit area pads 6px (py-1.5). */
const BADGE_PADDING_BOTTOM_PX = 1;
const HEADER_HIT_PADDING_PX = 6;
const PREVIOUS_PADDING_BOTTOM_PX = 8; // pb-2

describe("canvas size badge gap above the artboard header", () => {
  it("uses pb-px instead of pb-2 for the padding under the badge pill", () => {
    const tag = sizeBadgeOpeningTag();
    expect(tag).toContain("pb-px");
    expect(tag).not.toMatch(/\bpb-2\b/);
  });

  it("halves the visible gap from 14px to 7px", () => {
    const previousGap = PREVIOUS_PADDING_BOTTOM_PX + HEADER_HIT_PADDING_PX;
    const currentGap = BADGE_PADDING_BOTTOM_PX + HEADER_HIT_PADDING_PX;
    expect(previousGap).toBe(14);
    expect(currentGap).toBe(previousGap / 2);
  });

  it("keeps the badge placement offset unchanged", () => {
    expect(src).toContain(
      "top: docRect.y - EDITOR_PAGE_HEADER_INSET - EDITOR_PAGE_TOOLBAR_GAP,",
    );
  });

  it("leaves the shared toolbar gap (used by the task bar below the artboard) at 6px", () => {
    expect(EDITOR_PAGE_TOOLBAR_GAP).toBe(6);
  });
});
