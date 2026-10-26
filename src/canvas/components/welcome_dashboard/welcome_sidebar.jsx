import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./welcome_mobile_layout.css";
import {
  File,
  Star,
  Trash2,
  Search,
  X,
  Plus,
  FolderOpen,
  MoreHorizontal,
} from "lucide-react";

/** Left workspace navigation sidebar for the welcome dashboard. */
export function WelcomeSidebar({
  t,
  searchQuery,
  setSearchQuery,
  activeTab,
  setActiveTab,
  activeFolder,
  setActiveFolder,
  folders,
  creatingFolder,
  setCreatingFolder,
  folderName,
  setFolderName,
  folderError,
  setFolderError,
  handleCreateFolder,
  handleDeleteFolder,
}) {
  const [folderMenu, setFolderMenu] = useState(null);

  useEffect(() => {
    if (!folderMenu) return undefined;
    const closeOnPointerDown = () => setFolderMenu(null);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setFolderMenu(null);
    };
    window.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [folderMenu]);

  const openFolderMenu = (event, folder) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 160;
    const menuHeight = 44;
    setFolderMenu({
      folder,
      left: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
      top: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
    });
  };

  return (
    <aside data-testid="welcome-sidebar" className="welcome-sidebar flex w-full shrink-0 flex-col bg-black pt-3 pb-3 px-2 rounded-tl-3xl justify-between lg:w-60 max-h-[34dvh] overflow-y-auto lg:max-h-none lg:overflow-visible">
      <div className="welcome-sidebar-content space-y-4">

        {/* Search lives in the sidebar, top-left, not in each page header */}
        <div className="welcome-sidebar-search relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("welcome.search.placeholder")}
            data-search-field
            className="w-full h-8 pl-8 pr-7 text-xs rounded-xl bg-neutral-900/80 text-neutral-200 placeholder-neutral-400 focus:outline-none focus:bg-neutral-800 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Core Navigation List */}
        <div className="welcome-sidebar-primary-nav space-y-0.5">
          <button
            type="button"
            onClick={() => {
              setActiveFolder(null);
              setActiveTab("recents");
            }}
            className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "recents"
                ? "bg-neutral-800/90 text-white"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>{t("welcome.nav.recents")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("drafts")}
            className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "drafts"
                ? "bg-neutral-800/90 text-white"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <File size={14} className="text-neutral-400" />
            <span>{t("welcome.nav.drafts")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("starred")}
            className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "starred"
                ? "bg-neutral-800/90 text-white"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <Star size={14} className="text-neutral-400" />
            <span>{t("welcome.nav.starred")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("trash")}
            className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "trash"
                ? "bg-neutral-800/90 text-white"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <Trash2 size={14} className="text-neutral-400" />
            <span>{t("welcome.nav.trash")}</span>
          </button>
        </div>

        {/* Section: Project folders, created in the workspace (Figma-style sidebar) */}
        <div className="welcome-sidebar-folders space-y-0.5">
          <div className="flex items-center justify-between pt-2 pb-1 pl-2.5 pr-1.5">
            <span className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
              {t("welcome.folders.title")}
            </span>
            <button
              type="button"
              aria-label={t("welcome.folders.new")}
              title={t("welcome.folders.new")}
              onClick={() => {
                setFolderError("");
                setCreatingFolder(true);
              }}
              className="rounded-md p-0.5 text-neutral-400 hover:bg-neutral-800/60 hover:text-white transition-colors cursor-pointer"
            >
              <Plus size={12} />
            </button>
          </div>

          {creatingFolder && (
            <form onSubmit={handleCreateFolder} className="px-1 pb-1">
              <input
                autoFocus
                type="text"
                value={folderName}
                onChange={(e) => {
                  setFolderName(e.target.value);
                  setFolderError("");
                }}
                onBlur={() => {
                  if (!folderName.trim()) setCreatingFolder(false);
                }}
                placeholder={t("welcome.folders.placeholder")}
                aria-label={t("welcome.folders.placeholder")}
                className="w-full h-7 px-2 text-xs rounded-lg bg-neutral-900/80 text-neutral-200 placeholder-neutral-400 focus:outline-none focus:bg-neutral-800 transition-colors"
              />
              {folderError && <p className="px-1 pt-1 text-[11px] text-rose-400">{folderError}</p>}
            </form>
          )}

          {folders.map((folder) => (
            <div
              key={folder.id}
              data-testid="sidebar-folder"
              onContextMenu={(event) => openFolderMenu(event, folder)}
              className={`group w-full flex items-center gap-2 rounded-xl pr-1 transition-colors ${
                activeFolder === folder.name
                  ? "bg-neutral-800/90 text-white"
                  : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setActiveFolder(folder.name);
                  setActiveTab("recents");
                }}
                className="min-w-0 flex flex-1 items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-xs font-medium cursor-pointer"
              >
                <FolderOpen size={14} className="shrink-0 text-neutral-400" />
                <span className="truncate">{folder.name}</span>
              </button>
              <button
                type="button"
                aria-label={t("welcome.folders.manage", { name: folder.name })}
                title={t("welcome.folders.manage", { name: folder.name })}
                onClick={(event) => openFolderMenu(event, folder)}
                className="shrink-0 rounded-lg p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200 focus-visible:opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <MoreHorizontal size={14} />
              </button>
            </div>
          ))}
        </div>

        {folderMenu && createPortal(
          <div
            role="menu"
            data-testid="sidebar-folder-menu"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            style={{ top: folderMenu.top, left: folderMenu.left }}
            className="fixed z-50 flex w-40 flex-col rounded-xl bg-neutral-900 p-1 shadow-menu ring-1 ring-white/10"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                setFolderMenu(null);
                handleDeleteFolder(event, folderMenu.folder);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] text-rose-400 hover:bg-rose-950/40 cursor-pointer"
            >
              <Trash2 size={12} />
              <span>{t("welcome.folders.delete", { name: folderMenu.folder.name })}</span>
            </button>
          </div>,
          document.body,
        )}

        {/* Section: Templates & Systems */}
        <div className="welcome-sidebar-library space-y-0.5">
          <div className="pt-2 pb-1 px-2.5 text-[11px] font-semibold text-neutral-500 uppercase tracking-wider">
            {t("welcome.nav.templates")}
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("design-systems")}
            className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "design-systems"
                ? "bg-neutral-800/90 text-white"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
            </svg>
            <span>{t("welcome.nav.designSystems")}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("shortcuts")}
            className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              activeTab === "shortcuts"
                ? "bg-neutral-800/90 text-white"
                : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
            }`}
          >
            <svg className="size-3.5 text-neutral-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>{t("welcome.nav.shortcuts")}</span>
          </button>
        </div>
      </div>

      {/* Sidebar Footer Status */}
      <div className="welcome-sidebar-footer px-2 pt-4">
        <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
          <span>VOO Design 1.0</span>
          <span className="size-1.5 rounded-full bg-mint" />
        </div>
      </div>
    </aside>
  );
}
