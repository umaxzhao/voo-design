/**
 * ProjectMemoryDrawer — view and manage project memory.
 *
 * Provides a structured view of project memories:
 * - Confirmed decisions, preferences, constraints
 * - Confidence ratings, usage counters
 * - Deletion of individual memories or clearing all memories
 *
 * Compliant with VOO Design System:
 * - No emoji, flat hierarchy, 4px grid, strict border rules, full i18n.
 *
 * @module agent-panel/ProjectMemoryDrawer
 */

import PropTypes from "prop-types";
import { IconClose, IconTrash, IconBookmark } from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";
import { migrateProjectMemory } from "../../agent-runtime/project-memory.js";

export default function ProjectMemoryDrawer({
  open,
  onClose,
  memory,
  onRemoveItem,
  onClearAll,
}) {
  const { t } = useI18n();

  if (!open) return null;

  const normalized = migrateProjectMemory(memory);
  const items = normalized.items || [];

  const getKindBadgeClass = (kind) => {
    switch (kind) {
      case "constraint":
        return "bg-rose-500/10 text-rose-400";
      case "preference":
        return "bg-purple-500/10 text-[#eed0ff]";
      case "decision":
      default:
        return "bg-[#a7ffd4]/10 text-[#a7ffd4]";
    }
  };

  const getKindLabel = (kind) => {
    switch (kind) {
      case "constraint":
        return t("agent.memory.kindConstraint");
      case "preference":
        return t("agent.memory.kindPreference");
      case "decision":
      default:
        return t("agent.memory.kindDecision");
    }
  };

  return (
    <div
      data-testid="project-memory-drawer"
      className="pointer-events-auto flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/95 px-4 py-3 shadow-panel backdrop-blur-md"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <IconBookmark size={16} className="text-neutral-400" />
          <h2 className="text-[12px] font-semibold text-neutral-200">
            {t("agent.memory.title")}
          </h2>
          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-400">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-neutral-300 hover:bg-rose-500/15 hover:text-rose-300 transition-colors"
            >
              {t("agent.memory.clearAll")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("agent.memory.close")}
            title={t("agent.memory.close")}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {/* ── Memory Items List ── */}
      <div className="flex-1 overflow-y-auto ui-scroll flex flex-col gap-2 pt-3 pr-1">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500">
            <IconBookmark size={24} className="mb-2 text-neutral-500" />
            <p className="text-xs">{t("agent.memory.empty")}</p>
            <p className="text-[10px] text-neutral-500 mt-1 max-w-[200px]">
              {t("agent.memory.emptyHint")}
            </p>
          </div>
        ) : (
          items.map((item) => {
            const badgeClass = getKindBadgeClass(item.kind);
            const badgeLabel = getKindLabel(item.kind);
            return (
              <div
                key={item.id}
                data-testid={`memory-item-${item.id}`}
                className="group flex items-start justify-between rounded-xl bg-white/[0.04] p-3 text-xs text-neutral-200 hover:bg-white/[0.06] transition-colors"
              >
                <div className="flex flex-col gap-1.5 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}
                    >
                      {badgeLabel}
                    </span>
                    {typeof item.confidence === "number" && item.confidence < 1.0 && (
                      <span className="text-[10px] tabular-nums text-neutral-500">
                        {Math.round(item.confidence * 100)}%
                      </span>
                    )}
                    {typeof item.useCount === "number" && item.useCount > 0 && (
                      <span className="text-[10px] tabular-nums text-neutral-500">
                        {t("agent.memory.usedCount", { count: item.useCount })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-200 leading-relaxed break-words">
                    {item.text}
                  </p>
                  {item.source?.messageExcerpt && (
                    <p className="text-[10px] text-neutral-500 italic truncate max-w-sm">
                      {item.source.messageExcerpt}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  className="text-neutral-500 hover:text-rose-400 p-1 transition-colors"
                  aria-label={t("agent.memory.delete")}
                  title={t("agent.memory.delete")}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

ProjectMemoryDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  memory: PropTypes.object,
  onRemoveItem: PropTypes.func.isRequired,
  onClearAll: PropTypes.func.isRequired,
};
