import PropTypes from "prop-types";
import { IconChevronDown } from "../icons.jsx";
import { TOOL } from "../editor/editor_constants.js";
import {
  marqueeItemForMode,
  MARQUEE_MODE_IDS,
} from "../editor/tool_families.js";
import { useI18n } from "../use_i18n.js";
import { toolFamilyIcon } from "./tool_family_icons.jsx";

import EditorTooltip from "./editor_tooltip.jsx";

const toolButtonClass = (active) =>
  `relative rounded-full p-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
    active
      ? "bg-white text-black font-medium"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
  }`;

export default function EditorMarqueeMenu({
  tool,
  onTool,
  marqueeMode = "rect",
  onMarqueeMode,
  onOpenFamily,
}) {
  const { t } = useI18n();
  const isMarqueeActive =
    tool === TOOL.MARQUEE &&
    marqueeMode !== "poly" &&
    marqueeMode !== "magnetic";

  const currentMode = marqueeMode === "ellipse" ? "ellipse" : "rect";
  const currentItem = marqueeItemForMode(currentMode);
  const ActiveIcon = toolFamilyIcon(currentItem?.icon || "selectionRect");

  const handleMainClick = () => {
    onMarqueeMode?.(currentMode);
    onTool(TOOL.MARQUEE);
  };

  const label = t("editor.tool.marquee") || "选区";

  return (
    <div className="relative flex items-center">
      {/* 主选择工具按钮 */}
      <EditorTooltip title={label} shortcut="M" side="top">
        <button
          type="button"
          onClick={handleMainClick}
          aria-label={label}
          aria-pressed={isMarqueeActive}
          className={toolButtonClass(isMarqueeActive)}
        >
          <ActiveIcon size={16} />
          <IconChevronDown
            size={7}
            className={`absolute bottom-1 right-1 pointer-events-none ${
              isMarqueeActive ? "text-black/70" : "text-neutral-400"
            }`}
          />
        </button>
      </EditorTooltip>
    </div>
  );
}

EditorMarqueeMenu.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
  marqueeMode: PropTypes.string,
  onMarqueeMode: PropTypes.func,
  onOpenFamily: PropTypes.func,
};
