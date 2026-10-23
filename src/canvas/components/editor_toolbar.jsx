import { useEffect, useRef, useState } from "react";
import { Magnet } from "lucide-react";
import { EDITOR_BETA_ENABLED } from "../editor-beta-features.js";
import PropTypes from "prop-types";
import {
  IconAdd,
  IconBrush,
  IconChevronDown,
  IconClose,
  IconCrop,
  IconCursor,
  IconDistort,
  IconDroplet,
  IconEraser,
  IconGrid3x3,
  IconHistory,
  IconMinus,
  IconPerspective,
  IconPointer,
  IconCone,
  IconSun,
  IconMoon,
  IconPalette,
  IconRedo,
  IconSwap,
  IconText,
  IconUndo,
  IconVectorSquare,
  ICON_STROKE_WIDTH,
} from "../icons.jsx";
import ShapeToolsMenu from "./editor_shape_menu.jsx";
import EditorMarqueeMenu from "./editor_marquee_menu.jsx";
import EditorLassoMenu from "./editor_lasso_menu.jsx";
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

// Puppet / deform pin icon (repo-inline SVG so the toolbar does not pull
// lucide-react into the entry chunk — keeps it symmetric with the subbar's
// icon, which loads lucide in the lazy ImageEditor chunk).
function PuppetIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" x2="12" y1="17" y2="21" />
      <path d="M5 9L9 5l17 17-4 4-10-10" />
      <path d="M9 5l2-2a2 2 0 0 1 2.83 0L19 8a2 2 0 0 1 0 2.83l-2 2" />
    </svg>
  );
}

PuppetIcon.propTypes = {
  size: PropTypes.number,
};

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
  onHoverFamily = null,
  onLeaveFamily = null,
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

  // The "Select" entry is the unified entry for the select family: the plain
  // cursor tool and the three transform tools (Perspective / Distort / Puppet).
  // The entry shows the active member's icon; the tool subbar lists the modes.
  const isSelectFamily =
    tool === TOOL.SELECT ||
    tool === TOOL.SELECT_REGION ||
    tool === TOOL.PERSPECTIVE ||
    tool === TOOL.DISTORT ||
    tool === TOOL.PUPPET_WARP;
  const SelectFamilyIcon =
    tool === TOOL.PERSPECTIVE
      ? IconPerspective
      : tool === TOOL.DISTORT
        ? IconDistort
        : tool === TOOL.PUPPET_WARP
          ? PuppetIcon
          : tool === TOOL.SELECT_REGION
            ? IconVectorSquare
            : IconCursor;

  const isBrushActive = tool === TOOL.BRUSH;
  const ActiveBrushIcon =
    brushMode === "smudge"
      ? IconPointer
      : brushMode === "blur"
        ? IconDroplet
        : brushMode === "sharpen"
          ? IconCone
          : brushMode === "dodge"
            ? IconSun
            : brushMode === "burn"
              ? IconMoon
              : brushMode === "sponge"
                ? IconPalette
                : IconBrush;

  const brushLabel =
    brushMode === "smudge"
      ? t("editor.brushMode.smudge")
      : brushMode === "blur"
        ? t("editor.brushMode.blur")
        : brushMode === "sharpen"
          ? t("editor.brushMode.sharpen")
          : brushMode === "dodge"
            ? t("editor.brushMode.dodge")
            : brushMode === "burn"
              ? t("editor.brushMode.burn")
              : brushMode === "sponge"
                ? t("editor.brushMode.sponge")
                : t("editor.tool.brush");

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
          onMouseEnter={() => {
            if (entry.familyId) onHoverFamily?.(entry.familyId);
            else onLeaveFamily?.();
          }}
        >
          {entry.icon}
          {(entry.id === TOOL.BRUSH || entry.chevron) && (
            <IconChevronDown
              size={7}
              className={`absolute bottom-1 right-1 pointer-events-none ${
                isActive ? "text-black/70" : "text-neutral-400"
              }`}
            />
          )}
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
      onMouseLeave={() => onLeaveFamily?.()}
    >
      <div className="flex items-center gap-1 rounded-full bg-black/90 p-1.5 shadow-pop backdrop-blur-md font-mono max-w-full overflow-x-auto no-scrollbar">
        {/* 1. 选择工具（select）：统一入口 —— 光标选择 + 透视 / 网格扭曲 / 操控变形 */}
        <div
          data-family-id="select"
          onMouseEnter={() => onHoverFamily?.("select")}
          className="relative flex items-center rounded-lg border border-black/10"
        >
          <EditorTooltip
            title={t("editor.tool.select")}
            shortcut={TOOL_SHORTCUTS[TOOL.SELECT] || ""}
            side="top"
          >
            <button
              type="button"
              onClick={() => onTool(TOOL.SELECT)}
              aria-label={t("editor.tool.select")}
              aria-pressed={isSelectFamily}
              className={`relative ${toolButtonClass(isSelectFamily)}`}
            >
              <SelectFamilyIcon size={16} />
              <IconChevronDown
                size={7}
                className={`absolute bottom-1 right-1 pointer-events-none ${
                  isSelectFamily ? "text-black/70" : "text-neutral-400"
                }`}
              />
            </button>
          </EditorTooltip>
        </div>

        {!motionVariant ? (
          <>
            {/* 2. 裁切工具 (Crop) */}
            {renderTool({
              id: TOOL.CROP,
              icon: <IconCrop size={16} />,
              label: t("editor.tool.crop"),
            })}

            {/* 3. 选区工具组 (框选 / 椭圆 / 多边形 / 套索 / 魔棒 / 对象选择) */}
            <div
              data-family-id="marquee"
              onMouseEnter={() => onHoverFamily?.("marquee")}
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
              data-family-id="brush"
              onMouseEnter={() => onHoverFamily?.("brush")}
              className="relative flex items-center"
            >
              <EditorTooltip
                title={brushLabel}
                shortcut={TOOL_SHORTCUTS[TOOL.BRUSH] || "B"}
                side="top"
              >
                <button
                  type="button"
                  onClick={() => onTool(TOOL.BRUSH)}
                  aria-label={brushLabel}
                  aria-pressed={isBrushActive}
                  className={`relative ${toolButtonClass(isBrushActive)}`}
                >
                  <ActiveBrushIcon size={16} />
                  <IconChevronDown
                    size={7}
                    className={`absolute bottom-1 right-1 pointer-events-none ${
                      isBrushActive ? "text-black/70" : "text-neutral-400"
                    }`}
                  />
                </button>
              </EditorTooltip>
            </div>

            {/* 5. 橡皮擦工具 */}
            {renderTool({
              id: TOOL.ERASER,
              icon: <IconEraser size={16} />,
              label: t("editor.tool.eraser"),
            })}

            {/* 6. 填充 & 渐变工具组 (Fill & Gradient) */}
            <div
              data-family-id="fill"
              onMouseEnter={() => onHoverFamily?.("fill")}
              className="relative flex items-center"
            >
              <EditorFillMenu tool={tool} onTool={onTool} />
            </div>

            {/* 7. 经典修复工具组 (AI修补 / 污点修复 / 修补工具 / 仿制图章) */}
            <div
              data-family-id="healing"
              onMouseEnter={() => onHoverFamily?.("healing")}
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

        {/* 7. 文字工具 */}
        {renderTool({
          id: TOOL.TEXT,
          icon: <IconText size={16} />,
          label: t("editor.tool.text"),
        })}

        {/* 8. 钢笔 & 形状工具组 */}
        <div
          data-family-id="pen"
          onMouseEnter={() => onHoverFamily?.("pen")}
          className="relative flex items-center"
        >
          <EditorPenMenu tool={tool} onTool={onTool} />
        </div>
        <div
          data-family-id="shapes"
          onMouseEnter={() => onHoverFamily?.("shapes")}
          className="relative flex items-center"
        >
          <ShapeToolsMenu tool={tool} onTool={onTool} />
        </div>
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
  onHoverFamily: PropTypes.func,
  onLeaveFamily: PropTypes.func,
  variant: PropTypes.oneOf(["design", "motion"]),
  onAddObject3d: PropTypes.func,
};

/**
 * The floating top-right control cluster: layers toggle, close, and the
 * primary apply button, with the save-error pill when a save failed.
 */
export function EditorActions({
  historyOpen,
  busy,
  applyError,
  dirtyCount = 0,
  axis = "horizontal",
  onToggleAxis = null,
  onAddPage = null,
  onToggleHistory,
  onClose,
  onApply,
  exportOpen,
  onToggleExport,
  savedNotice = false,
  multi = false,
  showGrid = false,
  onToggleGrid = null,
  canUndo = false,
  canRedo = false,
  onUndo = null,
  onRedo = null,
}) {
  const { t } = useI18n();

  return (
    <div className="absolute right-4 top-3.5 z-30 flex items-center gap-1.5 font-mono">
      {/* 撤销 / 重做 */}
      <div className="flex items-center rounded-full bg-black/90 p-1 shadow-pop backdrop-blur-md">
        <EditorTooltip title={t("editor.undo")} shortcut="⌘Z" side="bottom">
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            aria-label={t("editor.undo")}
            className="rounded-full p-2 text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          >
            <IconUndo size={15} />
          </button>
        </EditorTooltip>
        <EditorTooltip title={t("editor.redo")} shortcut="⇧⌘Z" side="bottom">
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            aria-label={t("editor.redo")}
            className="rounded-full p-2 text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
          >
            <IconRedo size={15} />
          </button>
        </EditorTooltip>
      </div>

      {/* 显示网格 */}
      {onToggleGrid ? (
        <div className="flex items-center rounded-full bg-black/90 p-1 shadow-pop backdrop-blur-md">
          <EditorTooltip
            title={t("editor.view.grid")}
            shortcut="⌘'"
            side="bottom"
          >
            <button
              type="button"
              onClick={onToggleGrid}
              aria-label={t("editor.view.grid")}
              aria-pressed={showGrid}
              className={`rounded-full p-2 transition-all ${
                showGrid
                  ? "bg-white text-black font-medium"
                  : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              }`}
            >
              <IconGrid3x3 size={15} />
            </button>
          </EditorTooltip>
        </div>
      ) : null}

      {/* 历史记录抽屉开关 */}
      {onToggleHistory ? (
        <div className="flex items-center rounded-full bg-black/90 p-1 shadow-pop backdrop-blur-md">
          <EditorTooltip
            title={t("editor.history")}
            shortcut="⌥⌘Z"
            side="bottom"
          >
            <button
              type="button"
              onClick={onToggleHistory}
              aria-label={t("editor.history")}
              aria-pressed={historyOpen}
              className={`rounded-full p-2 transition-all ${
                historyOpen
                  ? "bg-white text-black font-medium"
                  : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
              }`}
            >
              <IconHistory size={15} />
            </button>
          </EditorTooltip>
        </div>
      ) : null}

      {/* 多画布排布切换（横向 / 纵向） */}
      {multi && onToggleAxis ? (
        <div className="flex items-center rounded-full bg-black/90 p-1 shadow-pop backdrop-blur-md">
          <EditorTooltip title={t("editor.pages.toggleAxis")} side="bottom">
            <button
              type="button"
              onClick={onToggleAxis}
              aria-label={t("editor.pages.toggleAxis")}
              className="rounded-full p-2 text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100"
            >
              <IconSwap
                size={15}
                className={axis === "vertical" ? "rotate-90" : ""}
              />
            </button>
          </EditorTooltip>
        </div>
      ) : null}

      {/* 添加画布（多画布模式） */}
      {multi && onAddPage ? (
        <div className="flex items-center rounded-full bg-black/90 p-1 shadow-pop backdrop-blur-md">
          <EditorTooltip title={t("editor.pages.add")} side="bottom">
            <button
              type="button"
              onClick={onAddPage}
              aria-label={t("editor.pages.add")}
              className="rounded-full p-2 text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100"
            >
              <IconAdd size={15} />
            </button>
          </EditorTooltip>
        </div>
      ) : null}

      {/* 导出菜单开关 */}
      <div className="flex items-center rounded-full bg-black/90 p-1 shadow-pop backdrop-blur-md">
        <EditorTooltip title={t("editor.export")} shortcut="⇧⌘E" side="bottom">
          <button
            type="button"
            onClick={onToggleExport}
            aria-label={t("editor.export")}
            aria-expanded={exportOpen}
            className={`rounded-full px-3 py-1.5 text-[11px] font-mono transition-all ${
              exportOpen
                ? "bg-white text-black font-medium"
                : "text-neutral-300 hover:bg-neutral-800 hover:text-neutral-100"
            }`}
          >
            {t("editor.export")}
          </button>
        </EditorTooltip>
      </div>

      {/* 保存 / 应用按钮 */}
      <div className="flex items-center rounded-full bg-black/90 p-1 shadow-pop backdrop-blur-md">
        <EditorTooltip title={t("editor.apply")} shortcut="⌘S" side="bottom">
          <button
            type="button"
            disabled={busy}
            onClick={onApply}
            aria-label={t("editor.apply")}
            className="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-mono font-medium text-black transition-all hover:bg-neutral-200 disabled:opacity-50"
          >
            {busy ? (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
            ) : null}
            <span>{t("editor.apply")}</span>
            {dirtyCount > 0 ? (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            ) : null}
          </button>
        </EditorTooltip>
      </div>

      {/* 关闭 / 退出编辑器 */}
      <div className="flex items-center rounded-full bg-black/90 p-1 shadow-pop backdrop-blur-md">
        <EditorTooltip
          title={t("editor.exit.discard")}
          shortcut="Tab"
          side="bottom"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label={t("editor.exit.discard")}
            className="rounded-full p-2 text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100"
          >
            <IconClose size={15} />
          </button>
        </EditorTooltip>
      </div>

      {/* 保存成功提示 */}
      {savedNotice ? (
        <div className="pointer-events-none absolute right-0 top-full mt-2 flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/95 px-3 py-1.5 text-[11px] text-emerald-400 shadow-pop backdrop-blur-md">
          <span>✓</span>
          <span>{t("editor.saved")}</span>
        </div>
      ) : null}

      {/* 保存失败提示 */}
      {applyError ? (
        <div className="pointer-events-none absolute right-0 top-full mt-2 flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-400 shadow-pop backdrop-blur-md">
          <span>{t("editor.saveFailed")}</span>
        </div>
      ) : null}
    </div>
  );
}

EditorActions.propTypes = {
  historyOpen: PropTypes.bool,
  busy: PropTypes.bool,
  applyError: PropTypes.bool,
  dirtyCount: PropTypes.number,
  axis: PropTypes.string,
  onToggleAxis: PropTypes.func,
  onAddPage: PropTypes.func,
  onToggleHistory: PropTypes.func,
  onClose: PropTypes.func.isRequired,
  onApply: PropTypes.func.isRequired,
  exportOpen: PropTypes.bool,
  onToggleExport: PropTypes.func.isRequired,
  savedNotice: PropTypes.bool,
  multi: PropTypes.bool,
  showGrid: PropTypes.bool,
  onToggleGrid: PropTypes.func,
  canUndo: PropTypes.bool,
  canRedo: PropTypes.bool,
  onUndo: PropTypes.func,
  onRedo: PropTypes.func,
};

/**
 * The floating bottom-center zoom cluster: zoom in, current zoom (click to
 * fit the page), zoom out. Matches the outer canvas viewport-tools design.
 */
export function EditorZoom({
  zoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onFit,
  grid,
  onToggleGrid,
  snapToGrid = false,
  onToggleSnapToGrid,
  gridSize = 32,
  onSetGridSize,
  onAddCanvas = null,
  children = null,
}) {
  const { t } = useI18n();
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const gridControlRef = useRef(null);
  const gridMenuTriggerRef = useRef(null);
  const gridMenuRef = useRef(null);
  useEffect(() => {
    if (!gridMenuOpen) return;
    gridMenuRef.current?.querySelector('[role^="menuitem"]')?.focus();
    const onOutside = (event) => {
      if (!gridControlRef.current?.contains(event.target)) setGridMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setGridMenuOpen(false);
        gridMenuTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [gridMenuOpen]);

  return (
    <div
      data-testid="editor-bottom-toolbar"
      role="toolbar"
      aria-label={t("editor.bottomBar.label")}
      className="viewport-tools absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-0.5 rounded-xl px-1 py-0.5 shadow-pop"
    >
      {onAddCanvas ? (
        <button
          type="button"
          data-testid="editor-add-canvas-btn"
          onClick={onAddCanvas}
          title={t("editor.addCanvas")}
          aria-label={t("editor.addCanvas")}
          className="flex h-12 w-12 md:h-7 md:w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
        >
          <IconAdd size={13} strokeWidth={1.5} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title={t("editor.undo")}
        aria-label={t("editor.undo")}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-30 disabled:hover:opacity-30"
      >
        <IconUndo size={13} />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title={t("editor.redo")}
        aria-label={t("editor.redo")}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 disabled:opacity-30 disabled:hover:opacity-30"
      >
        <IconRedo size={13} />
      </button>

      <div className="h-3.5 w-[1px] bg-black/15 mx-0.5" />

      <div ref={gridControlRef} className="relative flex items-center">
        <button
          type="button"
          onContextMenu={(event) => {
            event.preventDefault();
            setGridMenuOpen(true);
          }}
          onClick={onToggleGrid}
          title={t("editor.view.grid")}
          aria-label={t("editor.view.grid")}
          aria-pressed={Boolean(grid)}
          className={`flex h-7 w-7 items-center justify-center rounded-l-lg outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40 ${
            grid ? "text-black" : "text-black/40"
          }`}
        >
          <IconGrid3x3 size={13} />
        </button>

        <button
          ref={gridMenuTriggerRef}
          type="button"
          data-testid="editor-grid-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={gridMenuOpen}
          aria-controls="editor-grid-menu"
          aria-label={t("editor.grid.options")}
          title={t("editor.grid.options")}
          onClick={() => setGridMenuOpen((open) => !open)}
          className="flex h-7 w-5 items-center justify-center rounded-r-lg border-l border-black/10 text-black hover:bg-black/10 focus-visible:ring-1 focus-visible:ring-black/30 outline-none"
        >
          <IconChevronDown size={13} />
        </button>
        {gridMenuOpen ? (
          <div
            ref={gridMenuRef}
            onKeyDown={(event) => {
              if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
              const items = Array.from(event.currentTarget.querySelectorAll('[role^="menuitem"]'));
              if (!items.length) return;
              event.preventDefault();
              const index = items.indexOf(event.target);
              const next = event.key === "Home" ? 0
                : event.key === "End" ? items.length - 1
                : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
              items[next].focus();
            }}
            id="editor-grid-menu"
            data-testid="editor-grid-menu"
            role="menu"
            aria-label={t("editor.grid.options")}
            className="absolute bottom-full left-0 mb-2 min-w-40 rounded-xl bg-[#e3e3e3] p-1.5 text-[11px] text-black shadow-pop"
          >
            <button
              type="button"
              role="menuitemcheckbox"
              data-testid="editor-grid-menu-snap"
              aria-checked={snapToGrid}
              onClick={onToggleSnapToGrid}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white focus-visible:bg-white outline-none"
            >
              <Magnet size={13} />
              {t("editor.snapping.toGrid")}
              <span aria-hidden="true" className="ml-auto">{snapToGrid ? "✓" : ""}</span>
            </button>
            <div className="my-1 border-t border-black/10" role="separator" />
            <div className="px-2 py-1 text-black/60">{t("editor.grid.size")}</div>
            {[8, 16, 32, 64].map((size) => (
              <button
                key={size}
                type="button"
                role="menuitemradio"
                aria-checked={gridSize === size}
                data-testid={`editor-grid-size-${size}`}
                onClick={() => {
                  onSetGridSize?.(size);
                  setGridMenuOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white focus-visible:bg-white outline-none"
              >
                {size} px
                <span aria-hidden="true">{gridSize === size ? "✓" : ""}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Rulers and guides live inside this one bar. */}
      {children ? (
        <>
          <div className="h-3.5 w-[1px] bg-black/15 mx-0.5" />
          {children}
        </>
      ) : null}

      <div className="h-3.5 w-[1px] bg-black/15 mx-0.5" />

      <button
        type="button"
        onClick={onZoomIn}
        title={t("editor.zoomIn")}
        aria-label={t("editor.zoomIn")}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        <IconAdd size={13} strokeWidth={ICON_STROKE_WIDTH} />
      </button>
      <button
        type="button"
        onClick={onFit}
        title={t("editor.zoomFit")}
        aria-label={t("editor.zoomFit")}
        className="flex h-7 min-w-[30px] px-1 items-center justify-center rounded-lg text-center text-[11px] tabular-nums leading-none text-black font-medium outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        title={t("editor.zoomOut")}
        aria-label={t("editor.zoomOut")}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-[#a7ffd4]/40"
      >
        <IconMinus size={13} strokeWidth={ICON_STROKE_WIDTH} />
      </button>
    </div>
  );
}

EditorZoom.propTypes = {
  onAddCanvas: PropTypes.func,
  zoom: PropTypes.number.isRequired,
  canUndo: PropTypes.bool,
  canRedo: PropTypes.bool,
  onUndo: PropTypes.func,
  onRedo: PropTypes.func,
  onZoomIn: PropTypes.func.isRequired,
  onZoomOut: PropTypes.func.isRequired,
  onFit: PropTypes.func.isRequired,
  grid: PropTypes.object,
  onToggleGrid: PropTypes.func,
  snapToGrid: PropTypes.bool,
  onToggleSnapToGrid: PropTypes.func,
  gridSize: PropTypes.number,
  onSetGridSize: PropTypes.func,
  children: PropTypes.node,
};
