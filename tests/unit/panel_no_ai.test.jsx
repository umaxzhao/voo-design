// The bottom quick-tools bar owns every AI action. The right properties panel
// must not repeat any of them, for an image or for a plain layer.
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
import SelectionActions from "../../src/canvas/components/editor_properties/selection_actions.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

const noop = () => {};
const engine = {
  getDocument: () => ({ nodes: [], modifiers: [] }),
  subscribeRender: () => () => {},
  setTool: noop,
};
const image = { id: "img", kind: "image", x: 0, y: 0, width: 100, height: 80, adjustments: {} };
const layer = { id: "r1", kind: "rect", x: 0, y: 0, width: 40, height: 40, fill: "#ff0000" };

/** Every AI entry the panel used to repeat, by test id. */
const REMOVED_TEST_IDS = [
  "editor-taskbar-ai-sparkle",
  "editor-properties-ai-input",
  "editor-properties-ai-submit",
  "editor-taskbar-ai-remove-bg",
  "editor-taskbar-ai-tools",
  "editor-taskbar-more",
  "more-ai-section",
  "more-outpaint",
  "more-upscale-2x",
  "more-upscale-4x",
  "more-upscale-anime",
  "more-auto-enhance",
  "more-retouch",
  "more-split-layers",
];

/** Every AI label the panel used to repeat, by i18n key. */
const REMOVED_LABELS = [
  "editor.taskbar.askAgent",
  "editor.taskbar.askPlaceholder",
  "editor.taskbar.matting",
  "editor.taskbar.aiTools",
  "editor.taskbar.aiSection",
  "editor.taskbar.outpaint",
  "editor.upscale.2x",
  "editor.upscale.4x",
  "editor.upscale.anime",
  "editor.taskbar.autoEnhance",
  "editor.taskbar.retouch",
  "editor.taskbar.splitLayers",
  "editor.selection.aiRepaint",
  "editor.selection.aiRepaintPlaceholder",
];

/** Handlers that used to feed the panel's AI entries; passing them must not bring the entries back. */
const aiHandlers = {
  imageAiActions: {
    onOutpaint: vi.fn(),
    onUpscale: vi.fn(),
    onAutoEnhance: vi.fn(),
    onPortraitRetouch: vi.fn(),
    onSplitLayers: vi.fn(),
  },
  onRemoveBackground: vi.fn(),
};

const renderPanel = (object) =>
  renderToStaticMarkup(
    <EditorProperties tool={TOOL.SELECT} object={object} engine={engine} {...aiHandlers} />,
  );

describe("right properties panel carries no AI entries", () => {
  it("renders no AI test ids or labels for an image selection", () => {
    const html = renderPanel(image);
    // Positive control: the panel itself and its non-AI image actions are rendered.
    expect(html).toContain('data-testid="image-context-actions"');
    expect(html).toContain('data-testid="editor-taskbar-crop"');
    expect(html).toContain('data-testid="editor-taskbar-layer-actions"');
    for (const id of REMOVED_TEST_IDS) {
      expect(html, `test id ${id}`).not.toContain(`"${id}"`);
    }
    for (const label of REMOVED_LABELS) {
      expect(html, `label ${label}`).not.toContain(label);
    }
  });

  it("renders no AI test ids or labels for a plain layer", () => {
    const html = renderPanel(layer);
    expect(html).toContain('data-testid="editor-taskbar-layer-actions"');
    expect(html).not.toContain('data-testid="image-context-actions"');
    for (const id of REMOVED_TEST_IDS) {
      expect(html, `test id ${id}`).not.toContain(`"${id}"`);
    }
    for (const label of REMOVED_LABELS) {
      expect(html, `label ${label}`).not.toContain(label);
    }
  });

  it("renders no AI repaint entry in the selection actions", () => {
    const html = renderToStaticMarkup(
      <SelectionActions
        hasSelection
        onInvertSelection={noop}
        onClearSelection={noop}
        onRefineEdge={noop}
        onModifySelection={noop}
        onAiRepaintSelection={noop}
      />,
    );
    // Positive control: the selection section renders its non-AI row.
    expect(html).toContain("editor.selection.refineEdge");
    for (const label of REMOVED_LABELS) {
      expect(html, `label ${label}`).not.toContain(label);
    }
  });
});
