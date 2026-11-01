import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import FigmaColorPicker from "../../src/canvas/color_picker/FigmaColorPicker.jsx";
import VariantsSection from "../../src/canvas/components/editor_properties/variants_section.jsx";
import TextSection from "../../src/canvas/components/editor_properties/text_section.jsx";
import ColourSection from "../../src/canvas/components/editor_properties/colour_section.jsx";
import LiveFilterStack from "../../src/canvas/components/editor_properties/live_filter_stack.jsx";
import ExportSection from "../../src/canvas/components/editor_properties/export_section.jsx";
import AffinityAdjustmentSection from "../../src/canvas/components/editor_properties/affinity_adjustment_section.jsx";
import { normalizeAdjustments } from "../../src/canvas/editor/scene_model.js";
import { useI18n } from "../../src/canvas/use_i18n.js";
import PropertiesPanelMaskToolbar from "../../src/canvas/components/editor_properties/properties_panel_mask_toolbar.jsx";
import ColorVariablesSection from "../../src/canvas/components/editor_properties/color_variables_section.jsx";
import { createVariablesPanelActions, bindColorVariable } from "../../src/canvas/editor/scene_variables.js";

/** Mount the actual inspector against the real engine, without faking callbacks. */
export function mountAuditPanel(kind, id) {
  window.__auditPanelRoot?.unmount();
  document.getElementById("inspector-audit-host")?.remove();
  const host = document.createElement("div");
  host.id = "inspector-audit-host";
  Object.assign(host.style, { position: "fixed", left: "340px", top: "90px", width: "360px", maxHeight: "80vh", overflowY: "auto", zIndex: "110", background: "#171717", padding: "12px" });
  document.body.append(host);
  const editor = window.__vooEditor;
  const edit = (patch) => editor.updateNode(id, patch);
  const commitNow = () => editor.commitEditorDocument();
  function Panel() {
    const [, refresh] = useState(0);
    const [feather, setFeather] = useState(0);
    const { t } = useI18n();
    useEffect(() => editor.subscribeRender(() => refresh((value) => value + 1)), []);
    const object = editor.getNode(id);
    if (!object) return null;
    const props = { object, engine: editor, selectedNodes: [object], edit, editAndCommit: edit, commitNow, t };
    if (kind === "colour") return React.createElement(FigmaColorPicker, { color: object.fill, onChange: (fill) => edit({ fill }), blendMode: object.blendMode ?? "source-over", onBlendModeChange: (blendMode) => edit({ blendMode }) });
    if (kind === "variants") return React.createElement(VariantsSection, { engine: editor, node: object });
    if (kind === "text") return React.createElement(TextSection, props);
    if (kind === "paint") return React.createElement("div", null, React.createElement(ColourSection, { ...props, showFill: true, showStroke: true }));
    if (kind === "filters") return React.createElement(LiveFilterStack, props);
    if (kind === "adjustment") return React.createElement(AffinityAdjustmentSection, { ...props, adjustments: normalizeAdjustments(object.adjustments) });
    if (kind === "export") return React.createElement(ExportSection, props);
    if (kind === "variables") return React.createElement(ColorVariablesSection, {
      object, variables: editor.getDocument().colorVariables ?? [], variablesV2: editor.getDocument().variablesV2, revealed: true,
      onCreate: () => {}, onBind: (value) => editor.setDoc(bindColorVariable(editor.getDocument(), id, value)),
      onUpdate: () => {}, variableActions: createVariablesPanelActions({ getDocument: editor.getDocument,
        commit: editor.setDoc, getNodeId: () => id, historyName: "editor.history.entry.variables" }),
    });
    if (kind === "mask") return React.createElement(PropertiesPanelMaskToolbar, {
      maskEditing: editor.getMaskEdit(), hasMask: Boolean(object.maskId), maskBusy: false, feather, setFeather, t,
      maskActions: { onMode: (value) => editor.setMaskMode(value), onSize: (value) => editor.setMaskBrushSize(value),
        onInvert: () => editor.invertMask(id), onClear: () => editor.clearMask(id), onFeather: (value) => editor.featherMask(id, value) },
    });
    throw new Error(`Unknown audit panel: ${kind}`);
  }
  window.__auditPanelRoot = createRoot(host);
  window.__auditPanelRoot.render(React.createElement(Panel));
}
