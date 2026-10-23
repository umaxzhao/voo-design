import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BLEND_MODE } from "../../src/canvas/editor/scene_model_core.js";
import EditorExportDialog from "../../src/canvas/components/editor_export_dialog.jsx";

vi.mock("react-dom", () => ({ createPortal: (children) => children }));
vi.mock("../../src/canvas/components/editor_hooks/use_export_dialog_keyboard.js", () => ({
  useExportDialogKeyboard: () => {},
}));
vi.mock("../../src/canvas/use_i18n.js", () => ({ useI18n: () => ({ t: (key) => key }) }));
vi.mock("../../src/canvas/platform_capabilities.js", () => ({
  CAPABILITY: {}, isCapabilitySupported: () => false,
}));

afterEach(() => vi.unstubAllGlobals());

describe("export dialog transparency default", () => {
  it.each([
    ["no blend modes", { nodes: [{ blendMode: DEFAULT_BLEND_MODE }] }, true],
    ["blend modes", { nodes: [{ blendMode: "multiply" }] }, false],
    ["no document", undefined, true],
  ])("initializes the checkbox for %s", (_, doc, transparent) => {
    vi.stubGlobal("document", { body: {} });
    const html = renderToStaticMarkup(
      <EditorExportDialog
        doc={doc} format="png" quality={1} scale={1}
        documentWidth={100} documentHeight={100}
        onFormat={() => {}} onQuality={() => {}} onScale={() => {}}
        onExport={() => {}} onClose={() => {}}
      />,
    );
    const checkbox = html.match(/<input[^>]*type="checkbox"[^>]*>/)[0];
    expect(checkbox.includes('checked=""')).toBe(transparent);
  });
});
