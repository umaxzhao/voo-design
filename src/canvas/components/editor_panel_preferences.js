import { getSetting, setSetting } from "../../shared/settings.js";

export const EDITOR_PANEL_LAYOUT_SETTING = "voo.editor.panelLayout";
export const DEFAULT_EDITOR_PANEL_LAYOUT = Object.freeze({ swapped: false });

export function normalizeEditorPanelLayout(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return DEFAULT_EDITOR_PANEL_LAYOUT;
  }
  if (typeof value.swapped !== "boolean") return DEFAULT_EDITOR_PANEL_LAYOUT;
  return { swapped: value.swapped };
}

export function loadEditorPanelLayout() {
  return normalizeEditorPanelLayout(getSetting(EDITOR_PANEL_LAYOUT_SETTING));
}

export function saveEditorPanelLayout(layout) {
  const normalized = normalizeEditorPanelLayout(layout);
  return setSetting(EDITOR_PANEL_LAYOUT_SETTING, normalized);
}
