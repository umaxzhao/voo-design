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

import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import Quickbar from "../../src/canvas/components/editor_contextual_taskbar.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

const engine = {
  getDocument: () => ({ nodes: [], modifiers: [] }),
  subscribeRender: () => () => {},
  setTool: () => {},
};
const selections = [
  { id: "rect-1", kind: "rect", x: 0, y: 0, width: 40, height: 40 },
  { id: "image-1", kind: "image", x: 0, y: 0, width: 100, height: 80, adjustments: {} },
];

describe("layer actions are absent from the right properties panel", () => {
  it.each(selections)("does not render the action disclosure for $kind", (object) => {
    const markup = renderToStaticMarkup(
      <EditorProperties tool={TOOL.SELECT} object={object} engine={engine} />,
    );
    expect(markup).not.toContain('data-testid="editor-taskbar-layer-actions"');
  });

  it("keeps common selection actions in the bottom selection bar", () => {
    const markup = renderToStaticMarkup(
      <Quickbar selected={selections[0]} engine={{}} />,
    );
    for (const id of ["duplicate", "lock", "hide", "delete", "bringForward", "sendBackward"]) {
      expect(markup).toContain(`data-testid="editor-taskbar-${id}"`);
    }
  });
});
