import PropTypes from "prop-types";
import {
  IconChevronDown,
  IconHealAi,
  IconHealClone,
  IconHealPatch,
  IconHealSpot,
} from "../icons.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { useI18n } from "../use_i18n.js";

import EditorTooltip from "./editor_tooltip.jsx";

/**
 * Healing Tools Menu:
 * - AI Repair (AI 修补)
 * - Spot Healing Brush (污点修复画笔)
 * - Patch Tool (修补工具)
 * - Clone Stamp Tool (仿制图章工具)
 */
export default function EditorHealingMenu({
  tool,
  onTool,
  healingMode = "aiRepair",
}) {
  const { t } = useI18n();

  const isActive = tool === TOOL.HEALING;
  const isAiTool = healingMode === "aiRepair";
  const ActiveIcon =
    healingMode === "clone"
      ? IconHealClone
      : healingMode === "patch"
        ? IconHealPatch
        : healingMode === "aiRepair"
          ? IconHealAi
          : IconHealSpot;

  const currentLabel =
    healingMode === "clone"
      ? t("editor.tool.clone")
      : healingMode === "patch"
        ? t("editor.tool.patch")
        : healingMode === "aiRepair"
          ? t("editor.tool.aiRepair")
          : t("editor.tool.spotHealing");

  const shortcut = healingMode === "clone" ? "S" : "J";

  return (
    <div className="relative flex items-center">
      <EditorTooltip title={currentLabel} shortcut={shortcut} side="top">
        <button
          type="button"
          onClick={() => {
            onTool(TOOL.HEALING);
          }}
          aria-label={currentLabel}
          aria-pressed={isActive}
          className={`relative rounded-full p-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
            isActive
              ? isAiTool
                ? "bg-[#E5B2FF] text-black font-medium"
                : "bg-white text-black font-medium"
              : isAiTool
                ? "text-neutral-300 hover:bg-[#E5B2FF]/15 hover:text-neutral-300"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          }`}
        >
          <ActiveIcon size={16} />
          <IconChevronDown
            size={7}
            className={`absolute bottom-1 right-1 pointer-events-none ${
              isActive
                ? "text-black/70"
                : isAiTool
                  ? "text-neutral-300/70"
                  : "text-neutral-400"
            }`}
          />
        </button>
      </EditorTooltip>
    </div>
  );
}

EditorHealingMenu.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
  healingMode: PropTypes.oneOf(["spot", "aiRepair", "patch", "clone"]),
};
