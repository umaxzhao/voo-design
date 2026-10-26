import React from "react";
import { X } from "lucide-react";
import { SHORTCUTS_LIST } from "./welcome_constants.js";

/** Drag-and-drop overlay displayed when dragging files over the dashboard. */
export function WelcomeDropOverlay({ t, isDragOver }) {
  if (!isDragOver) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md m-4 rounded-3xl pointer-events-none transition-all">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-neutral-800 text-neutral-400 mb-3 animate-pulse">
        <svg className="size-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>
      <p className="text-[15px] font-medium text-white">{t("welcome.drop.title")}</p>
      <p className="text-xs text-neutral-400 mt-1">{t("welcome.drop.subtitle")}</p>
    </div>
  );
}

/** Shortcuts and .voo format overview tab content. */
export function WelcomeShortcutsTab({ t }) {
  return (
    <div className="flex-1 p-8 max-w-4xl w-full mx-auto space-y-6">
      <div className="rounded-3xl bg-neutral-900/30 p-6 space-y-4">
        <h2 className="text-xs font-semibold text-white flex items-center gap-2">
          <span>{t("welcome.shortcuts.title")}</span>
          <span className="text-xs font-normal text-neutral-500 font-mono">
            {t("welcome.shortcuts.habit")}
          </span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {SHORTCUTS_LIST.map((item) => (
            <div key={item.key} className="flex items-center justify-between p-2.5 rounded-xl bg-neutral-900/60 text-xs">
              <span className="text-neutral-400">{t(item.desc)}</span>
              <span className="font-mono text-neutral-200 bg-neutral-800 px-2 py-0.5 rounded-lg">
                {t(item.key)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl bg-neutral-900/20 p-6 space-y-2 text-xs text-neutral-400">
        <h3 className="font-semibold text-neutral-200">{t("welcome.folders.guide.title")}</h3>
        <p>{t("welcome.folders.guide.body")}</p>
      </div>

      <div className="rounded-3xl bg-neutral-900/20 p-6 space-y-2 text-xs text-neutral-400">
        <h3 className="font-semibold text-neutral-200">{t("welcome.voo.title")}</h3>
        <p>
          {t("welcome.voo.body.before")}{" "}
          <code className="text-mint font-mono">.voo</code>{" "}
          {t("welcome.voo.body.after")}
        </p>
      </div>
    </div>
  );
}

/** Modal dialog for renaming a project file. */
export function WelcomeRenameModal({
  t,
  renameItem,
  setRenameItem,
  renameInput,
  setRenameInput,
  handleConfirmRename,
}) {
  if (!renameItem) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl bg-neutral-900 border border-white/10 shadow-panel p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-white">{t("welcome.dialog.renameTitle")}</h3>
          <button
            type="button"
            onClick={() => setRenameItem(null)}
            className="rounded-xl p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
        <input
          type="text"
          value={renameInput}
          onChange={(e) => setRenameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirmRename();
            if (e.key === "Escape") setRenameItem(null);
          }}
          autoFocus
          className="w-full rounded-xl bg-neutral-950 px-3 py-2 text-xs text-white placeholder-neutral-400 focus:outline-none"
          placeholder={t("welcome.dialog.renamePlaceholder")}
        />
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setRenameItem(null)}
            className="rounded-xl px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white cursor-pointer"
          >
            {t("welcome.dialog.cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirmRename}
            className="rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200 cursor-pointer"
          >
            {t("welcome.dialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Confirmation modal dialog for emptying the trash. */
export function WelcomeEmptyTrashModal({
  t,
  confirmEmptyTrashOpen,
  setConfirmEmptyTrashOpen,
  handleEmptyTrash,
}) {
  if (!confirmEmptyTrashOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-3xl bg-neutral-900 border border-white/10 shadow-panel p-5 space-y-4">
        <h3 className="text-xs font-semibold text-white">{t("welcome.actions.emptyTrash")}</h3>
        <p className="text-xs text-neutral-400">{t("welcome.dialog.emptyTrashConfirm")}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setConfirmEmptyTrashOpen(false)}
            className="rounded-xl px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white cursor-pointer"
          >
            {t("welcome.dialog.cancel")}
          </button>
          <button
            type="button"
            onClick={handleEmptyTrash}
            className="rounded-xl bg-neutral-800 px-3.5 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-700 cursor-pointer"
          >
            {t("welcome.dialog.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
