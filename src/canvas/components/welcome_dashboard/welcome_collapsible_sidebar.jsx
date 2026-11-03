import React from "react";
import PropTypes from "prop-types";
import { WelcomeSidebar } from "./welcome_sidebar.jsx";

export function WelcomeCollapsibleSidebar({
  t,
  sidebarToggleRef,
  sidebarExpanded,
  sidebarIsNarrow,
  toggleSidebar,
  closeSidebar,
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
  return (
    <>
      {/* Compact navigation entry; desktop navigation stays visible. */}
      <button
        ref={sidebarToggleRef}
        type="button"
        data-testid="welcome-sidebar-toggle"
        aria-label={t("welcome.sidebar.toggle")}
        aria-expanded={sidebarExpanded}
        aria-controls="welcome-sidebar"
        onClick={toggleSidebar}
        className="welcome-sidebar-toggle-btn absolute left-3 top-3 z-30 hidden size-11 max-[768px]:flex items-center justify-center rounded-full border border-white/10 bg-neutral-900/90 text-neutral-300 shadow-pop backdrop-blur-md transition-colors hover:bg-neutral-800 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#a7ffd4] cursor-pointer"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <rect x="2" y="3" width="5" height="14" rx="1.5" />
          <rect x="9" y="3" width="9" height="14" rx="1.5" opacity="0.55" />
        </svg>
      </button>

      {/* Narrow Screen Overlay Backdrop */}
      {sidebarIsNarrow && sidebarExpanded && (
        <div
          data-testid="welcome-sidebar-backdrop"
          onClick={() => {
            closeSidebar();
            sidebarToggleRef.current?.focus();
          }}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        />
      )}

      {/* Sidebar with Desktop Collapse and Mobile Drawer Portal */}
      <div
        className={`${
          sidebarIsNarrow
            ? sidebarExpanded
              ? "fixed inset-y-0 left-0 z-50 flex w-72 flex-col shadow-panel"
              : "hidden"
            : sidebarExpanded
              ? "flex shrink-0"
              : "hidden"
        }`}
      >
        <WelcomeSidebar
          t={t}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            setActiveTab(tab);
            if (sidebarIsNarrow) closeSidebar();
          }}
          activeFolder={activeFolder}
          setActiveFolder={(folder) => {
            setActiveFolder(folder);
            if (sidebarIsNarrow) closeSidebar();
          }}
          folders={folders}
          creatingFolder={creatingFolder}
          setCreatingFolder={setCreatingFolder}
          folderName={folderName}
          setFolderName={setFolderName}
          folderError={folderError}
          setFolderError={setFolderError}
          handleCreateFolder={handleCreateFolder}
          handleDeleteFolder={handleDeleteFolder}
          onClose={() => {
            if (sidebarIsNarrow) {
              closeSidebar();
              sidebarToggleRef.current?.focus();
            }
          }}
        />
      </div>
    </>
  );
}

WelcomeCollapsibleSidebar.propTypes = {
  t: PropTypes.func.isRequired,
  sidebarToggleRef: PropTypes.object,
  sidebarExpanded: PropTypes.bool.isRequired,
  sidebarIsNarrow: PropTypes.bool.isRequired,
  toggleSidebar: PropTypes.func.isRequired,
  closeSidebar: PropTypes.func.isRequired,
  searchQuery: PropTypes.string.isRequired,
  setSearchQuery: PropTypes.func.isRequired,
  activeTab: PropTypes.string.isRequired,
  setActiveTab: PropTypes.func.isRequired,
  activeFolder: PropTypes.any,
  setActiveFolder: PropTypes.func.isRequired,
  folders: PropTypes.array.isRequired,
  creatingFolder: PropTypes.bool.isRequired,
  setCreatingFolder: PropTypes.func.isRequired,
  folderName: PropTypes.string.isRequired,
  setFolderName: PropTypes.func.isRequired,
  folderError: PropTypes.string,
  setFolderError: PropTypes.func.isRequired,
  handleCreateFolder: PropTypes.func.isRequired,
  handleDeleteFolder: PropTypes.func.isRequired,
};
