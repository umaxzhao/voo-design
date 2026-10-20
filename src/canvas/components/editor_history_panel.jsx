import PropTypes from "prop-types";
import {
  IconUndo,
  IconRedo,
  IconHistory,
  IconSwap,
  IconCheck,
} from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import { isMacPlatform } from "../use_window_controls.js";

/**
 * Floating Photoshop-style history panel showing full operation history list.
 */
export default function EditorHistoryPanel({
  canUndo,
  canRedo,
  entries = [],
  onJumpTo,
  onUndo,
  onRedo,
  swapSide = false,
  onToggleSide = null,
}) {
  const { t } = useI18n();
  const isMac = isMacPlatform();
  const sideClass = swapSide ? "left-4" : "right-4";

  return (
    <aside
      className={`absolute ${sideClass} top-1/2 z-30 flex max-h-[75%] w-64 -translate-y-1/2 flex-col rounded-3xl bg-black/95 p-3 shadow-panel backdrop-blur-md font-mono text-neutral-200`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 pb-2.5 pt-1 border-b border-white/10 mb-2 select-none">
        <div className="flex items-center gap-1.5 text-neutral-400">
          <IconHistory size={13} />
          <h2 className="text-[11px] font-mono tracking-wider font-medium uppercase">
            {t("editor.history")}
          </h2>
        </div>
        {onToggleSide ? (
          <button
            type="button"
            onClick={onToggleSide}
            aria-label={t("editor.pages.toggleAxis")}
            title={t("editor.pages.toggleAxis")}
            className="rounded-full p-1 text-neutral-400 transition-colors hover:bg-[#262626] hover:text-white"
          >
            <IconSwap size={13} />
          </button>
        ) : null}
      </div>

      {/* Undo / Redo Quick Actions */}
      <div className="grid grid-cols-2 gap-1.5 pb-2 border-b border-white/10 mb-2">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="flex items-center justify-between rounded-xl bg-[#222222] px-2.5 py-1.5 text-[11px] font-mono text-neutral-200 transition-all hover:bg-[#2a2a2a] disabled:opacity-35 disabled:hover:bg-[#222222]"
        >
          <span className="flex items-center gap-1.5">
            <IconUndo size={13} />
            <span>{t("editor.undo")}</span>
          </span>
          <kbd className="text-[9px] text-neutral-500 font-mono">{isMac ? "⌘Z" : "Ctrl+Z"}</kbd>
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="flex items-center justify-between rounded-xl bg-[#222222] px-2.5 py-1.5 text-[11px] font-mono text-neutral-200 transition-all hover:bg-[#2a2a2a] disabled:opacity-35 disabled:hover:bg-[#222222]"
        >
          <span className="flex items-center gap-1.5">
            <IconRedo size={13} />
            <span>{t("editor.redo")}</span>
          </span>
          <kbd className="text-[9px] text-neutral-500 font-mono">{isMac ? "⇧⌘Z" : "Ctrl+Shift+Z"}</kbd>
        </button>
      </div>

      {/* Full History Steps List (Newest at the top) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden ui-scroll flex flex-col gap-1 pr-0.5 max-h-[380px]">
        {entries.length === 0 ? (
          <div className="py-6 text-center text-[11px] text-neutral-500">
            {t("editor.noHistory")}
          </div>
        ) : (
          [...entries]
            .map((entry, index) => ({ ...entry, originalIndex: index }))
            .reverse()
            .map((entry) => {
              const isActive = entry.active;
              const isFuture = entry.future;
              const stepNum = entry.originalIndex;

              return (
                <button
                  key={entry.id || stepNum}
                  type="button"
                  onClick={() => onJumpTo?.(stepNum)}
                  className={`group flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-left text-[11px] transition-colors ${
                    isActive
                      ? "bg-white/15 text-white font-medium ring-1 ring-white/10"
                      : isFuture
                        ? "text-neutral-500 hover:bg-white/5 hover:text-neutral-400"
                        : "text-neutral-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className={`text-[10px] w-4 shrink-0 font-mono ${isActive ? "text-white" : "text-neutral-500"}`}
                    >
                      {stepNum === 0 ? "★" : String(stepNum)}
                    </span>
                    <span className="truncate">{t(entry.name)}</span>
                  </div>

                  {isActive ? (
                    <span className="shrink-0 text-[#b2ffd6] ml-2">
                      <IconCheck size={12} />
                    </span>
                  ) : null}
                </button>
              );
            })
        )}
      </div>
    </aside>
  );
}

EditorHistoryPanel.propTypes = {
  canUndo: PropTypes.bool.isRequired,
  canRedo: PropTypes.bool.isRequired,
  entries: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      name: PropTypes.string,
      timestamp: PropTypes.number,
      active: PropTypes.bool,
      future: PropTypes.bool,
    }),
  ),
  currentIndex: PropTypes.number,
  onJumpTo: PropTypes.func,
  onUndo: PropTypes.func.isRequired,
  onRedo: PropTypes.func.isRequired,
  swapSide: PropTypes.bool,
  onToggleSide: PropTypes.func,
};
