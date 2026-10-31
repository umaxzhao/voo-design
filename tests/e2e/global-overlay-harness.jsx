import React from "react";
import { createRoot } from "react-dom/client";
import ShortcutReferenceModal from "../../src/canvas/components/shortcut_reference_modal.jsx";
import EditorIconPickerModal from "../../src/canvas/components/editor_icon_picker_modal.jsx";
import SvgEditModal from "../../src/canvas/components/SvgEditModal.jsx";
import DeferredEditorSurface from "../../src/canvas/components/deferred_editor_surface.jsx";

const pending = new Promise(() => {});
function PendingImplementation() { throw pending; }

/** Exercise real global components under a transformed and clipped canvas host. */
export function mountGlobalOverlayAudit(kind) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:100px;top:100px;width:40px;height:40px;overflow:hidden;transform:translateZ(0)";
  host.setAttribute("data-global-overlay-audit-host", "");
  document.querySelector('[data-testid="design-editor"]').append(host);
  const root = createRoot(host);
  const close = () => { root.unmount(); host.remove(); };
  window.closeGlobalOverlayAudit = close;
  const noChange = () => {};
  const components = {
    shortcuts: <ShortcutReferenceModal isOpen onClose={close} titleKey="editor.shortcuts.title" groups={[]} />,
    icons: <EditorIconPickerModal open onClose={close} onSelectIcon={noChange} />,
    svg: <SvgEditModal isOpen onClose={close} onApply={noChange} initialSvg='<svg xmlns="http://www.w3.org/2000/svg"/>' />,
    pending: <DeferredEditorSurface open onClose={close}><PendingImplementation /></DeferredEditorSurface>,
  };
  if (!components[kind]) throw new Error(`Unknown overlay fixture: ${kind}`);
  root.render(components[kind]);
}
