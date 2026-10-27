import PropTypes from "prop-types";
import {
  IconSquare,
  IconCircle,
  IconSlash,
  IconTriangle,
  IconStar,
  IconArrowUpRight,
} from "../icons.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { TOOL_FAMILIES } from "../editor/tool_families.js";
import EditorFamilyMenu, { familyMenuItems } from "./editor_family_menu.jsx";
import { useI18n } from "../use_i18n.js";

import EditorTooltip from "./editor_tooltip.jsx";

/** The shape tools grouped behind one toolbar button, Figma-style. */
const SHAPE_TOOLS = [
  TOOL.RECT,
  TOOL.ELLIPSE,
  TOOL.LINE,
  TOOL.POLYGON,
  TOOL.STAR,
  TOOL.ARROW,
];

const toolButtonClass = (active) =>
  `relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-0 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
    active
      ? "bg-white text-black font-medium"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
  }`;

/** The shape family uses the shared secondary icon bar below the toolbar. */
export default function ShapeToolsMenu({ tool, onTool }) {
  const { t } = useI18n();
  const isActive = SHAPE_TOOLS.includes(tool);

  const ActiveIcon =
    tool === TOOL.ELLIPSE
      ? IconCircle
      : tool === TOOL.LINE
        ? IconSlash
        : tool === TOOL.POLYGON
          ? IconTriangle
          : tool === TOOL.STAR
            ? IconStar
            : tool === TOOL.ARROW
              ? IconArrowUpRight
              : IconSquare;

  const currentLabel =
    tool === TOOL.ELLIPSE
      ? t("editor.tool.ellipse")
      : tool === TOOL.LINE
        ? t("editor.tool.line")
        : tool === TOOL.POLYGON
          ? t("editor.tool.polygon")
          : tool === TOOL.STAR
            ? t("editor.tool.star")
            : tool === TOOL.ARROW
              ? t("editor.tool.arrow")
              : t("editor.tool.shapes");

  // The chevron lists every shapes choice, so the properties panel does not have to.
  const items = familyMenuItems(TOOL_FAMILIES.shapes, { tool, onTool });

  return (
    <EditorFamilyMenu menuId="shapes" items={items}>
      <EditorTooltip title={currentLabel} shortcut="R" side="top">
        <button
          type="button"
          onClick={() => onTool(TOOL.RECT)}
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

ShapeToolsMenu.propTypes = {
  tool: PropTypes.oneOf(Object.values(TOOL)).isRequired,
  onTool: PropTypes.func.isRequired,
};
