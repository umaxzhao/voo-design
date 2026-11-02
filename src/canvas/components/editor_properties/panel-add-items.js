/** Optional sections have one home in the inspector add menu. */

export function buildPanelAddItems({
  slotEligible,
  showSlot,
  eligible,
  show,
  showRepeatArray,
  reveal,
  t,
}) {
  return [
    slotEligible &&
      !showSlot && {
        key: "slot",
        label: t("editor.props.componentSlot"),
        onSelect: () => reveal("slot"),
      },
    eligible.variables &&
      !show("variables") && {
        key: "variables",
        label: t("editor.variables.title"),
        onSelect: () => reveal("variables"),
      },
    eligible.styles &&
      !show("styles") && {
        key: "styles",
        label: t("styles.title"),
        onSelect: () => reveal("styles"),
      },
    showRepeatArray &&
      !show("modifiers") && {
        key: "modifiers",
        label: t("editor.props.modifiers"),
        onSelect: () => reveal("modifiers"),
      },
  ].filter(Boolean);
}
