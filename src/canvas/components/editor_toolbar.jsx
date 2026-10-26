import { EDITOR_BETA_ENABLED } from "../editor-beta-features.js";
import PropTypes from "prop-types";
import {
  IconCrop,
  IconEraser,
  IconFrame,
  IconHand,
  IconText,
} from "../icons.jsx";
import EditorBrushMenu from "./editor_brush_menu.jsx";
import EditorSelectMenu from "./editor_select_menu.jsx";
import ShapeToolsMenu from "./editor_shape_menu.jsx";
import EditorMarqueeMenu from "./editor_marquee_menu.jsx";
import EditorHealingMenu from "./editor_healing_menu.jsx";
import EditorObject3dMenu from "./editor_object3d_menu.jsx";
import EditorPenMenu from "./editor_pen_menu.jsx";
import EditorFillMenu from "./editor_fill_menu.jsx";
import { TOOL } from "../editor/editor_constants.js";
import { TOOL_SHORTCUTS } from "../editor/editor_shortcuts.js";
import { useI18n } from "../use_i18n.js";
import EditorTooltip from "./editor_tooltip.jsx";

/** Shared by every mode's top toolbar so the active tool reads the same. */
export const toolButtonClass = (active) =>
  `rounded-full p-2.5 transition-all focus-visible:ring-2 focus-visible:ring-[#a7ffd4] focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-900 ${
    active
      ? "bg-white text-black font-medium"
      : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
  }`;

/**
 * Floating toolbar at the top-centre of the editor stage.
 */
export default function EditorToolbar({
  tool,
  onTool,
  regionMode,
  onRegionMode,
  healingMode,
  onHealingMode,
  marqueeMode,
  onMarqueeMode,
  brushMode = "normal",
  onBrushMode,
  /**
   * "design" is the full pixel + vector row. "motion" drops the destructive
   * pixel tools: a motion page still composes/animate layers, and painting or
   * cropping a frame belongs in the design surface where the layer keeps its
   * data across the switch.
   */
  variant = "design",
  /** Inserts a 3D object ("box" | "sphere" | "plane") into the frame. */
  onAddObject3d = null,
}) {
  const { t } = useI18n();
  const motionVariant = variant === "motion";

  const renderTool = (entry) => {
    const isActive = tool === entry.id;
    const shortcut = TOOL_SHORTCUTS[entry.id] || "";
    return (
      <EditorTooltip
        key={entry.id}
        title={entry.label}
        shortcut={shortcut}
        side="top"
      >
        <button
          type="button"
          onClick={() => onTool(entry.id)}
          aria-label={entry.label}
          aria-pressed={isActive}
          className={`relative ${toolButtonClass(isActive)}`}
        >
          {entry.icon}
        </button>
      </EditorTooltip>
    );
  };

  return (
    <div
      data-testid="editor-toolbar"
      data-mode={variant}
      role="toolbar"
      aria-label={t("editor.toolbar.label")}
      className="absolute top-[14px] left-1/2 z-30 -translate-x-1/2 max-w-[calc(100vw-16px)]"
    >
      <div className="flex items-center gap-1 rounded-full border border-white/10 bg-black/90 p-1.5 shadow-pop backdrop-blur-md font-mono max-w-full overflow-x-auto no-scrollbar">
        {/* 1. 选择工具（select）：统一入口 —— 光标选择 + 透视 / 扭曲 / 操控变形（下拉菜单） */}
        <div className="relative flex items-center">
          <EditorSelectMenu tool={tool} onTool={onTool} />
        </div>

        {/* 2. 抓手工具（H）：拖动画布，快速平移视图 */}
        {renderTool({
          id: TOOL.HAND,
          icon: <IconHand size={16} />,
          label: t("editor.tool.hand"),
        })}

        {!motionVariant ? (
          <>
            {renderTool({
              id: TOOL.FRAME,
              icon: <IconFrame size={16} />,
              label: t("editor.tool.frame"),
            })}

            {/* 2. 裁切工具 (Crop) */}
            {renderTool({
              id: TOOL.CROP,
              icon: <IconCrop size={16} />,
              label: t("editor.tool.crop"),
            })}

            {/* 3. 选区工具组 (框选 / 椭圆 / 多边形 / 套索 / 魔棒 / 对象选择) */}
            <div
              className="relative flex items-center"
            >
              <EditorMarqueeMenu
                tool={tool}
                onTool={onTool}
                marqueeMode={marqueeMode}
                onMarqueeMode={onMarqueeMode}
                regionMode={regionMode}
                onRegionMode={onRegionMode}
              />
            </div>

            {/* 4. 画笔工具 */}
            <div
              className="relative flex items-center"
            >
              <EditorBrushMenu
                tool={tool}
                onTool={onTool}
                brushMode={brushMode}
                onBrushMode={onBrushMode}
              />
            </div>

            {/* 5. 橡皮擦工具 */}
            {renderTool({
              id: TOOL.ERASER,
              icon: <IconEraser size={16} />,
              label: t("editor.tool.eraser"),
            })}

          </>
        ) : null}

        {/* 6. 文字工具 */}
        {renderTool({
          id: TOOL.TEXT,
          icon: <IconText size={16} />,
          label: t("editor.tool.text"),
        })}

        {/* 7. 钢笔 & 形状工具组 (shown in every variant) */}
        <div
          className="relative flex items-center"
        >
          <EditorPenMenu tool={tool} onTool={onTool} />
        </div>
        <div
          className="relative flex items-center"
        >
          <ShapeToolsMenu tool={tool} onTool={onTool} />
        </div>

        {!motionVariant ? (
          <>
            {/* 8. 填充 & 渐变工具组 (Fill & Gradient) */}
            <div
              className="relative flex items-center"
            >
              <EditorFillMenu tool={tool} onTool={onTool} />
            </div>

            {/* 9. 经典修复工具组 (AI修补 / 污点修复 / 修补工具 / 仿制图章) */}
            <div
              className="relative flex items-center"
            >
              <EditorHealingMenu
                tool={tool}
                onTool={onTool}
                healingMode={healingMode}
                onHealingMode={onHealingMode}
              />
            </div>
          </>
        ) : null}
        {EDITOR_BETA_ENABLED && onAddObject3d ? (
          <EditorObject3dMenu onAdd={onAddObject3d} />
        ) : null}
      </div>
    </div>
  );
}

EditorToolbar.propTypes = {
  tool: PropTypes.string.isRequired,
  onTool: PropTypes.func.isRequired,
  regionMode: PropTypes.string,
  onRegionMode: PropTypes.func,
  healingMode: PropTypes.oneOf(["spot", "aiRepair", "patch", "clone"]),
  onHealingMode: PropTypes.func,
  marqueeMode: PropTypes.string,
  onMarqueeMode: PropTypes.func,
  brushMode: PropTypes.string,
  onBrushMode: PropTypes.func,
  variant: PropTypes.oneOf(["design", "motion"]),
  onAddObject3d: PropTypes.func,
};

export { EditorActions } from "./editor_actions.jsx";
export { EditorZoom } from "./editor_zoom.jsx";
