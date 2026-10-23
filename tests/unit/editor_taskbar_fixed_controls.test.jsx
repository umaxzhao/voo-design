import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en" }),
}));

import EditorContextualTaskBar from "../../src/canvas/components/editor_contextual_taskbar.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

describe("EditorContextualTaskBar fixed controls", () => {
  it("renders the deselect button in the pixel-selection context", () => {
    const html = renderToStaticMarkup(
      <EditorContextualTaskBar
        engine={{ getSelectedIds: () => [] }}
        hasSelection={true}
      />,
    );
    expect(html).toContain('aria-label="editor.taskbar.deselect"');
    expect(html).toContain('aria-label="editor.taskbar.invert"');
  });

  it("renders the finish-path button in the pen context", () => {
    const html = renderToStaticMarkup(
      <EditorContextualTaskBar
        engine={{ penEdit: true }}
        tool={TOOL.PEN}
      />,
    );
    expect(html).toContain('aria-label="editor.pen.closeEdit"');
  });

  it("renders the lock button for a selected shape", () => {
    const html = renderToStaticMarkup(
      <EditorContextualTaskBar
        engine={{ getSelectedIds: () => ["s1"] }}
        selected={{ id: "s1", kind: "rect", locked: false }}
      />,
    );
    expect(html).toContain('aria-label="editor.taskbar.lock"');
  });

  it("renders the unlock label for a locked shape", () => {
    const html = renderToStaticMarkup(
      <EditorContextualTaskBar
        engine={{ getSelectedIds: () => ["s1"] }}
        selected={{ id: "s1", kind: "rect", locked: true }}
      />,
    );
    expect(html).toContain('aria-label="editor.taskbar.unlock"');
  });
});
