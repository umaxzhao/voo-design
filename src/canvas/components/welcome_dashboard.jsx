import React, { useEffect, useState, useRef } from "react";
import { Trash2 } from "lucide-react";
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
} from "./welcome_dashboard/generation-options.js";
import CommunityTemplatesView from "./community_templates_view.jsx";
import { AI_GEN_TYPES, CATEGORY_PILLS } from "./welcome_dashboard/welcome_constants.js";
import { useWelcomeMenuDismiss } from "./welcome_dashboard/use_welcome_menu_dismiss.js";
import { useWelcomeFiles } from "./welcome_dashboard/use_welcome_files.js";
import { useWelcomeFolders } from "./welcome_dashboard/use_welcome_folders.js";
import { useWelcomeCreate } from "./welcome_dashboard/use_welcome_create.js";
import { useWelcomeOpen } from "./welcome_dashboard/use_welcome_open.js";
import { useWelcomeFileActions } from "./welcome_dashboard/use_welcome_file_actions.js";
import { useWelcomeActionReadiness } from "./welcome_dashboard/use_welcome_action_readiness.js";
import { usePromptAttachments } from "./use_prompt_attachments.js";
import { useWelcomeSidebarState } from "./welcome_dashboard/use_welcome_sidebar_state.js";
import { useWelcomeMobileActions } from "./welcome_dashboard/use_welcome_mobile_actions.js";
import { useWelcomePromptSubmit } from "./welcome_dashboard/use_welcome_prompt_submit.js";
import { WelcomeCollapsibleSidebar } from "./welcome_dashboard/welcome_collapsible_sidebar.jsx";
import { WelcomeHiddenInputs } from "./welcome_dashboard/welcome_hidden_inputs.jsx";
import { WelcomeRecentsTab } from "./welcome_dashboard/welcome_recents_tab.jsx";
import { WelcomeOpenNotice } from "./welcome_dashboard/welcome_open_notice.jsx";
import { WelcomeFileCollection } from "./welcome_dashboard/welcome_file_collection.jsx";
import {
  WelcomeDropOverlay,
  WelcomeShortcutsTab,
  WelcomeRenameModal,
  WelcomeEmptyTrashModal,
} from "./welcome_dashboard/welcome_dialogs_and_shortcuts.jsx";
import { prepareCommunityTemplate } from "./community-template-selection.js";
import { WELCOME_FOLDERS_EVENT } from "./welcome_dashboard/welcome_events.js";

export { AI_GEN_TYPES, CATEGORY_PILLS };

export default function WelcomeDashboard() {
  const { t, locale } = useI18n();
  const modelGroups = useModelGroups();

  const [activeTab, setActiveTab] = useState("recents");
  const [activeFolder, setActiveFolder] = useState(null);
  const [activePill, setActivePill] = useState("landing");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("updatedAt");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const { expanded: sidebarExpanded, isNarrow: sidebarIsNarrow, toggle: toggleSidebar, close: closeSidebar } = useWelcomeSidebarState();
  const sidebarToggleRef = useRef(null);

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

  useWelcomeMobileActions({
    setActiveTab,
    setActiveFolder,
    setMobileSearchOpen,
    fileInputRef,
    screenshotInputRef,
    setSortBy,
    setViewMode,
  });

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

  const handleSelectPill = (pillId) => setActivePill(pillId);

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

  const { handlePromptSubmit } = useWelcomePromptSubmit({
    promptText,
    setPromptText,
    activePill,
    attachments,
    references,
    submitting,
    setSubmitting,
    setConfigNotice,
    styleId,
    designSystemId,
    modelId,
    size,
    candidates,
    locale,
    t,
    openAgentSettings,
    handleCreateNew,
  });

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
      data-sidebar-expanded={sidebarExpanded ? "true" : "false"}
      className="welcome-dashboard relative flex flex-col lg:flex-row h-full w-full select-none bg-black text-neutral-100 overflow-hidden rounded-3xl"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
      }}
      onPaste={(event) => {
        if (event.target.closest(".prompt-composer textarea")) return references.onPaste(event);
      }}
      onDrop={handleDrop}
    >
      <WelcomeHiddenInputs
        fileInputRef={fileInputRef}
        screenshotInputRef={screenshotInputRef}
        attachmentInputRef={attachmentInputRef}
        handleOpenLocal={handleOpenLocal}
        handleAttachmentsSelected={handleAttachmentsSelected}
      />

      <WelcomeDropOverlay t={t} isDragOver={isDragOver} />

      <WelcomeCollapsibleSidebar
        t={t}
        sidebarToggleRef={sidebarToggleRef}
        sidebarExpanded={sidebarExpanded}
        sidebarIsNarrow={sidebarIsNarrow}
        toggleSidebar={toggleSidebar}
        closeSidebar={closeSidebar}
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
        {activeTab !== "recents" && (
          <header className="flex h-14 shrink-0 items-center justify-between px-8 bg-neutral-950/60 backdrop-blur-md sticky top-0 z-20 gap-4">
            <div className="ml-auto flex items-center gap-2.5 shrink-0">
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
        )}

        <WelcomeOpenNotice t={t} notice={openNotice} />

        {/* =================== TAB 1: RECENTS =================== */}
        {activeTab === "recents" && (
          <WelcomeRecentsTab
            t={t}
            activePill={activePill}
            handleSelectPill={handleSelectPill}
            promptText={promptText}
            setPromptText={setPromptText}
            modelGroups={modelGroups}
            modelId={modelId}
            handleSelectModel={handleSelectModel}
            styleId={styleId}
            setStyleId={setStyleId}
            designSystemId={designSystemId}
            handleSelectDesignSystem={handleSelectDesignSystem}
            size={size}
            setSize={setSize}
            candidates={candidates}
            setCandidates={setCandidates}
            attachments={attachments}
            attachmentError={attachmentError}
            attachmentInputRef={attachmentInputRef}
            fileInputRef={fileInputRef}
            screenshotInputRef={screenshotInputRef}
            references={references}
            submitting={submitting || references.isReading}
            configNotice={configNotice}
            openAgentSettings={openAgentSettings}
            handlePromptSubmit={handlePromptSubmit}
            mobileSearchOpen={mobileSearchOpen}
            mobileSearchRef={mobileSearchRef}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            setMobileSearchOpen={setMobileSearchOpen}
            sharedCollectionProps={sharedCollectionProps}
          />
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
