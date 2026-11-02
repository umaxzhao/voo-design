import PropTypes from "prop-types";
import { TOOL } from "../editor/editor_constants.js";
import { marqueeItemForMode, TOOL_FAMILIES } from "../editor/tool_families.js";
import { useI18n } from "../use_i18n.js";
import EditorFamilyMenu, { familyMenuItems } from "./editor_family_menu.jsx";
import { toolFamilyIcon } from "./tool_family_icons.jsx";

import EditorTooltip from "./editor_tooltip.jsx";

const toolButtonClass = (active) =>
  `relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
    active
      ? "bg-white text-black font-medium"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
  }`;

/**
 * Top-toolbar Marquee entry. The main button keeps selecting the rectangular
 * marquee; the chevron lists the selection family and its related tools.
 */
export default function EditorMarqueeMenu({
  tool,
  onTool,
  marqueeMode = "rect",
  onMarqueeMode,
}) {
  const { t } = useI18n();
  const isLassoTool = tool === TOOL.LASSO;
  const isActive = tool === TOOL.MARQUEE || isLassoTool;

  // Show the icon of the current family mode while one is active.
  const currentItem = marqueeItemForMode(
    isLassoTool ? "lasso" : isActive ? marqueeMode : "rect",
  );
  const ActiveIcon = toolFamilyIcon(currentItem?.icon || "selectionRect");

  const handleMainClick = () => {
    onMarqueeMode?.("rect");
    onTool(TOOL.MARQUEE);
  };

  const label = t("editor.tool.marquee") || "选区";

  const context = { tool, onTool, marqueeMode, onMarqueeMode };
  const items = [
    ...familyMenuItems(TOOL_FAMILIES.marquee, context),
    ...familyMenuItems(TOOL_FAMILIES.lasso, context),
  ];

  return (
    <EditorFamilyMenu menuId="marquee" items={items}>
      <EditorTooltip title={label} shortcut="M" side="top">
        <button
          type="button"
          onClick={handleMainClick}
          aria-label={label}
          aria-pressed={isActive}
          className={toolButtonClass(isActive)}
        >
          <ActiveIcon size={16} />
        </button>
      </EditorTooltip>
    </EditorFamilyMenu>
  );
}

EditorMarqueeMenu.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
  marqueeMode: PropTypes.string,
  onMarqueeMode: PropTypes.func,
};
