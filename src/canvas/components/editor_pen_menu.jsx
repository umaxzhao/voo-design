import PropTypes from "prop-types";
import { IconPen, IconSparkle, IconEdit } from "../icons.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { TOOL_FAMILIES } from "../editor/tool_families.js";
import EditorFamilyMenu, { familyMenuItems } from "./editor_family_menu.jsx";
import { useI18n } from "../use_i18n.js";
import EditorTooltip from "./editor_tooltip.jsx";

/** The pen family uses the shared secondary icon bar below the toolbar. */
const PEN_TOOLS = [TOOL.PEN, TOOL.CURVATURE_PEN, TOOL.FREE_PEN];

const toolButtonClass = (active) =>
  `relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
    active
      ? "bg-white text-black font-medium"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
  }`;

export default function EditorPenMenu({ tool, onTool }) {
  const { t } = useI18n();
  const isActive = PEN_TOOLS.includes(tool);

  const ActiveIcon =
    tool === TOOL.CURVATURE_PEN
      ? IconSparkle
      : tool === TOOL.FREE_PEN
        ? IconEdit
        : IconPen;

  const currentLabel =
    tool === TOOL.CURVATURE_PEN
      ? t("editor.tool.curvaturePen")
      : tool === TOOL.FREE_PEN
        ? t("editor.tool.freePen")
        : t("editor.tool.pen");

  // The chevron lists every pen choice, so the properties panel does not have to.
  const items = familyMenuItems(TOOL_FAMILIES.pen, { tool, onTool });

  return (
    <EditorFamilyMenu menuId="pen" items={items}>
      <EditorTooltip title={currentLabel} shortcut="P" side="top">
        <button
          type="button"
          onClick={() => onTool(TOOL.PEN)}
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

EditorPenMenu.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
};
