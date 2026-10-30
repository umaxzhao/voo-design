import PropTypes from "prop-types";
import { useState, useEffect, useCallback } from "react";
import {
  IconUndo,
  IconRedo,
  IconHistory,
  IconSwap,
  IconCheck,
  IconChevronDown,
} from "../icons.jsx";
import { useI18n } from "../use_i18n.js";
import { isMacPlatform } from "../use_window_controls.js";
import {
  listVersions,
  createVersionRecord,
  deleteVersion,
} from "../store/version_store.js";

function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return timeStr;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${timeStr}`;
}

/**
 * Floating history panel showing both Photoshop-style operation history
 * and persistent version history (named snapshots).
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
  mobileExpanded = false,
  onMobileToggleExpanded = null,
  documentId = "current-doc",
  onCaptureSnapshot = null,
  onRestoreSnapshot = null,
}) {
  const { t } = useI18n();
  const isMac = isMacPlatform();
  const sideClass = swapSide ? "left-4" : "right-4";

  const [activeTab, setActiveTab] = useState("actions"); // "actions" | "versions"
  const [versions, setVersions] = useState([]);
  const [namingOpen, setNamingOpen] = useState(false);
  const [versionName, setVersionName] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshVersions = useCallback(async () => {
    if (!documentId) return;
    const list = await listVersions(documentId);
    setVersions(list);
  }, [documentId]);

  useEffect(() => {
    if (activeTab === "versions") {
      void refreshVersions();
    }
  }, [activeTab, refreshVersions]);

  const handleSaveVersion = async () => {
    if (!onCaptureSnapshot) return;
    setSaving(true);
    try {
      const snapshot = await onCaptureSnapshot();
      if (snapshot) {
        await createVersionRecord({
          documentId,
          name: versionName.trim() || undefined,
          vooFile: snapshot.vooFile,
          preview: snapshot.preview,
          layerCount: snapshot.layerCount,
          autoSave: false,
        });
        setVersionName("");
        setNamingOpen(false);
        await refreshVersions();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (version) => {
    if (!onRestoreSnapshot || !version?.vooFile) return;
    await onRestoreSnapshot(version.vooFile);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    await deleteVersion(id);
    await refreshVersions();
  };

  return (
    <aside
      data-testid="editor-history-panel"
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
        {onMobileToggleExpanded ? (
          <button
            type="button"
            onClick={onMobileToggleExpanded}
            aria-expanded={mobileExpanded}
            aria-label={t(mobileExpanded ? "editor.mobile.panels.collapseProperties" : "editor.mobile.panels.expandProperties")}
            title={t(mobileExpanded ? "editor.mobile.panels.collapseProperties" : "editor.mobile.panels.expandProperties")}
            className="editor-mobile-panel-toggle hidden h-10 w-10 items-center justify-center rounded-full text-neutral-300 hover:bg-white/10"
          >
            <IconChevronDown size={16} className={mobileExpanded ? "" : "rotate-180"} />
          </button>
        ) : null}
        {onToggleSide ? (
          <button
            type="button"
            onClick={onToggleSide}
            aria-label={t("editor.pages.toggleAxis")}
            title={t("editor.pages.toggleAxis")}
            className="editor-panel-side-swap flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-[#262626] hover:text-white"
          >
            <IconSwap size={13} />
          </button>
        ) : null}
      </div>

      {/* Mode Tabs */}
      <div className="flex rounded-xl bg-white/[0.04] p-0.5 mb-2 select-none text-[10px]">
        <button
          type="button"
          onClick={() => setActiveTab("actions")}
          className={`flex-1 py-1 rounded-lg text-center transition-colors cursor-pointer ${
            activeTab === "actions"
              ? "bg-white/15 text-white font-medium"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("editor.history.tabActions")}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("versions")}
          className={`flex-1 py-1 rounded-lg text-center transition-colors cursor-pointer ${
            activeTab === "versions"
              ? "bg-white/15 text-white font-medium"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {t("editor.history.tabVersions")}
        </button>
      </div>

      {activeTab === "actions" ? (
        <>
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
                        <span className="shrink-0 text-neutral-200 ml-2">
                          <IconCheck size={12} />
                        </span>
                      ) : null}
                    </button>
                  );
                })
            )}
          </div>
        </>
      ) : (
        /* Version History View */
        <div className="flex-1 flex flex-col gap-2 overflow-hidden">
          {/* Create named snapshot row */}
          {namingOpen ? (
            <div className="flex flex-col gap-1.5 p-2 rounded-xl bg-white/[0.04] border border-white/10">
              <input
                type="text"
                autoFocus
                placeholder={t("editor.history.nameVersion")}
                value={versionName}
                onChange={(e) => setVersionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSaveVersion();
                  if (e.key === "Escape") setNamingOpen(false);
                }}
                className="w-full rounded-lg bg-black/60 px-2.5 py-1 text-[11px] text-white border border-white/10 focus:outline-none focus:border-white/30"
              />
              <div className="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setNamingOpen(false)}
                  className="px-2 py-0.5 rounded-lg text-[10px] text-neutral-400 hover:text-neutral-200"
                >
                  ✕
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveVersion}
                  className="px-2.5 py-1 rounded-lg bg-white/20 text-[10px] font-medium text-white hover:bg-white/30 disabled:opacity-50"
                >
                  {saving ? "…" : t("editor.history.saveVersion")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNamingOpen(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 py-1.5 text-[11px] text-neutral-300 hover:border-white/40 hover:text-white transition-colors cursor-pointer"
            >
              <span>+</span>
              <span>{t("editor.history.nameVersion")}</span>
            </button>
          )}

          {/* List of saved versions */}
          <div className="flex-1 overflow-y-auto ui-scroll flex flex-col gap-1 pr-0.5 max-h-[320px]">
            {versions.length === 0 ? (
              <div className="py-6 text-center text-[11px] text-neutral-500">
                {t("editor.history.noVersions")}
              </div>
            ) : (
              versions.map((ver) => (
                <div
                  key={ver.id}
                  className="group flex flex-col gap-1 rounded-xl p-2 bg-white/[0.02] hover:bg-white/[0.06] border border-transparent hover:border-white/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-neutral-200 truncate">
                      {ver.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(ver.id, e)}
                      title={t("editor.history.deleteVersion")}
                      className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-rose-400 p-0.5 transition-opacity"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-neutral-400">
                    <span>{formatTime(ver.createdAt)}</span>
                    <button
                      type="button"
                      onClick={() => handleRestore(ver)}
                      className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-200 hover:text-white transition-colors cursor-pointer"
                    >
                      {t("editor.history.restoreVersion")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
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
  onUndo: PropTypes.func,
  onRedo: PropTypes.func,
  swapSide: PropTypes.bool,
  onToggleSide: PropTypes.func,
  mobileExpanded: PropTypes.bool,
  onMobileToggleExpanded: PropTypes.func,
  documentId: PropTypes.string,
  onCaptureSnapshot: PropTypes.func,
  onRestoreSnapshot: PropTypes.func,
};
