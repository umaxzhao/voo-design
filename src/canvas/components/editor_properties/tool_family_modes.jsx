import PropTypes from "prop-types";
import { TOOL } from "../../editor/editor_constants.js";
import { TOOL_FAMILIES } from "../../editor/tool_families.js";
import { useI18n } from "../../use_i18n.js";
import { StaticSection, sectionRowClass } from "./property_section.jsx";

const MODE_FAMILIES = [
  "lasso",
  "marquee",
  "brush",
  "healing",
  "select",
  "pen",
  "shapes",
  "fill",
];

// The select family (Select / Distort / Perspective / Puppet) is chosen from
// the top toolbar's Select menu, so the properties panel does not repeat it.
const TOP_TOOLBAR_SELECT_TOOLS = [
  TOOL.SELECT,
  TOOL.DISTORT,
  TOOL.PERSPECTIVE,
  TOOL.PUPPET_WARP,
];

export default function ToolFamilyModes({
  tool,
  marqueeMode,
  brushMode,
  healingMode,
  onTool,
  onMarqueeMode,
  onBrushMode,
  onHealingMode,
}) {
  const { t } = useI18n();
  if (TOP_TOOLBAR_SELECT_TOOLS.includes(tool)) return null;
  const family = MODE_FAMILIES.map((id) => TOOL_FAMILIES[id]).find((item) =>
    item.matchTool(tool, marqueeMode),
  );
  if (!family) return null;

  const selected =
    family.id === "brush"
      ? brushMode
      : family.id === "healing"
        ? healingMode
        : family.id === "lasso" && tool === TOOL.LASSO
          ? "lasso"
          : family.id === "marquee" || family.id === "lasso"
            ? marqueeMode
            : tool;
  const apply = (item) => {
    family.applyItem(item, {
      tool,
      onTool,
      onMarqueeMode,
      onBrushMode,
      onHealingMode,
    });
  };

  return (
    <StaticSection title={t("editor.toolOptions")}>
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t("editor.toolOptions")}>
        {family.items.map((item) => {
          const active = item.id === selected;
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`tool-family-mode-${item.id}`}
              aria-pressed={active}
              aria-label={t(item.labelKey)}
              onClick={() => apply(item)}
              className={`${sectionRowClass} justify-center text-[10px] ${active ? "text-white ring-1 ring-white/25" : "text-neutral-400"}`}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>
    </StaticSection>
  );
}

ToolFamilyModes.propTypes = {
  tool: PropTypes.string,
  marqueeMode: PropTypes.string,
  brushMode: PropTypes.string,
  healingMode: PropTypes.string,
  onTool: PropTypes.func,
  onMarqueeMode: PropTypes.func,
  onBrushMode: PropTypes.func,
  onHealingMode: PropTypes.func,
};
