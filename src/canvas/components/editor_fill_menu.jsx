import PropTypes from "prop-types";
import { IconBucket, IconGradient } from "../icons.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { TOOL_SHORTCUTS } from "../editor/editor_shortcuts.js";
import { TOOL_FAMILIES } from "../editor/tool_families.js";
import EditorFamilyMenu, { familyMenuItems } from "./editor_family_menu.jsx";
import { useI18n } from "../use_i18n.js";
import EditorTooltip from "./editor_tooltip.jsx";

const FILL_TOOLS = [TOOL.FILL, TOOL.GRADIENT];

const toolButtonClass = (active) =>
  `relative rounded-full p-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
    active
      ? "bg-white text-black font-medium"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
  }`;

export default function EditorFillMenu({ tool, onTool }) {
  const { t } = useI18n();
  const isActive = FILL_TOOLS.includes(tool);

  const ActiveIcon = tool === TOOL.GRADIENT ? IconGradient : IconBucket;
  const currentLabel =
    tool === TOOL.GRADIENT ? t("editor.tool.gradient") : t("editor.tool.fill");

  // The chevron lists every fill choice, so the properties panel does not have to.
  const items = familyMenuItems(TOOL_FAMILIES.fill, { tool, onTool });

  return (
    <EditorFamilyMenu menuId="fill" items={items}>
      <EditorTooltip
        title={currentLabel}
        shortcut={TOOL_SHORTCUTS[TOOL.FILL] || "G"}
        side="top"
      >
        <button
          type="button"
          onClick={() => onTool(TOOL.FILL)}
          aria-label={currentLabel}
          aria-pressed={isActive}
          className={toolButtonClass(isActive)}
        >
          <ActiveIcon size={16} />
        </button>
      </EditorTooltip>
    </EditorFamilyMenu>
  );
}

EditorFillMenu.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
};
