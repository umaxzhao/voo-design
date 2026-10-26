import { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import { Eye, EyeOff, Ruler, Trash2 } from "lucide-react";
import {
  IconAdd,
  IconGrid3x3,
  IconMagnet,
  IconMinus,
  IconMore,
  IconRedo,
  IconUndo,
  ICON_STROKE_WIDTH,
} from "../icons.jsx";
import { useI18n } from "../use_i18n.js";

/**
 * The floating bottom-center zoom cluster: zoom out, live zoom percentage
 * (click to reset to 100%), zoom in. Matches the outer canvas viewport-tools design.
 */
export function EditorZoom({
  zoom,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomReset = null,
  onFit,
  grid,
  onToggleGrid,
  snapToGrid = false,
  onToggleSnapToGrid,
  gridSize = 32,
  onSetGridSize,
  showRulers = false,
  rulersAvailable = false,
  onToggleRulers = null,
  showGuides = false,
  onToggleGuides = null,
  canClearGuides = false,
  onClearGuides = null,
  onAddCanvas = null,
  children = null,
}) {
  const { t } = useI18n();
  const zoomPercent = Math.round(zoom * 100);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreControlRef = useRef(null);
  const moreTriggerRef = useRef(null);
  const gridMenuRef = useRef(null);

  useEffect(() => {
    if (!moreOpen) return;
    const target = gridMenuRef.current || moreControlRef.current;
    target?.querySelector('[role^="menuitem"]')?.focus();
    const onOutside = (event) => {
      if (!moreControlRef.current?.contains(event.target)) setMoreOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
        moreTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

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
          className="mobile-hidden-control flex h-12 w-12 md:h-7 md:w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-black/30"
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
        className="mobile-hidden-control flex h-7 w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-black/30 disabled:opacity-30 disabled:hover:opacity-30"
      >
        <IconUndo size={13} />
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        title={t("editor.redo")}
        aria-label={t("editor.redo")}
        className="mobile-hidden-control flex h-7 w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-black/30 disabled:opacity-30 disabled:hover:opacity-30"
      >
        <IconRedo size={13} />
      </button>

      <div className="mobile-hidden-control h-3.5 w-[1px] bg-black/15 mx-0.5" />

      <button
        type="button"
        onClick={onZoomOut}
        title={t("editor.zoomOut")}
        aria-label={t("editor.zoomOut")}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-black/30"
      >
        <IconMinus size={13} strokeWidth={ICON_STROKE_WIDTH} />
      </button>
      {/* Live zoom ratio; clicking it resets the view to 100%. min-w keeps the bar from shifting as digits change. */}
      <button
        type="button"
        data-testid="editor-zoom-percent"
        onClick={() => onZoomReset?.()}
        title={t("editor.shortcut.zoom100")}
        aria-live="polite"
        className="flex h-7 min-w-[2.75rem] items-center justify-center rounded-lg px-1 text-center text-[10px] tabular-nums text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-black/30"
      >
        {`${zoomPercent}%`}
      </button>
      <button
        type="button"
        onClick={onZoomIn}
        title={t("editor.zoomIn")}
        aria-label={t("editor.zoomIn")}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-black/30"
      >
        <IconAdd size={13} strokeWidth={ICON_STROKE_WIDTH} />
      </button>

      {/* Rulers and guides live inside this one bar. */}
      {children ? (
        <div className="editor-zoom-extra-controls contents">
          <div className="h-3.5 w-[1px] bg-black/15 mx-0.5" />
          {children}
        </div>
      ) : null}

      <div className="h-3.5 w-[1px] bg-black/15 mx-0.5" />

      <div ref={moreControlRef} className="relative flex items-center">
        <button
          ref={moreTriggerRef}
          type="button"
          data-testid="editor-more-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          aria-controls="editor-more-menu"
          aria-label={t("editor.taskbar.more")}
          title={t("editor.taskbar.more")}
          onContextMenu={(event) => {
            event.preventDefault();
            setMoreOpen(true);
          }}
          onClick={() => setMoreOpen((open) => !open)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-black outline-none transition-opacity hover:opacity-60 focus-visible:ring-1 focus-visible:ring-black/30"
        >
          <IconMore size={13} />
        </button>
        {moreOpen ? (
          <div
            id="editor-more-menu"
            data-testid="editor-more-menu"
            role="menu"
            aria-label={t("editor.taskbar.more")}
            className="absolute bottom-full right-0 mb-2 max-h-[60vh] min-w-44 overflow-y-auto rounded-xl border border-white/10 bg-neutral-900 p-1.5 text-[11px] text-white shadow-pop"
          >
            <button
              type="button"
              role="menuitem"
              disabled={!canUndo}
              onClick={() => {
                onUndo?.();
                setMoreOpen(false);
              }}
              className="mobile-more-command hidden w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 focus-visible:bg-neutral-800 outline-none disabled:opacity-30"
            >
              <IconUndo size={13} aria-hidden="true" />
              {t("editor.undo")}
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!canRedo}
              onClick={() => {
                onRedo?.();
                setMoreOpen(false);
              }}
              className="mobile-more-command hidden w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 focus-visible:bg-neutral-800 outline-none disabled:opacity-30"
            >
              <IconRedo size={13} aria-hidden="true" />
              {t("editor.redo")}
            </button>
            {onAddCanvas ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onAddCanvas();
                  setMoreOpen(false);
                }}
                className="mobile-more-command hidden w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 focus-visible:bg-neutral-800 outline-none"
              >
                <IconAdd size={13} aria-hidden="true" />
                {t("editor.addCanvas")}
              </button>
            ) : null}
            <div className="mobile-more-command hidden my-1 border-t border-white/10" role="separator" />
            {rulersAvailable ? (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={Boolean(showGuides)}
                onClick={() => onToggleGuides?.()}
                className="mobile-more-command hidden w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 focus-visible:bg-neutral-800 outline-none"
              >
                {showGuides ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                {t("editor.guides.toggle")}
                <span aria-hidden="true" className="ml-auto text-neutral-400">{showGuides ? "✓" : ""}</span>
              </button>
            ) : null}
            <div className="px-2 py-1 text-neutral-400">{t("editor.menu.groupZoom")}</div>
            <button
              type="button"
              role="menuitem"
              data-testid="editor-fit-btn"
              onClick={() => {
                onFit?.();
                setMoreOpen(false);
              }}
              title={t("editor.zoomFit")}
              aria-label={t("editor.zoomFit")}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 hover:text-white focus-visible:bg-neutral-800 outline-none"
            >
              <span className="whitespace-nowrap">{t("editor.zoomFit.label")}</span>
              <span className="ml-4 flex items-center gap-2 whitespace-nowrap text-neutral-400">
                <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
                <span data-testid="editor-fit-shortcut">{t("editor.zoomFit.shortcut")}</span>
              </span>
            </button>
            {rulersAvailable ? (
              <button
                type="button"
                role="menuitemcheckbox"
                data-testid="editor-toggle-rulers"
                onClick={onToggleRulers}
                title={t("editor.rulers.toggle")}
                aria-label={t("editor.rulers.toggle")}
                aria-checked={Boolean(showRulers)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 hover:text-white focus-visible:bg-neutral-800 outline-none"
              >
                <span className="flex items-center gap-2">
                  <Ruler size={13} className={showRulers ? "text-white" : "text-neutral-500"} />
                  {t("editor.rulers.toggle")}
                </span>
                <span aria-hidden="true" className="text-neutral-400">{showRulers ? "✓" : ""}</span>
              </button>
            ) : null}
            {rulersAvailable ? (
              <button
                type="button"
                role="menuitem"
                data-testid="editor-clear-guides"
                onClick={() => {
                  onClearGuides?.();
                  setMoreOpen(false);
                }}
                disabled={!canClearGuides}
                title={t("editor.guides.clearAll")}
                aria-label={t("editor.guides.clearAll")}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 hover:text-white focus-visible:bg-neutral-800 outline-none disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-neutral-200"
              >
                <span className="flex items-center gap-2">
                  <Trash2 size={13} className="text-neutral-500" />
                  {t("editor.guides.clearAll")}
                </span>
              </button>
            ) : null}

            <div className="mt-1 border-t border-white/10 px-2 pb-1 pt-2 text-neutral-400">{t("editor.menu.groupGrid")}</div>
            <button
              type="button"
              role="menuitemcheckbox"
              onClick={onToggleGrid}
              onContextMenu={(event) => {
                event.preventDefault();
                setMoreOpen(true);
              }}
              title={t("editor.view.grid")}
              aria-label={t("editor.view.grid")}
              aria-pressed={Boolean(grid && grid.enabled !== false)}
              aria-checked={Boolean(grid && grid.enabled !== false)}
              className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 hover:text-white focus-visible:bg-neutral-800 outline-none"
            >
              <span className="flex items-center gap-2">
                <IconGrid3x3 size={13} className={grid && grid.enabled !== false ? "text-white" : "text-neutral-500"} />
                {t("editor.view.grid")}
              </span>
              <span aria-hidden="true" className="text-neutral-400">{grid && grid.enabled !== false ? "✓" : ""}</span>
            </button>

            <div
              ref={gridMenuRef}
              id="editor-grid-menu"
              data-testid="editor-grid-menu"
              role="menu"
              aria-label={t("editor.grid.options")}
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
              className="mt-1 border-t border-white/10 pt-1"
            >
              <button
                type="button"
                role="menuitemcheckbox"
                data-testid="editor-grid-menu-snap"
                aria-checked={snapToGrid}
                onClick={onToggleSnapToGrid}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 hover:text-white focus-visible:bg-neutral-800 outline-none"
              >
                <IconMagnet size={13} />
                {t("editor.snapping.toGrid")}
                <span aria-hidden="true" className="ml-auto text-neutral-400">{snapToGrid ? "✓" : ""}</span>
              </button>

              <div className="my-1 border-t border-white/10" role="separator" />
              <div className="px-2 py-1 text-neutral-400">{t("editor.grid.size")}</div>
              {[8, 16, 32, 64].map((size) => (
                <button
                  key={size}
                  type="button"
                  role="menuitemradio"
                  aria-checked={gridSize === size}
                  data-testid={`editor-grid-size-${size}`}
                  onClick={() => {
                    onSetGridSize?.(size);
                    setMoreOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-neutral-200 hover:bg-neutral-800 hover:text-white focus-visible:bg-neutral-800 outline-none"
                >
                  {t("editor.grid.sizeLabel", { size })}
                  <span aria-hidden="true" className="text-neutral-400">{gridSize === size ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
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
  onZoomReset: PropTypes.func,
  onFit: PropTypes.func.isRequired,
  grid: PropTypes.object,
  onToggleGrid: PropTypes.func,
  snapToGrid: PropTypes.bool,
  onToggleSnapToGrid: PropTypes.func,
  gridSize: PropTypes.number,
  onSetGridSize: PropTypes.func,
  showRulers: PropTypes.bool,
  rulersAvailable: PropTypes.bool,
  onToggleRulers: PropTypes.func,
  showGuides: PropTypes.bool,
  onToggleGuides: PropTypes.func,
  canClearGuides: PropTypes.bool,
  onClearGuides: PropTypes.func,
  children: PropTypes.node,
};
