/**
 * Optional sections have one home in the inspector add menu. Export, colour
 * variables, styles and modifiers are always present when relevant (title row
 * plus add entry), so only the component slot remains a reveal-on-demand item.
 */
export function buildPanelAddItems({ slotEligible, showSlot, reveal, t }) {
  return [
    slotEligible && !showSlot && { key: "slot", label: t("editor.props.componentSlot"), onSelect: () => reveal("slot") },
  ].filter(Boolean);
}
