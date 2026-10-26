import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { useDesignStore } from "../../store/design_store.js";

/** File names stay as the user saved them, so they are shown as they are. */
const FALLBACK_NAME = "Untitled";

function documentLabel(document, active, currentFileName) {
  const name = active ? currentFileName : document.fileName;
  return name?.replace(/\.voo$/i, "") || FALLBACK_NAME;
}

/** Shows open projects as tabs on desktop and a single project menu on mobile. */
export default function CanvasTabBar() {
  const { t } = useI18n();
  const fileName = useDesignStore((state) => state.fileName);
  const isDirty = useDesignStore((state) => state.isDirty);
  const welcomeOpen = useDesignStore((state) => state.welcomeOpen);
  const documents = useDesignStore((state) => state.openDocuments);
  const activeId = useDesignStore((state) => state.activeDocumentId);
  const switchDocument = useDesignStore((state) => state.switchDocument);
  const closeDocument = useDesignStore((state) => state.closeDocument);
  const newVooProject = useDesignStore((state) => state.newVooProject);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);
  const activeDocument = documents.find((document) => document.id === activeId);
  const activeLabel = activeDocument
    ? documentLabel(activeDocument, true, fileName)
    : t("canvasTabs.selectProject");

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const closeOutside = (event) => {
      if (!mobileMenuRef.current?.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileMenuOpen]);

  return (
    <>
      <div
        role="tablist"
        aria-label={t("canvasTabs.label")}
        className="canvas-tab-bar-desktop flex min-w-0 items-center gap-1.5 overflow-x-auto"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        {documents.map((document) => {
          const active = document.id === activeId;
          const label = documentLabel(document, active, fileName);
          const dirty = active ? isDirty : document.isDirty;
          return (
            <div
              key={document.id}
              className={`group flex h-7 max-w-[240px] shrink-0 items-center gap-1.5 rounded-full pr-1.5 text-[12px] transition-colors ${
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
                className="h-full min-w-0 flex-1 truncate pl-3 text-left outline-none cursor-pointer font-medium"
                title={label}
              >
                {label}
              </button>
              {dirty ? (
                <span
                  role="img"
                  aria-label={t("canvasTabs.unsaved")}
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400"
                  title={t("canvasTabs.unsaved")}
                />
              ) : null}
              <button
                type="button"
                onClick={() =>
                  closeDocument(document.id, () =>
                    window.confirm(t("editor.exit.confirmBody")),
                  )
                }
                className="group/close -m-1.5 flex size-7 shrink-0 items-center justify-center text-white/50 hover:text-white transition-colors cursor-pointer"
                style={{ WebkitAppRegion: "no-drag" }}
                title={t("canvasTabs.close")}
                aria-label={t("canvasTabs.close")}
              >
                <span className="flex size-4 items-center justify-center rounded-full transition-colors group-hover/close:bg-white/20">
                  <X size={12} strokeWidth={2.2} />
                </span>
              </button>
            </div>
          );
        })}
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

      <div
        ref={mobileMenuRef}
        className="canvas-tab-bar-mobile relative min-w-0 flex-1"
        style={{ WebkitAppRegion: "no-drag" }}
      >
        <button
          type="button"
          data-testid="mobile-project-switcher"
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-project-switcher-options"
          aria-label={t("canvasTabs.label")}
          onClick={() => setMobileMenuOpen((open) => !open)}
          className={`flex h-8 max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-colors ${
            activeDocument && !welcomeOpen
              ? "bg-neutral-800/75 text-white"
              : "bg-neutral-800/50 text-white/85"
          }`}
          title={activeLabel}
        >
          <span className="min-w-0 flex-1 truncate text-left">{activeLabel}</span>
          {activeDocument && (activeId === activeDocument.id ? isDirty : activeDocument.isDirty) ? (
            <span
              aria-label={t("canvasTabs.unsaved")}
              className="size-1.5 shrink-0 rounded-full bg-amber-400"
            />
          ) : null}
          <ChevronDown size={13} className="shrink-0 text-white/60" aria-hidden="true" />
        </button>
        {mobileMenuOpen ? (
          <div
            id="mobile-project-switcher-options"
            aria-label={t("canvasTabs.label")}
            className="absolute left-0 top-full z-[90] mt-1.5 max-h-[min(60vh,24rem)] min-w-48 max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-white/10 bg-neutral-950 p-1.5 text-[11px] shadow-menu"
          >
            {documents.map((document) => {
              const active = document.id === activeId;
              const label = documentLabel(document, active, fileName);
              const dirty = active ? isDirty : document.isDirty;
              return (
                <div
                  key={document.id}
                  role="group"
                  aria-label={label}
                  className="flex items-center gap-1 rounded-lg hover:bg-white/10"
                >
                  <button
                    type="button"
                    aria-current={active && !welcomeOpen ? "page" : undefined}
                    onClick={() => {
                      switchDocument(document.id);
                      setMobileMenuOpen(false);
                    }}
                    className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-200 focus-visible:outline focus-visible:outline-[#a7ffd4]"
                  >
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {dirty ? <span className="size-1.5 shrink-0 rounded-full bg-amber-400" aria-label={t("canvasTabs.unsaved")} /> : null}
                    {active && !welcomeOpen ? <span aria-hidden="true" className="text-[#a7ffd4]">✓</span> : null}
                  </button>
                  <button
                    type="button"
                    aria-label={`${t("canvasTabs.close")}: ${label}`}
                    title={t("canvasTabs.close")}
                    onClick={() => {
                      closeDocument(document.id, () =>
                        window.confirm(t("editor.exit.confirmBody")),
                      );
                      setMobileMenuOpen(false);
                    }}
                    className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-[#a7ffd4]"
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
            <div className="my-1 border-t border-white/10" role="separator" />
            <button
              type="button"
              onClick={() => {
                newVooProject();
                setMobileMenuOpen(false);
              }}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-neutral-200 hover:bg-white/10 focus-visible:outline focus-visible:outline-[#a7ffd4]"
            >
              <Plus size={14} aria-hidden="true" />
              {t("canvasTabs.new")}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
