import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import GlobalOverlayPortal from "../../src/canvas/components/global_overlay_portal.jsx";
import ShortcutReferenceModal from "../../src/canvas/components/shortcut_reference_modal.jsx";
import EditorIconPickerModal from "../../src/canvas/components/editor_icon_picker_modal.jsx";
import SvgEditModal from "../../src/canvas/components/SvgEditModal.jsx";

const close = () => {};
describe("global overlay server rendering", () => {
  it("retains semantic content without a browser body", () => {
    expect(renderToStaticMarkup(<GlobalOverlayPortal><button type="button">Close</button></GlobalOverlayPortal>))
      .toBe('<button type="button">Close</button>');
  });
  it.each([
    ["shortcuts", <ShortcutReferenceModal isOpen onClose={close} titleKey="editor.shortcuts.title" groups={[]} />],
    ["icons", <EditorIconPickerModal open onClose={close} onSelectIcon={close} />],
    ["SVG", <SvgEditModal isOpen onClose={close} onApply={close} />],
  ])("keeps %s dialog semantics during server rendering", (_name, modal) => {
    const markup = renderToStaticMarkup(modal);
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('z-[110]');
  });
});
