/** Optional sections have one home in the inspector add menu. */

export function buildPanelAddItems({ slotEligible, showSlot, reveal, t }) {
  return [
    slotEligible &&
      !showSlot && {
        key: "slot",
        label: t("editor.props.componentSlot"),
        onSelect: () => reveal("slot"),
      },
  ].filter(Boolean);
}
