import { useWelcomeActionReadiness } from "./welcome_dashboard/use_welcome_action_readiness.js";
import { SCREENSHOT_ACCEPT, openWelcomeBrowser } from "./welcome_home_actions.js";
import { usePromptAttachments } from "./use_prompt_attachments.js";
import React, { useEffect, useState, useRef } from "react";
import { Search, Trash2, X } from "lucide-react";
import { useDesignStore } from "../../store/design_store.js";
import { useI18n } from "../use_i18n.js";
import { getSetting, setSetting } from "../../shared/settings.js";
import { DEFAULT_AGENT_MODEL } from "../../shared/agent-defaults.js";
import { AGENT_SETTING } from "../agent/agent-settings.js";
import { openAgentModelSettings } from "./agent-panel/model-settings.js";
import { useModelGroups } from "./agent-panel/use_model_groups.js";
import {
  DEFAULT_DESIGN_SYSTEM_ID,
  DEFAULT_STYLE_ID,
  designSystemOptions,
  sizeOptions,
  styleOptions,
} from "./welcome_dashboard/generation-options.js";
import CommunityTemplatesView from "./community_templates_view.jsx";
import { AI_GEN_TYPES, CATEGORY_PILLS } from "./welcome_dashboard/welcome_constants.js";
import { useWelcomeMenuDismiss } from "./welcome_dashboard/use_welcome_menu_dismiss.js";
import { useWelcomeFiles } from "./welcome_dashboard/use_welcome_files.js";
import { useWelcomeFolders } from "./welcome_dashboard/use_welcome_folders.js";
import { useWelcomeCreate } from "./welcome_dashboard/use_welcome_create.js";
import { useWelcomeOpen } from "./welcome_dashboard/use_welcome_open.js";
import { useWelcomeFileActions } from "./welcome_dashboard/use_welcome_file_actions.js";
import { WelcomeOpenNotice } from "./welcome_dashboard/welcome_open_notice.jsx";
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
import { prepareCommunityTemplate } from "./community-template-selection.js";
import {
  WELCOME_FOLDERS_EVENT,
  WELCOME_MENU_ACTION_EVENT,
} from "./welcome_dashboard/welcome_events.js";

export default function WelcomeDashboard() {
  const { t, locale } = useI18n();
  const modelGroups = useModelGroups();

  // Navigation tabs: "recents" | "drafts" | "starred" | "trash" | "design-systems" | "shortcuts"
  const [activeTab, setActiveTab] = useState("recents");
  const [activeFolder, setActiveFolder] = useState(null);
  const [activePill, setActivePill] = useState("landing");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt"); // "updatedAt" | "oldest" | "nameAsc" | "nameDesc"
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [promptText, setPromptText] = useState("");
  const [modelId, setModelId] = useState(() => getSetting(AGENT_SETTING.MODEL) || DEFAULT_AGENT_MODEL);
  const [styleId, setStyleId] = useState(DEFAULT_STYLE_ID);
  const [designSystemId, setDesignSystemId] = useState(DEFAULT_DESIGN_SYSTEM_ID);
  const [size, setSize] = useState(null);
  const references = usePromptAttachments(t);
  const { attachments, attachmentError, addFiles: handleAttachmentsSelected } = references;
  const [candidates, setCandidates] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [configNotice, setConfigNotice] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);

  const fileInputRef = useRef(null);
  const screenshotInputRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const menuRef = useRef(null);
  const mobileSearchRef = useRef(null);
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
    handleDeleteFolder,
  } = useWelcomeFolders({ t, activeFolder, setActiveFolder });

  const { handleCreateNew, handleUseTemplate } = useWelcomeCreate({
    t,
    fileList,
    reloadFiles,
    setWelcomeOpen,
  });

  useEffect(() => {
    const handleMobileMenuAction = (event) => {
      const { action, value } = event.detail ?? {};
      if (action === "tab") {
        setActiveTab(value);
        setActiveFolder(null);
        setMobileSearchOpen(false);
      } else if (action === "folder") {
        setActiveTab("recents");
        setActiveFolder(value);
        setMobileSearchOpen(false);
      } else if (action === "search") {
        setActiveTab("recents");
        setActiveFolder(null);
        setMobileSearchOpen(true);
      } else if (action === "open-file" || action === "import-figma") {
        fileInputRef.current?.click();
      } else if (action === "import-browser") {
        openWelcomeBrowser();
      } else if (action === "recreate-screenshot") {
        screenshotInputRef.current?.click();
      } else if (action === "sort") {
        setSortBy(value);
      } else if (action === "view") {
        setViewMode(value);
      }
    };
    window.addEventListener(WELCOME_MENU_ACTION_EVENT, handleMobileMenuAction);
    return () =>
      window.removeEventListener(
        WELCOME_MENU_ACTION_EVENT,
        handleMobileMenuAction,
      );
  }, []);

  useEffect(() => {
    if (mobileSearchOpen) mobileSearchRef.current?.focus();
  }, [mobileSearchOpen]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(WELCOME_FOLDERS_EVENT, { detail: folders }),
    );
  }, [folders]);

  const handleSelectOnlineTemplate = async (template) => {
    const selection = prepareCommunityTemplate(template, locale);
    if (selection.type === "design") return handleUseTemplate(selection.template);
    setPromptText(selection.prompt);
    setActiveTab("recents");
  };

  const handleSelectPill = (pillId) => {
    setActivePill(pillId);
  };

  const handleSelectDesignSystem = (nextId) => {
    setDesignSystemId(nextId);
    if (nextId !== DEFAULT_DESIGN_SYSTEM_ID) setStyleId(DEFAULT_STYLE_ID);
  };

  const handleSelectModel = (nextModelId) => {
    setModelId(nextModelId);
    setSetting(AGENT_SETTING.MODEL, nextModelId);
    setConfigNotice("");
  };

  const openAgentSettings = openAgentModelSettings;

  const handlePromptSubmit = async (event) => {
    event?.preventDefault();
    if (submitting || references.isReading) return;
    const activePreset = AI_GEN_TYPES.find((item) => item.id === activePill) || AI_GEN_TYPES[0];
    const userPrompt = promptText.trim() || (attachments.some(item => item.kind === "image") ? t("welcome.prompt.recreatePrompt") : "");
    const docLabel = userPrompt ? userPrompt.slice(0, 24) : t(activePreset.label);

    setSubmitting(true);
    setConfigNotice("");
    try {
      const { buildGenerationIntent } = userPrompt ? await import("./welcome_dashboard/generation_intent.js") : {};
      const intent = userPrompt
        ? buildGenerationIntent({
            preset: activePreset,
            prompt: userPrompt,
            styleId,
            designSystemId,
            modelId,
            size,
            attachments,
            candidates,
            locale,
            t,
          })
        : null;
      if (intent) {
        // Validate the provider BEFORE creating a document, so a misconfigured
        // agent does not leave an empty project behind.
        try {
          const { resolveAgentProvider } = await import("../agent/agent_provider.js");
          await resolveAgentProvider(intent.modelId);
        } catch {
          setConfigNotice(t("welcome.prompt.configNeeded"));
          openAgentSettings();
          return;
        }
      }
      await handleCreateNew({
        label: docLabel,
        width: size?.width ?? activePreset.width,
        height: size?.height ?? activePreset.height,
        type: activePreset.type,
        category: activePreset.category,
      });
      if (intent) {
        useDesignStore.getState().setPendingGeneration(intent);
        setPromptText("");
        references.clearAttachments();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const { handleOpenLocal: openLocalProject, handleOpenRecent, handleDrop, openNotice } = useWelcomeOpen({
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

  useWelcomeActionReadiness();

  return (
    <div
      data-active-tab={activeTab}
      data-mobile-search-open={mobileSearchOpen ? "true" : "false"}
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
      onPaste={(event) => {
        if (event.target.closest(".prompt-composer textarea")) return references.onPaste(event);
      }}
      onDrop={handleDrop}
    >
      {/* Hidden file input for file selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".voo,.zip,.psd,.fig,.pen,.svg,application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) await handleOpenLocal(file);
        }}
      />

      <input ref={screenshotInputRef} type="file" accept={SCREENSHOT_ACCEPT} className="hidden"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          await handleAttachmentsSelected(files);
          screenshotInputRef.current?.closest(".welcome-dashboard")?.querySelector(".prompt-composer textarea")?.focus();
        }} />

      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,.voo,.pen,.fig,.svg"
        className="hidden"
        onChange={async (event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          if (files?.length) await handleAttachmentsSelected(files);
        }}
      />

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
        handleDeleteFolder={handleDeleteFolder}
      />

      {/* Main Workspace */}
      <main className="welcome-main flex-1 flex flex-col min-w-0 min-h-0 bg-neutral-950 overflow-y-auto">
        {/* Top Header Strip with Search, View Mode, Sort and Actions */}
        {activeTab !== "recents" && <header className="flex h-14 shrink-0 items-center justify-between px-8 bg-neutral-950/60 backdrop-blur-md sticky top-0 z-20 gap-4">
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
        </header>}

        <WelcomeOpenNotice t={t} notice={openNotice} />

        {/* =================== TAB 1: RECENTS =================== */}
        {activeTab === "recents" && (
          <div className="welcome-home-content flex-1 p-4 lg:p-8 max-w-6xl w-full mx-auto space-y-8">
            <h1 className="text-center text-[15px] font-medium text-neutral-100" data-testid="welcome-prompt-heading">{t("welcome.prompt.heading")}</h1>
            <WelcomePromptComposer
              t={t}
              activePill={activePill}
              onSelectPill={handleSelectPill}
              promptText={promptText}
              setPromptText={setPromptText}
              modelGroups={modelGroups}
              selectedModel={modelId}
              onSelectModel={handleSelectModel}
              styleId={styleId}
              styleOptions={styleOptions()}
              onSelectStyle={setStyleId}
              designSystemId={designSystemId}
              designSystemOptions={designSystemOptions(t)}
              onSelectDesignSystem={handleSelectDesignSystem}
              size={size}
              sizeOptions={sizeOptions()}
              onSelectSize={setSize}
              candidates={candidates}
              onSelectCandidates={setCandidates}
              attachments={attachments}
              onAddAttachments={() => attachmentInputRef.current?.click()}
              onRemoveAttachment={(target) =>
                references.removeAttachment(target)
              }
              submitting={submitting || references.isReading}
              configNeeded={Boolean(configNotice)}
              onOpenSettings={openAgentSettings}
              onSubmit={handlePromptSubmit}
            />

            {(configNotice || attachmentError) && (
              <div className="mx-auto -mt-4 flex max-w-3xl flex-wrap items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                <span className="min-w-0 flex-1">{configNotice || attachmentError}</span>
                {configNotice && (
                  <button
                    type="button"
                    onClick={openAgentSettings}
                    className="shrink-0 rounded-lg bg-amber-500/15 px-2.5 py-1 text-amber-200 transition-colors hover:bg-amber-500/25"
                  >
                    {t("welcome.prompt.openSettings")}
                  </button>
                )}
              </div>
            )}

            {mobileSearchOpen && (
              <div className="welcome-mobile-search relative">
                <Search
                  size={15}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  ref={mobileSearchRef}
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("welcome.search.placeholder")}
                  aria-label={t("welcome.search.placeholder")}
                  className="h-11 w-full rounded-xl border border-white/10 bg-neutral-900 pl-10 pr-11 text-xs text-neutral-100 placeholder:text-neutral-400 outline-none focus:border-white/20"
                />
                <button
                  type="button"
                  aria-label={t("welcome.dialog.cancel")}
                  onClick={() => {
                    setMobileSearchOpen(false);
                    setSearchQuery("");
                  }}
                  className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-400 hover:bg-white/10 hover:text-white"
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </div>
            )}

            {/* Quick Action Cards (Import Figma / Browser / Recreate) */}
            <div className="welcome-quick-imports grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                onClick={openWelcomeBrowser}
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
            <div className="welcome-home-projects space-y-4 pt-2">
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
            <CommunityTemplatesView onUseTemplate={handleSelectOnlineTemplate} />
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
