import PropTypes from "prop-types";
import {
  IconAdd,
  IconClose,
  IconGrid3x3,
  IconHistory,
  IconRedo,
  IconSwap,
  IconUndo,
} from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import EditorTooltip from "./editor_tooltip.jsx";

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
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
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
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
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
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
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
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${
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
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100"
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
              className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100"
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
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-neutral-800 hover:text-neutral-100"
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
