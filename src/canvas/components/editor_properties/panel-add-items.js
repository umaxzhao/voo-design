/** Optional sections have one home in the inspector add menu. */
import { createExportPreset, updateExportPresets } from "./export-presets.js";

export function buildPanelAddItems({
  slotEligible, showSlot, eligible, show, showRepeatArray, reveal, t, object, engine,
}) {
  return [
    slotEligible && !showSlot && { key: "slot", label: t("editor.props.componentSlot"), onSelect: () => reveal("slot") },
    eligible.export && !show("export") && { key: "export", label: t("editor.props.exportTitle"), onSelect: () => updateExportPresets(engine, object.id, [createExportPreset()]) },
    eligible.variables && !show("variables") && { key: "variables", label: t("editor.variables.title"), onSelect: () => reveal("variables") },
    eligible.styles && !show("styles") && { key: "styles", label: t("styles.title"), onSelect: () => reveal("styles") },
    showRepeatArray && !show("modifiers") && { key: "modifiers", label: t("editor.props.modifiers"), onSelect: () => reveal("modifiers") },
  ].filter(Boolean);
}
