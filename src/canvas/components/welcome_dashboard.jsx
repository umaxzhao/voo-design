import { dispatchToAgent } from "./dispatch_to_agent.js";
import { HTML_IMPORT_ACCEPT, SCREENSHOT_ACCEPT, importWelcomeHtml, recreateWelcomeScreenshot } from "./welcome_home_actions.js";
import React, { useState, useRef } from "react";
import { Trash2 } from "lucide-react";
import { useDesignStore } from "../../store/design_store.js";
import { openVooProject } from "../store/project_io.js";
import { useI18n } from "../use_i18n.js";
import CommunityTemplatesView from "./community_templates_view.jsx";
import { AI_GEN_TYPES, CATEGORY_PILLS } from "./welcome_dashboard/welcome_constants.js";
import { useWelcomeMenuDismiss } from "./welcome_dashboard/use_welcome_menu_dismiss.js";
import { useWelcomeFiles } from "./welcome_dashboard/use_welcome_files.js";
import { useWelcomeFolders } from "./welcome_dashboard/use_welcome_folders.js";
import { useWelcomeCreate } from "./welcome_dashboard/use_welcome_create.js";
import { useWelcomeOpen } from "./welcome_dashboard/use_welcome_open.js";
import { useWelcomeFileActions } from "./welcome_dashboard/use_welcome_file_actions.js";
import { WelcomeSidebar } from "./welcome_dashboard/welcome_sidebar.jsx";
import { WelcomePromptComposer } from "./welcome_dashboard/welcome_prompt_composer.jsx";
import { WelcomeFileCollection } from "./welcome_dashboard/welcome_file_collection.jsx";
import {
  WelcomeDropOverlay,
  WelcomeShortcutsTab,
  WelcomeRenameModal,
  WelcomeEmptyTrashModal,
} from "./welcome_dashboard/welcome_dialogs_and_shortcuts.jsx";

export { AI_GEN_TYPES, CATEGORY_PILLS };

export default function WelcomeDashboard() {
  const { t } = useI18n();

  // Navigation tabs: "recents" | "drafts" | "starred" | "trash" | "design-systems" | "shortcuts"
  const [activeTab, setActiveTab] = useState("recents");
  const [activeFolder, setActiveFolder] = useState(null);
  const [activePill, setActivePill] = useState("landing");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt"); // "updatedAt" | "oldest" | "nameAsc" | "nameDesc"
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"

  const [promptText, setPromptText] = useState("");
  const [selectedModel] = useState("VOO Agent 3.5");
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);

  const fileInputRef = useRef(null);
  const htmlInputRef = useRef(null);
  const screenshotInputRef = useRef(null);
  const menuRef = useRef(null);
  const setWelcomeOpen = useDesignStore((state) => state.setWelcomeOpen);

  useWelcomeMenuDismiss({ menuRef, setActiveMenuId, setSortMenuOpen });

  const { fileList, reloadFiles } = useWelcomeFiles({
    activeTab,
    searchQuery,
    sortBy,
    activeFolder,
  });

  const {
    folders,
    creatingFolder,
    setCreatingFolder,
    folderName,
    setFolderName,
    folderError,
    setFolderError,
    handleCreateFolder,
  } = useWelcomeFolders({ t });

  const { handleCreateNew, handleUseTemplate } = useWelcomeCreate({
    t,
    fileList,
    reloadFiles,
    setWelcomeOpen,
  });

  const handlePromptSubmit = async (e) => {
    e?.preventDefault();
    const activePreset = AI_GEN_TYPES.find((p) => p.id === activePill) || AI_GEN_TYPES[0];
    const userPrompt = promptText.trim();
    const docLabel = userPrompt ? userPrompt.slice(0, 24) : t(activePreset.label);

    await handleCreateNew({
      label: docLabel,
      width: activePreset.width,
      height: activePreset.height,
      type: activePreset.type,
      category: activePreset.category,
    });

    if (typeof window !== "undefined") {
      const promptToDispatch =
        userPrompt ||
        `${t(activePreset.label)}: Generate a modern, production-grade ${activePreset.id} interface with clean visual hierarchy.`;
      const context = {
        generationType: activePreset.id,
        preset: activePreset.id,
        targetWidth: activePreset.width,
        targetHeight: activePreset.height,
        fromWelcomeDashboard: true,
      };

      dispatchToAgent({ prompt: promptToDispatch, intent: "generate", tool: "canvas_generate", context, autoSend: true });
    }
  };

  const { handleOpenLocal: openLocalProject, handleOpenRecent, handleDrop } = useWelcomeOpen({
    setWelcomeOpen,
    setIsDragOver,
  });
  const handleOpenLocal = openLocalProject;

  const {
    renameItem,
    setRenameItem,
    renameInput,
    setRenameInput,
    confirmEmptyTrashOpen,
    setConfirmEmptyTrashOpen,
    handleToggleStar,
    handleMoveToFolder,
    handleStartRename,
    handleConfirmRename,
    handleDuplicate,
    handleMoveToTrash,
    handleRestore,
    handleDeletePermanently,
    handleEmptyTrash,
  } = useWelcomeFileActions({ reloadFiles, setActiveMenuId });

  const sharedCollectionProps = {
    t,
    items: fileList,
    mode: viewMode,
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
  };

  return (
    <div
      className="welcome-dashboard relative flex flex-col lg:flex-row h-full w-full select-none bg-black text-neutral-100 overflow-hidden rounded-3xl"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsDragOver(false);
        }
      }}
      onDrop={handleDrop}
    >
      {/* Hidden file input for file selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".voo,.psd,.fig,.pen,.svg,application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) {
            const res = await openVooProject({ store: useDesignStore.getState(), fileOrPath: file });
            if (res?.success) setWelcomeOpen(false);
          }
        }}
      />

      <input ref={htmlInputRef} type="file" accept={HTML_IMPORT_ACCEPT} className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try { await importWelcomeHtml(file, useDesignStore.getState()); }
          catch (error) { console.error("[VOO] HTML import failed:", error); }
        }} />
      <input ref={screenshotInputRef} type="file" accept={SCREENSHOT_ACCEPT} className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          try {
            setPromptText("");
            await recreateWelcomeScreenshot(file, { createDesign: handleCreateNew, getStore: useDesignStore.getState });
          } catch (error) { console.error("[VOO] Screenshot import failed:", error); }
        }} />

      <WelcomeDropOverlay t={t} isDragOver={isDragOver} />

      <WelcomeSidebar
        t={t}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeFolder={activeFolder}
        setActiveFolder={setActiveFolder}
        folders={folders}
        creatingFolder={creatingFolder}
        setCreatingFolder={setCreatingFolder}
        folderName={folderName}
        setFolderName={setFolderName}
        folderError={folderError}
        setFolderError={setFolderError}
        handleCreateFolder={handleCreateFolder}
      />

      {/* Main Workspace */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-neutral-950 overflow-y-auto">
        {/* Top Header Strip with Search, View Mode, Sort and Actions */}
        <header className="flex h-14 shrink-0 items-center justify-between px-8 bg-neutral-950/60 backdrop-blur-md sticky top-0 z-20 gap-4">
          {/* Right: Controls & Actions */}
          <div className="ml-auto flex items-center gap-2.5 shrink-0">
            {/* Trash specific action: Empty trash */}
            {activeTab === "trash" && fileList.length > 0 && (
              <button
                type="button"
                onClick={() => setConfirmEmptyTrashOpen(true)}
                className="flex items-center gap-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 transition-colors cursor-pointer"
              >
                <Trash2 size={13} />
                <span>{t("welcome.actions.emptyTrash")}</span>
              </button>
            )}
          </div>
        </header>

        {/* =================== TAB 1: RECENTS =================== */}
        {activeTab === "recents" && (
          <div className="flex-1 p-4 lg:p-8 max-w-6xl w-full mx-auto space-y-8">
            <WelcomePromptComposer
              t={t}
              activePill={activePill}
              setActivePill={setActivePill}
              promptText={promptText}
              setPromptText={setPromptText}
              selectedModel={selectedModel}
              fileInputRef={fileInputRef}
              handlePromptSubmit={handlePromptSubmit}
            />

            {/* Quick Action Cards (Import Figma / Browser / Recreate) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex min-w-0 items-center justify-center gap-2.5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-700/70 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="size-4 text-neutral-400 group-hover:text-neutral-200 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z" />
                  <path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z" />
                  <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z" />
                  <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z" />
                  <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z" />
                </svg>
                <span className="whitespace-nowrap">{t("welcome.actions.importFigma")}</span>
              </button>

              <button
                type="button"
                onClick={() => htmlInputRef.current?.click()}
                className="flex min-w-0 items-center justify-center gap-2.5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-700/70 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="size-4 text-neutral-400 group-hover:text-neutral-200 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span className="whitespace-nowrap">{t("welcome.actions.importBrowser")}</span>
              </button>

              <button
                type="button"
                onClick={() => screenshotInputRef.current?.click()}
                className="flex min-w-0 items-center justify-center gap-2.5 rounded-2xl bg-neutral-800/70 hover:bg-neutral-700/70 p-4 text-xs font-medium text-neutral-300 hover:text-white transition-all cursor-pointer group"
              >
                <svg className="size-4 text-neutral-400 group-hover:text-neutral-200 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span className="whitespace-nowrap">{t("welcome.actions.recreateScreenshot")}</span>
              </button>
            </div>

            {/* Recents Section Header & File List */}
            <div className="space-y-4 pt-2">
              <WelcomeFileCollection {...sharedCollectionProps} tabType="recents" />
            </div>
          </div>
        )}

        {/* =================== TAB 2: DRAFTS =================== */}
        {activeTab === "drafts" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-6">
            <WelcomeFileCollection {...sharedCollectionProps} tabType="drafts" />
          </div>
        )}

        {/* =================== TAB 3: STARRED =================== */}
        {activeTab === "starred" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-6">
            <WelcomeFileCollection {...sharedCollectionProps} tabType="starred" />
          </div>
        )}

        {/* =================== TAB 4: TRASH =================== */}
        {activeTab === "trash" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-6">
            <WelcomeFileCollection {...sharedCollectionProps} tabType="trash" />
          </div>
        )}

        {/* =================== TAB 5: COMMUNITY TEMPLATES & DESIGN SYSTEMS =================== */}
        {activeTab === "design-systems" && (
          <div className="flex-1 p-8 max-w-6xl w-full mx-auto space-y-6">
            <CommunityTemplatesView onUseTemplate={handleUseTemplate} />
          </div>
        )}

        {/* =================== TAB 6: SHORTCUTS & USER GUIDE =================== */}
        {activeTab === "shortcuts" && <WelcomeShortcutsTab t={t} />}
      </main>

      <WelcomeRenameModal
        t={t}
        renameItem={renameItem}
        setRenameItem={setRenameItem}
        renameInput={renameInput}
        setRenameInput={setRenameInput}
        handleConfirmRename={handleConfirmRename}
      />

      <WelcomeEmptyTrashModal
        t={t}
        confirmEmptyTrashOpen={confirmEmptyTrashOpen}
        setConfirmEmptyTrashOpen={setConfirmEmptyTrashOpen}
        handleEmptyTrash={handleEmptyTrash}
      />
    </div>
  );
}
