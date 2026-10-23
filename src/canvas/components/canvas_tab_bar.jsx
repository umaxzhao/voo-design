import React from "react";
import { Plus, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { useDesignStore } from "../../store/design_store.js";

/** File names stay as the user saved them, so they are shown as they are. */
const FALLBACK_NAME = "Untitled";

/**
 * The open file as a tab in the title bar.
 * Supports switching to the active canvas, closing the project (X),
 * and adding a new project (+).
 */
export default function CanvasTabBar() {
  const { t } = useI18n();
  const fileName = useDesignStore((state) => state.fileName);
  const isDirty = useDesignStore((state) => state.isDirty);
  const welcomeOpen = useDesignStore((state) => state.welcomeOpen);
  const documents = useDesignStore(state => state.openDocuments);
  const activeId = useDesignStore(state => state.activeDocumentId);
  const switchDocument = useDesignStore(state => state.switchDocument);
  const closeDocument = useDesignStore(state => state.closeDocument);
  const newVooProject = useDesignStore(state => state.newVooProject);

  return (
    <div
      role="tablist"
      aria-label={t("canvasTabs.label")}
      className="flex min-w-0 items-center gap-1.5 overflow-x-auto"
      style={{ WebkitAppRegion: "no-drag" }}
    >
      {documents.map(document => {
        const active = document.id === activeId;
        const name = active ? fileName : document.fileName;
        const label = name?.replace(/\.voo$/i, "");
        const dirty = active ? isDirty : document.isDirty;
        return (
        <div
          key={document.id}
          className={`group flex h-7 max-w-[240px] shrink-0 items-center gap-1.5 rounded-full pl-3 pr-1.5 text-[12px] transition-colors ${
            active && !welcomeOpen
              ? "bg-neutral-800/75 text-white"
              : "bg-neutral-800/50 text-white/85 hover:bg-neutral-800/75 hover:text-white"
          }`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={active && !welcomeOpen}
            onClick={() => switchDocument(document.id)}
            className="min-w-0 flex-1 truncate text-left outline-none cursor-pointer font-medium"
            title={label || FALLBACK_NAME}
          >
            {label || FALLBACK_NAME}
          </button>
          {dirty && (
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
              title={t("canvasTabs.unsaved")}
            />
          )}
          <button
            type="button"
            onClick={() => closeDocument(document.id, () => window.confirm(t("editor.exit.confirmBody")))}
            className="flex size-4 shrink-0 items-center justify-center rounded-full text-white/50 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
            title={t("canvasTabs.close")}
            aria-label={t("canvasTabs.close")}
          >
            <X size={12} strokeWidth={2.2} />
          </button>
        </div>
      ); })}

      <button
        type="button"
        onClick={() => newVooProject()}
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-800/50 text-white outline-none hover:bg-neutral-800/75 transition-colors cursor-pointer"
        title={t("canvasTabs.new")}
        aria-label={t("canvasTabs.new")}
      >
        <Plus size={14} strokeWidth={2.2} />
      </button>
    </div>
  );
}
