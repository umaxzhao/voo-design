// The top toolbar lists its tools in the owner's order (Text and Pen & Shape
// directly after Eraser), and the AI repair icon is the only toolbar icon drawn
// in the VOO AI purple accent.
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import EditorToolbar from "../../src/canvas/components/editor_toolbar.jsx";
import { TOOL, TOOL_KEYS } from "../../src/canvas/editor/editor_constants.js";
import { TOOL_SHORTCUTS } from "../../src/canvas/editor/editor_shortcuts.js";

const noop = () => {};
const AI_PURPLE_CLASS = "text-[#E5B2FF]";

/** i18n keys of the design-variant tool buttons, in their rendered order. */
const DESIGN_TOOL_ORDER = [
  "editor.tool.select",
  "editor.tool.hand",
  "editor.tool.frame",
  "editor.tool.crop",
  "editor.tool.marquee",
  "editor.tool.brush",
  "editor.tool.eraser",
  "editor.tool.text",
  "editor.tool.pen",
  "editor.tool.fill",
  "editor.tool.aiRepair",
];

function renderToolbar(props = {}) {
  return renderToStaticMarkup(
    <EditorToolbar
      tool={TOOL.SELECT}
      onTool={noop}
      marqueeMode="rect"
      brushMode="normal"
      healingMode="aiRepair"
      {...props}
    />,
  );
}

/** Distinct aria-labels of the tool buttons, in first-rendered order. */
function toolLabelsInOrder(html, expectedLabels) {
  const wanted = new Set(expectedLabels);
  const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
  return [...new Set(labels.filter((label) => wanted.has(label)))];
}

/** Markup of the button labelled `label`, from its aria-label to its closing tag. */
function buttonMarkup(html, label) {
  const start = html.indexOf(`aria-label="${label}"`);
  expect(start).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("</button>", start));
}

describe("top toolbar tool order", () => {
  it("renders select, hand, frame, crop, marquee, brush, eraser, text, pen, fill, AI repair", () => {
    const html = renderToolbar();
    expect(toolLabelsInOrder(html, DESIGN_TOOL_ORDER)).toEqual(DESIGN_TOOL_ORDER);
    expect(html).not.toContain('aria-label="editor.tool.dropper"');
    expect(TOOL_KEYS.KeyI).toBe(TOOL.DROPPER);
    expect(TOOL_SHORTCUTS[TOOL.DROPPER]).toBe("I");
    // The select entry itself has no forced outline; active state is paint-only.
    const selectStart = html.indexOf('aria-label="editor.tool.select"');
    const wrapper = html.slice(Math.max(0, selectStart - 220), selectStart);
    expect(wrapper).not.toContain("border-white/10");
  });

  it("keeps Text and Pen right after Select in the motion variant", () => {
    const html = renderToolbar({ variant: "motion" });
    expect(toolLabelsInOrder(html, DESIGN_TOOL_ORDER)).toEqual([
      "editor.tool.select",
      "editor.tool.hand",
      "editor.tool.text",
      "editor.tool.pen",
    ]);
  });
});

describe("AI purple accent on the toolbar", () => {
  it("colours the AI repair icon with the agent-panel purple token", () => {
    const html = renderToolbar({ healingMode: "aiRepair" });
    expect(buttonMarkup(html, "editor.tool.aiRepair")).toContain(AI_PURPLE_CLASS);
  });

  it("does not colour a non-AI icon such as crop", () => {
    const html = renderToolbar();
    expect(buttonMarkup(html, "editor.tool.crop")).not.toContain(AI_PURPLE_CLASS);
  });

  it("does not colour the repair icon when a non-AI repair tool is current", () => {
    const html = renderToolbar({ healingMode: "spot" });
    expect(buttonMarkup(html, "editor.tool.spotHealing")).not.toContain(
      AI_PURPLE_CLASS,
    );
  });
});
