import { getSetting, setSetting } from "../../shared/settings.js";

export const EDITOR_PANEL_LAYOUT_SETTING = "voo.editor.panelLayout";
export const DEFAULT_EDITOR_PANEL_LAYOUT = Object.freeze({ swapped: false });
export const EDITOR_PANEL_SECTIONS_SETTING = "voo.editor.panelSections";

export function loadEditorPanelSectionState() {
  const value = getSetting(EDITOR_PANEL_SECTIONS_SETTING);
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function saveEditorPanelSectionState(key, expanded) {
  const current = loadEditorPanelSectionState();
  return setSetting(EDITOR_PANEL_SECTIONS_SETTING, { ...current, [key]: expanded });
}

export function toggleEditorPanelSectionState(key, expanded) {
  const next = !expanded;
  // setSetting updates the synchronous cache before its async store write, so
  // the UI can follow immediately; surface (never swallow) a failed write.
  saveEditorPanelSectionState(key, next).catch((error) => {
    console.error("Failed to persist panel section state", error);
  });
  return next;
}

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
