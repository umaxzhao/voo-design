import React from "react";
import WelcomeFileCover from "./welcome_file_cover.jsx";
import {
  File,
  Star,
  Trash2,
  MoreHorizontal,
  Search,
  LayoutGrid,
  List,
  ChevronDown,
} from "lucide-react";
import { formatRelativeTime, buildSortLabelMap } from "./welcome_helpers.js";
import { WelcomeFileContextMenu } from "./welcome_file_context_menu.jsx";
import { WelcomeMenuSurface } from "./welcome_menu_surface.jsx";

/** File toolbar, empty states, grid view, and tabular list view for the welcome dashboard. */
export function WelcomeFileCollection({
  t,
  items,
  mode,
  tabType = "recents",
  activeTab,
  fileList,
  menuRef,
  sortBy,
  setSortBy,
  sortMenuOpen,
  setSortMenuOpen,
  viewMode,
  setViewMode,
  searchQuery,
  activeMenuId,
  setActiveMenuId,
  folders,
  handleRestore,
  handleDeletePermanently,
  handleOpenRecent,
  handleOpenLocal,
  handleToggleStar,
  handleMoveToFolder,
  handleStartRename,
  handleDuplicate,
  handleMoveToTrash,
}) {
  const sortLabelMap = buildSortLabelMap(t);

  /** Title, count, sort and view controls shown above every file list. */
  function renderFileListToolbar() {
    const title =
      activeTab === "recents" ? t("welcome.nav.recents")
      : activeTab === "drafts" ? t("welcome.nav.drafts")
      : activeTab === "starred" ? t("welcome.nav.starred")
      : t("welcome.nav.trash");
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold tracking-wide text-neutral-200">{title}</h2>
          <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded-md">
            {fileList.length}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Sort Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={sortMenuOpen}
              onClick={() => setSortMenuOpen(!sortMenuOpen)}
              className="flex items-center gap-1.5 rounded-xl bg-neutral-900/80 hover:bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors cursor-pointer"
            >
              <span>{sortLabelMap[sortBy] || t("welcome.sort.lastModified")}</span>
              <ChevronDown size={12} className="text-neutral-400" />
            </button>

            {sortMenuOpen && (
              <WelcomeMenuSurface label={t("welcome.menu.sortAndView")} onClose={() => setSortMenuOpen(false)}>
                {["updatedAt", "oldest", "nameAsc", "nameDesc"].map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sortBy === key}
                    onClick={() => {
                      setSortBy(key);
                      setSortMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors cursor-pointer ${
                      sortBy === key ? "text-mint font-medium bg-neutral-800/60" : "text-neutral-300 hover:bg-neutral-800"
                    }`}
                  >
                    {sortLabelMap[key]}
                  </button>
                ))}
              </WelcomeMenuSurface>
            )}
          </div>

          {/* View Switcher: Grid vs List */}
          <div className="flex items-center rounded-xl bg-neutral-900/80 p-0.5 text-neutral-400">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1 rounded-lg cursor-pointer transition-colors ${
                viewMode === "grid" ? "text-white bg-neutral-800" : "hover:text-neutral-200"
              }`}
              title={t("welcome.view.grid")}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1 rounded-lg cursor-pointer transition-colors ${
                viewMode === "list" ? "text-white bg-neutral-800" : "hover:text-neutral-200"
              }`}
              title={t("welcome.view.list")}
            >
              <List size={13} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderFileItems() {
    if (items.length === 0) {
      if (searchQuery) {
        return (
          <div className="flex flex-col items-center justify-center p-12 text-center rounded-3xl bg-neutral-900/20">
            <Search size={28} className="text-neutral-500 mb-2" />
            <p className="text-xs font-medium text-neutral-300">{t("welcome.empty.search")}</p>
            <p className="text-[11px] text-neutral-500 mt-1">"{searchQuery}"</p>
          </div>
        );
      }

      if (tabType === "starred") {
        return (
          <div className="flex flex-col items-center justify-center p-16 text-center rounded-3xl bg-neutral-900/20">
            <Star size={28} className="text-neutral-400 mb-3" />
            <p className="text-xs font-medium text-neutral-200">{t("welcome.empty.starred")}</p>
            <p className="text-[11px] text-neutral-500 mt-1 max-w-sm">{t("welcome.empty.starredDesc")}</p>
          </div>
        );
      }

      if (tabType === "trash") {
        return (
          <div className="flex flex-col items-center justify-center p-16 text-center rounded-3xl bg-neutral-900/20">
            <Trash2 size={28} className="text-neutral-500 mb-3" />
            <p className="text-xs font-medium text-neutral-200">{t("welcome.empty.trash")}</p>
            <p className="text-[11px] text-neutral-500 mt-1 max-w-sm">{t("welcome.empty.trashDesc")}</p>
          </div>
        );
      }

      if (tabType === "drafts") {
        return (
          <div className="flex flex-col items-center justify-center p-16 text-center rounded-3xl bg-neutral-900/20">
            <File size={28} className="text-neutral-500 mb-3" />
            <p className="text-xs font-medium text-neutral-200">{t("welcome.empty.drafts")}</p>
            <p className="text-[11px] text-neutral-500 mt-1 max-w-sm">{t("welcome.empty.draftsDesc")}</p>
          </div>
        );
      }

      return null;
    }

    // Grid View
    if (mode === "grid") {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((item) => {
            const isMenuOpen = activeMenuId === item.id;
            const isTrash = activeTab === "trash";

            return (
              <div
                key={item.id}
                data-welcome-file-id={item.id}
                className="group relative flex flex-col rounded-2xl bg-neutral-900/40 hover:bg-neutral-900/90 transition-all cursor-pointer"
              >
                <button type="button" aria-label={item.name} onClick={() => (isTrash ? handleRestore(null, item.id) : handleOpenRecent(item))} className="absolute inset-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-mint" />
                {/* Thumbnail Preview Area */}
                <div className="pointer-events-none relative aspect-[16/10] bg-neutral-900 rounded-t-2xl flex items-center justify-center">
                  <WelcomeFileCover item={item} />

                  {/* Top action overlay: Star & More menu button */}
                  <div className="pointer-events-auto absolute bottom-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity z-10">
                    {/* Star button */}
                    {!isTrash && (
                      <button
                        type="button"
                        onClick={(e) => handleToggleStar(e, item.id)}
                        className={`flex size-12 sm:size-6 items-center justify-center rounded-xl backdrop-blur-md transition-colors ${
                          item.starred
                            ? "bg-black/80 text-neutral-100 !opacity-100"
                            : "bg-black/60 text-neutral-400 hover:text-neutral-100"
                        }`}
                        title={item.starred ? t("welcome.actions.unstar") : t("welcome.actions.star")}
                      >
                        <Star size={12} className={item.starred ? "fill-neutral-100" : ""} />
                      </button>
                    )}

                    {/* Right-aligned more menu button */}
                    <div className="ml-auto relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(isMenuOpen ? null : item.id);
                        }}
                        className="flex size-12 sm:size-6 items-center justify-center rounded-xl bg-black/60 text-neutral-300 hover:text-white backdrop-blur-md transition-colors"
                        title={t("welcome.actions.more")}
                      >
                        <MoreHorizontal size={13} />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <WelcomeFileContextMenu
                          t={t}
                          onClose={() => setActiveMenuId(null)}
                          item={item}
                          isTrash={isTrash}
                          folders={folders}
                          handleRestore={handleRestore}
                          handleDeletePermanently={handleDeletePermanently}
                          handleOpenRecent={handleOpenRecent}
                          handleOpenLocal={handleOpenLocal}
                          handleToggleStar={handleToggleStar}
                          handleMoveToFolder={handleMoveToFolder}
                          handleStartRename={handleStartRename}
                          handleDuplicate={handleDuplicate}
                          handleMoveToTrash={handleMoveToTrash}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Meta */}
                <div className="pointer-events-none p-3 space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-neutral-200 group-hover:text-white truncate">
                      <File size={12} className="shrink-0 text-neutral-500" />
                      <span className="truncate">{item.name || "Untitled.voo"}</span>
                    </div>
                    {item.starred && !isTrash && (
                      <Star size={10} className="shrink-0 text-neutral-100 fill-neutral-100" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 font-mono">
                    <span>{t("welcome.edited")}{formatRelativeTime(t, item.updatedAt)}</span>
                    {item.isDraft && (
                      <span className="text-[10px] text-neutral-400 bg-neutral-800/80 px-1.5 py-0.5 rounded-md">
                        Draft
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    // List View (Tabular Figma layout)
    return (
      <div className="w-full rounded-3xl bg-neutral-900/30 overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[11px] font-medium text-neutral-500 bg-neutral-950/40">
          <div className="col-span-6 flex items-center gap-2">
            <span>{t("welcome.table.name")}</span>
          </div>
          <div className="col-span-3">
            <span>{t("welcome.table.lastModified")}</span>
          </div>
          <div className="col-span-2">
            <span>{t("welcome.table.type")}</span>
          </div>
          <div className="col-span-1 text-right">
            <span>{t("welcome.table.actions")}</span>
          </div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-white/5">
          {items.map((item) => {
            const isMenuOpen = activeMenuId === item.id;
            const isTrash = activeTab === "trash";

            return (
              <div
                key={item.id}
                data-welcome-file-id={item.id}
                onClick={() => (isTrash ? handleRestore(null, item.id) : handleOpenRecent(item))}
                className="group grid grid-cols-12 gap-3 px-4 py-2.5 items-center hover:bg-neutral-900/60 transition-colors cursor-pointer text-xs"
              >
                {/* Column 1: Star, Icon & Name */}
                <div className="col-span-6 flex items-center gap-2.5 min-w-0">
                  {!isTrash ? (
                    <button
                      type="button"
                      title={item.starred ? t("welcome.actions.unstar") : t("welcome.actions.star")}
                      onClick={(e) => handleToggleStar(e, item.id)}
                      className={`p-1 rounded-xl transition-colors ${
                        item.starred ? "text-neutral-100" : "text-neutral-500 hover:text-neutral-400"
                      }`}
                    >
                      <Star size={13} className={item.starred ? "fill-neutral-100" : ""} />
                    </button>
                  ) : (
                    <Trash2 size={13} className="text-neutral-500" />
                  )}

                  <File size={13} className="shrink-0 text-neutral-400" />

                  <button type="button" onClick={(event) => { event.stopPropagation(); isTrash ? handleRestore(null, item.id) : handleOpenRecent(item); }} className="truncate text-left font-medium text-neutral-200 group-hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-mint">
                    {item.name || "Untitled.voo"}
                  </button>

                  {item.isDraft && (
                    <span className="text-[10px] text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded-md font-mono">
                      Draft
                    </span>
                  )}
                </div>

                {/* Column 2: Last Modified */}
                <div className="col-span-3 text-[11px] text-neutral-400 font-mono">
                  {formatRelativeTime(t, item.updatedAt)}
                </div>

                {/* Column 3: Format / Size */}
                <div className="col-span-2 text-[11px] text-neutral-500 font-mono">
                  {item.category || "Design"} · {item.path ? ".voo" : "Local"}
                </div>

                {/* Column 4: Quick Actions */}
                <div className="col-span-1 flex items-center justify-end relative">
                  <button
                    type="button"
                    title={t("welcome.actions.more")}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuId(isMenuOpen ? null : item.id);
                    }}
                    className="p-1 rounded-xl text-neutral-500 hover:text-white hover:bg-neutral-800 transition-colors"
                  >
                    <MoreHorizontal size={14} />
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <WelcomeFileContextMenu
                      t={t}
                      onClose={() => setActiveMenuId(null)}
                      item={item}
                      isTrash={isTrash}
                      folders={folders}
                      handleRestore={handleRestore}
                      handleDeletePermanently={handleDeletePermanently}
                      handleOpenRecent={handleOpenRecent}
                      handleOpenLocal={handleOpenLocal}
                      handleToggleStar={handleToggleStar}
                      handleMoveToFolder={handleMoveToFolder}
                      handleStartRename={handleStartRename}
                      handleDuplicate={handleDuplicate}
                      handleMoveToTrash={handleMoveToTrash}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {renderFileListToolbar()}
      {renderFileItems()}
    </div>
  );
}
