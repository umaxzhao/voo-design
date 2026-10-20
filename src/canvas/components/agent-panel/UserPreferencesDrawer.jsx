/**
 * UserPreferencesDrawer — view and manage cross-project user preferences.
 *
 * Compliant with VOO Design System:
 * - No emoji, flat hierarchy, 4px grid, strict border rules, full i18n.
 *
 * @module agent-panel/UserPreferencesDrawer
 */

import { useState } from "react";
import PropTypes from "prop-types";
import { IconSliders, IconClose, IconTrash, IconAdd } from "../../icons.jsx";
import { useI18n } from "../../use_i18n.js";
import { PREFERENCE_KINDS } from "../../agent-runtime/global-memory.js";

export default function UserPreferencesDrawer({
  open,
  onClose,
  preferences = [],
  onAddPreference,
  onDeletePreference,
  onClearAll,
}) {
  const { t } = useI18n();
  const [newText, setNewText] = useState("");
  const [newKind, setNewKind] = useState("style");

  if (!open) return null;

  const handleAdd = (e) => {
    e?.preventDefault();
    const text = newText.trim();
    if (!text) return;

    if (typeof onAddPreference === "function") {
      onAddPreference({ text, kind: newKind });
    }
    setNewText("");
  };

  const getKindBadgeClass = (kind) => {
    switch (kind) {
      case "tone":
        return "bg-rose-500/10 text-rose-400";
      case "workflow":
        return "bg-purple-500/10 text-[#eed0ff]";
      case "style":
      default:
        return "bg-[#a7ffd4]/10 text-[#a7ffd4]";
    }
  };

  const getKindLabel = (kind) => {
    switch (kind) {
      case "tone":
        return t("agent.preferences.kindTone");
      case "workflow":
        return t("agent.preferences.kindWorkflow");
      case "style":
      default:
        return t("agent.preferences.kindStyle");
    }
  };

  return (
    <div
      data-testid="user-preferences-drawer"
      className="pointer-events-auto flex w-[min(340px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border border-white/10 bg-neutral-950/95 px-4 py-3 shadow-panel backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <IconSliders size={16} className="text-neutral-400" />
          <h2 className="text-[12px] font-semibold text-neutral-200">
            {t("agent.preferences.title")}
          </h2>
          <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] tabular-nums text-neutral-400">
            {preferences.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {preferences.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="rounded-lg bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-neutral-300 hover:bg-rose-500/15 hover:text-rose-300 transition-colors"
            >
              {t("agent.preferences.clearAll")}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("agent.preferences.close")}
            title={t("agent.preferences.close")}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/[0.08] hover:text-white transition-colors"
          >
            <IconClose size={14} />
          </button>
        </div>
      </div>

      {/* Add preference input */}
      <form onSubmit={handleAdd} className="flex items-center gap-2 pt-3">
        <select
          value={newKind}
          onChange={(e) => setNewKind(e.target.value)}
          className="rounded-lg bg-white/[0.06] px-2 py-1.5 text-xs text-neutral-300 hover:bg-white/[0.08] focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
        >
          {PREFERENCE_KINDS.map((k) => (
            <option key={k} value={k} className="bg-neutral-900 text-neutral-200">
              {getKindLabel(k)}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder={t("agent.preferences.inputPlaceholder")}
          className="flex-1 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs text-neutral-200 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-[#a7ffd4]/40"
        />
        <button
          type="submit"
          disabled={!newText.trim()}
          className="flex items-center gap-1 rounded-lg bg-[#a7ffd4] px-2.5 py-1.5 text-xs font-medium text-black disabled:opacity-40 disabled:hover:bg-[#a7ffd4] hover:bg-[#a7ffd4]/90 transition-colors"
        >
          <IconAdd size={12} />
          <span>{t("agent.brief.add")}</span>
        </button>
      </form>

      {/* List */}
      <div className="flex-1 overflow-y-auto ui-scroll flex flex-col gap-2 pt-3 pr-1">
        {preferences.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-neutral-500">
            <IconSliders size={24} className="mb-2 text-neutral-500" />
            <p className="text-xs font-medium text-neutral-400">
              {t("agent.preferences.empty")}
            </p>
            <p className="text-[11px] mt-1 max-w-xs text-neutral-500">
              {t("agent.preferences.emptyHint")}
            </p>
          </div>
        ) : (
          preferences.map((p) => (
            <div
              key={p.id}
              className="flex items-start justify-between gap-3 rounded-xl bg-white/[0.04] p-3 hover:bg-white/[0.07] transition-colors"
            >
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getKindBadgeClass(
                      p.kind,
                    )}`}
                  >
                    {getKindLabel(p.kind)}
                  </span>
                  {p.source?.projectName && (
                    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[9px] text-neutral-400 truncate max-w-[120px]">
                      {p.source.projectName}
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-200 leading-relaxed break-words">
                  {p.text}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDeletePreference?.(p.id)}
                aria-label={t("agent.preferences.delete")}
                title={t("agent.preferences.delete")}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <IconTrash size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

UserPreferencesDrawer.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  preferences: PropTypes.arrayOf(PropTypes.object),
  onAddPreference: PropTypes.func,
  onDeletePreference: PropTypes.func,
  onClearAll: PropTypes.func,
};
