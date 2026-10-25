import PropTypes from "prop-types";
import { TOOL } from "../editor/editor_constants.js";
import { TOOL_SHORTCUTS } from "../editor/editor_shortcuts.js";
import { TOOL_FAMILIES } from "../editor/tool_families.js";
import { useI18n } from "../use_i18n.js";
import EditorFamilyMenu, { familyMenuItems } from "./editor_family_menu.jsx";
import EditorTooltip from "./editor_tooltip.jsx";
import { toolFamilyIcon } from "./tool_family_icons.jsx";

const brushFamily = TOOL_FAMILIES.brush;

const toolButtonClass = (active) =>
  `relative rounded-full p-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
    active
      ? "bg-white text-black font-medium"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
  }`;

/**
 * Top-toolbar Brush entry. The main button keeps selecting the plain brush and
 * shows the icon of the current brush mode; the chevron lists every brush mode
 * (Normal, Smudge, Blur, Sharpen, Dodge, Burn, Sponge) so the properties panel
 * does not have to.
 */
export default function EditorBrushMenu({
  tool,
  onTool,
  brushMode = "normal",
  onBrushMode,
}) {
  const { t } = useI18n();
  const isActive = tool === TOOL.BRUSH;
  const currentItem =
    brushFamily.items.find((item) => item.id === brushMode) ??
    brushFamily.items[0];
  const ActiveIcon = toolFamilyIcon(currentItem.icon);
  // The plain brush keeps its tool name; the other modes name themselves.
  const label =
    currentItem.id === "normal"
      ? t("editor.tool.brush")
      : t(currentItem.labelKey);

  const items = familyMenuItems(brushFamily, {
    tool,
    onTool,
    onBrushMode,
    brushMode,
  });

  return (
    <EditorFamilyMenu menuId="brush" items={items}>
      <EditorTooltip
        title={label}
        shortcut={TOOL_SHORTCUTS[TOOL.BRUSH] || "B"}
        side="top"
      >
        <button
          type="button"
          data-testid="editor-brush-tool"
          onClick={() => {
            onBrushMode?.("normal");
            onTool(TOOL.BRUSH);
          }}
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

EditorBrushMenu.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
  brushMode: PropTypes.string,
  onBrushMode: PropTypes.func,
};
