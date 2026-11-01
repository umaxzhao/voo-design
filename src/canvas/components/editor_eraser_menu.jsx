import PropTypes from "prop-types";
import { IconEraser, IconMask } from "../icons.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { TOOL_SHORTCUTS } from "../editor/editor_shortcuts.js";
import { useI18n } from "../use_i18n.js";
import EditorFamilyMenu from "./editor_family_menu.jsx";
import EditorTooltip from "./editor_tooltip.jsx";

/**
 * Eraser tool with a second-level menu: the Eraser itself and Remove
 * Background, which cuts the background out of the selected layer.
 */
export default function EditorEraserMenu({
  tool,
  onTool,
  onRemoveBackground,
  removeBackgroundBusy = false,
}) {
  const { t } = useI18n();
  const isActive = tool === TOOL.ERASER;
  const label = t("editor.tool.eraser");

  const items = [
    {
      key: "eraser",
      labelKey: "editor.tool.eraser",
      Icon: IconEraser,
      active: isActive,
      onChoose: () => onTool(TOOL.ERASER),
    },
    {
      key: "removeBackground",
      labelKey: "editor.taskbar.removeBackground",
      Icon: IconMask,
      active: false,
      disabled: removeBackgroundBusy,
      onChoose: onRemoveBackground,
    },
  ];

  return (
    <EditorFamilyMenu menuId="eraser" items={items}>
      <EditorTooltip title={label} shortcut={TOOL_SHORTCUTS[TOOL.ERASER] || ""} side="top">
        <button
          type="button"
          onClick={() => onTool(TOOL.ERASER)}
          aria-label={label}
          aria-pressed={isActive}
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
            isActive
              ? "bg-white text-black font-medium"
              : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          }`}
        >
          <IconEraser size={16} />
        </button>
      </EditorTooltip>
    </EditorFamilyMenu>
  );
}

EditorEraserMenu.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
  onRemoveBackground: PropTypes.func.isRequired,
  removeBackgroundBusy: PropTypes.bool,
};
