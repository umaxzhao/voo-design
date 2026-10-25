import PropTypes from "prop-types";
import {
  IconHealAi,
  IconHealClone,
  IconHealPatch,
  IconHealSpot,
} from "../icons.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { TOOL_FAMILIES } from "../editor/tool_families.js";
import { useI18n } from "../use_i18n.js";
import EditorFamilyMenu, { familyMenuItems } from "./editor_family_menu.jsx";

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
  onHealingMode,
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

  // The chevron lists AI Repair, Spot Healing, Patch and Clone Stamp.
  const items = familyMenuItems(TOOL_FAMILIES.healing, {
    tool,
    onTool,
    onHealingMode,
    healingMode,
  });

  return (
    <EditorFamilyMenu menuId="healing" items={items}>
      <EditorTooltip title={currentLabel} shortcut={shortcut} side="top">
        <button
          type="button"
          onClick={() => {
            onHealingMode?.("aiRepair");
            onTool(TOOL.HEALING);
          }}
          aria-label={currentLabel}
          aria-pressed={isActive}
          className={`relative rounded-full p-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
            isActive
              ? "bg-white text-black font-medium"
              : isAiTool
                ? "text-neutral-300 hover:bg-white/15 hover:text-neutral-300"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          }`}
        >
          <ActiveIcon
            size={16}
            className={isAiTool ? "text-[#E5B2FF]" : undefined}
          />
        </button>
      </EditorTooltip>
    </EditorFamilyMenu>
  );
}

EditorHealingMenu.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
  healingMode: PropTypes.oneOf(["spot", "aiRepair", "patch", "clone"]),
  onHealingMode: PropTypes.func,
};
