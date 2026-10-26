import React, { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Clock3,
  File,
  FolderOpen,
  Image,
  Keyboard,
  LayoutGrid,
  List,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "../use_i18n.js";
import { useDesignStore } from "../../store/design_store.js";
import {
  WELCOME_FOLDERS_EVENT,
  WELCOME_MENU_ACTION_EVENT,
} from "./welcome_dashboard/welcome_events.js";

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
  const [welcomeFolders, setWelcomeFolders] = useState([]);
  const mobileMenuRef = useRef(null);
  const activeDocument = documents.find(
    (document) => document.id === activeId,
  );
  const activeLabel = activeDocument
    ? documentLabel(activeDocument, true, fileName)
    : t("canvasTabs.selectProject");
  const dispatchWelcomeAction = (action, value = undefined) => {
    window.dispatchEvent(
      new CustomEvent(WELCOME_MENU_ACTION_EVENT, {
        detail: { action, value },
      }),
    );
    setMobileMenuOpen(false);
  };

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

  useEffect(() => {
    const updateFolders = (event) => setWelcomeFolders(event.detail ?? []);
    window.addEventListener(WELCOME_FOLDERS_EVENT, updateFolders);
    return () => window.removeEventListener(WELCOME_FOLDERS_EVENT, updateFolders);
  }, []);

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
          {activeDocument && isDirty ? (
            <span
              role="img"
              aria-label={t("canvasTabs.unsaved")}
              className="size-1.5 shrink-0 rounded-full bg-amber-400"
            />
          ) : null}
          <ChevronDown
            size={13}
            className="shrink-0 text-white/60"
            aria-hidden="true"
          />
        </button>
        {mobileMenuOpen ? (
          <div
            id="mobile-project-switcher-options"
            aria-label={t("canvasTabs.label")}
            className={
              "absolute top-full z-[90] mt-1.5 max-h-[min(74dvh,34rem)] min-w-48 max-w-[min(22rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-white/10 bg-neutral-950 p-1.5 text-[11px] shadow-menu " +
              (welcomeOpen
                ? "welcome-mobile-project-menu left-1/2 w-[min(22rem,calc(100vw-1rem))] -translate-x-1/2"
                : "left-0")
            }
          >
            {welcomeOpen ? (
              <>
                <div className="welcome-mobile-menu-section flex flex-col gap-0.5">
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("search")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <Search size={14} aria-hidden="true" />
                    <span>{t("welcome.search.placeholder")}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("tab", "recents")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <Clock3 size={14} aria-hidden="true" />
                    <span>{t("welcome.nav.recents")}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("tab", "drafts")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <File size={14} aria-hidden="true" />
                    <span>{t("welcome.nav.drafts")}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("tab", "starred")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <Star size={14} aria-hidden="true" />
                    <span>{t("welcome.nav.starred")}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("tab", "trash")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <Trash2 size={14} aria-hidden="true" />
                    <span>{t("welcome.nav.trash")}</span>
                  </button>
                  {welcomeFolders.map((folder) => (
                    <button
                      key={folder.name}
                      type="button"
                      role="menuitem"
                      onClick={() => dispatchWelcomeAction("folder", folder.name)}
                      className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10"
                    >
                      <FolderOpen size={14} aria-hidden="true" />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("tab", "design-systems")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <LayoutGrid size={14} aria-hidden="true" />
                    <span>{t("welcome.nav.designSystems")}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("tab", "shortcuts")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <Keyboard size={14} aria-hidden="true" />
                    <span>{t("welcome.nav.shortcuts")}</span>
                  </button>
                </div>
                <div className="my-1.5 border-t border-white/10" role="separator" />
                <div className="welcome-mobile-menu-section flex flex-col gap-0.5">
                  {[
                    ["updatedAt", "welcome.sort.lastModified"],
                    ["oldest", "welcome.sort.oldestModified"],
                    ["nameAsc", "welcome.sort.nameAsc"],
                    ["nameDesc", "welcome.sort.nameDesc"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="menuitem"
                      onClick={() => dispatchWelcomeAction("sort", value)}
                      className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10"
                    >
                      <Clock3 size={14} aria-hidden="true" />
                      <span>{t(label)}</span>
                    </button>
                  ))}
                  <div className="flex gap-1 px-1 py-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => dispatchWelcomeAction("view", "grid")}
                      className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-neutral-300 hover:bg-white/10"
                    >
                      <LayoutGrid size={14} aria-hidden="true" />
                      <span>{t("welcome.view.grid")}</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => dispatchWelcomeAction("view", "list")}
                      className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg text-neutral-300 hover:bg-white/10"
                    >
                      <List size={14} aria-hidden="true" />
                      <span>{t("welcome.view.list")}</span>
                    </button>
                  </div>
                </div>
                <div className="my-1.5 border-t border-white/10" role="separator" />
                <div className="welcome-mobile-menu-section flex flex-col gap-0.5">
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("open-file")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <FolderOpen size={14} aria-hidden="true" />
                    <span>{t("welcome.actions.openLocal")}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("import-figma")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <File size={14} aria-hidden="true" />
                    <span>{t("welcome.actions.importFigma")}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("import-browser")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <FolderOpen size={14} aria-hidden="true" />
                    <span>{t("welcome.actions.importBrowser")}</span>
                  </button>
                  <button type="button" role="menuitem" onClick={() => dispatchWelcomeAction("recreate-screenshot")} className="flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-left text-neutral-300 hover:bg-white/10">
                    <Image size={14} aria-hidden="true" />
                    <span>{t("welcome.actions.recreateScreenshot")}</span>
                  </button>
                </div>
                <div className="my-1.5 border-t border-white/10" role="separator" />
              </>
            ) : null}
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
                    {dirty ? (
                      <span
                        role="img"
                        aria-label={t("canvasTabs.unsaved")}
                        className="size-1.5 shrink-0 rounded-full bg-amber-400"
                      />
                    ) : null}
                    {active && !welcomeOpen ? (
                      <span aria-hidden="true" className="text-[#a7ffd4]">
                        ✓
                      </span>
                    ) : null}
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
