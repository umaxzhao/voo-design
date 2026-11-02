import { useState, useEffect, useCallback } from "react";
import {
  getRecentFiles,
  getDrafts,
  getStarredFiles,
  getTrashFiles,
} from "../../store/recent_files.js";
import { migrateLegacyFolderMembership } from "../../store/file_folders.js";
import { collectDraftFiles } from "./welcome_draft_files.js";
import {
  workspaceStorage,
  ElectronWorkspaceDriver,
} from "../../../services/workspace_storage.js";
import { getSetting } from "../../../shared/settings.js";
import { resolveSortOptions, sortFileList } from "./welcome_helpers.js";

/** Loads the file collection for the active tab and keeps it in sync with workspace changes. */
export function useWelcomeFiles({ activeTab, searchQuery, sortBy, activeFolder }) {
  // File collection for current tab
  const [fileList, setFileList] = useState([]);

  // Active workspace state
  const [, setWorkspaceConfig] = useState(() => {
    const isElectron = ElectronWorkspaceDriver.isAvailable();
    const path = getSetting("voo.workspace.path");
    const type = getSetting("voo.workspace.type");
    return {
      path: path || (isElectron ? "~/Documents/VOO/Projects" : "Virtual Workspace"),
      type: type || (isElectron ? "electron" : "web-idb"),
      name: getSetting("voo.workspace.name") || "VOO Projects",
    };
  });

  // Fetch files based on current tab, search, category, sort from workspaceStorage
  const reloadFiles = useCallback(async () => {
    const { sortField, sortOrder } = resolveSortOptions(sortBy);

    const options = {
      search: searchQuery,
      sortBy: sortField,
      sortOrder,
    };

    try {
      let files = [];
      if (activeTab === "recents") {
        const workspaceFiles = await workspaceStorage.scanFiles(options);
        const localRecents = getRecentFiles(options);
        const seen = new Set();
        files = [];
        for (const f of workspaceFiles) {
          const key = f.path || f.id || f.name;
          seen.add(key);
          seen.add(f.name);
          files.push(f);
        }
        for (const r of localRecents) {
          const key = r.path || r.id || r.name;
          if (!seen.has(key) && !seen.has(r.name)) {
            seen.add(key);
            seen.add(r.name);
            files.push(r);
          }
        }
      } else if (activeTab === "starred") {
        const workspaceStarred = await workspaceStorage.scanFiles({ ...options, starredOnly: true });
        const localStarred = getStarredFiles(options);
        const seen = new Set();
        files = [];
        for (const f of workspaceStarred) {
          const key = f.path || f.id || f.name;
          seen.add(key);
          seen.add(f.name);
          files.push(f);
        }
        for (const r of localStarred) {
          const key = r.path || r.id || r.name;
          if (!seen.has(key) && !seen.has(r.name)) {
            seen.add(key);
            seen.add(r.name);
            files.push(r);
          }
        }
      } else if (activeTab === "trash") {
        files = await workspaceStorage.scanFiles({ ...options, trashOnly: true });
        const seen = new Set(files.flatMap((file) => [file.id, file.path].filter(Boolean)));
        files.push(...getTrashFiles(options).filter((file) => !seen.has(file.id) && !seen.has(file.path)));
      } else if (activeTab === "drafts") {
        const all = await workspaceStorage.scanFiles(options);
        files = collectDraftFiles(all, getDrafts(options));
      }

      // A project folder shows only the files that live in that subdirectory.
      if (activeFolder) {
        files = (files || []).filter((file) => file.folder === activeFolder);
      } else if (activeTab === "recents" || activeTab === "starred" || activeTab === "drafts") {
        // Root tabs hide files that already belong to a project folder.
        files = (files || []).filter((file) => !file.folder);
      }

      // Sort merged list
      if (files && files.length > 0) {
        sortFileList(files, sortField, sortOrder);
      }

      setFileList(files || []);
    } catch (err) {
      console.warn("[VOO] reloadFiles failed with workspaceStorage, falling back to recent_files:", err);
      if (activeTab === "recents") {
        setFileList(getRecentFiles(options));
      } else if (activeTab === "drafts") {
        setFileList(getDrafts(options));
      } else if (activeTab === "starred") {
        setFileList(getStarredFiles(options));
      } else if (activeTab === "trash") {
        setFileList(getTrashFiles(options));
      }
    }
  }, [activeTab, searchQuery, sortBy, activeFolder]);

  // Initial load and subscriptions to workspace changes
  useEffect(() => {
    let mounted = true;
    const fetchConfig = async () => {
      try {
        const cfg = await workspaceStorage.getConfig();
        if (mounted && cfg) {
          setWorkspaceConfig((prev) => ({
            ...prev,
            path: cfg.path || prev.path,
            type: cfg.type || prev.type,
          }));
        }
      } catch (err) {
        console.warn("[VOO] Failed to fetch workspace config:", err);
      }
    };

    fetchConfig();
    (async () => {
      try {
        await migrateLegacyFolderMembership(workspaceStorage);
      } catch (err) {
        console.warn("[VOO] legacy folder migrate failed:", err);
      }
      if (mounted) reloadFiles();
    })();

    // Subscribe to workspaceStorage events
    const unsubStorage = workspaceStorage.subscribe(() => {
      reloadFiles();
    });

    // Subscribe to window event "voo:workspace-changed"
    const handleWorkspaceChanged = (e) => {
      if (e?.detail) {
        setWorkspaceConfig((prev) => ({
          ...prev,
          ...e.detail,
        }));
      } else {
        fetchConfig();
      }
      reloadFiles();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("voo:workspace-changed", handleWorkspaceChanged);
    }

    return () => {
      mounted = false;
      if (typeof unsubStorage === "function") unsubStorage();
      if (typeof window !== "undefined") {
        window.removeEventListener("voo:workspace-changed", handleWorkspaceChanged);
      }
    };
  }, [reloadFiles]);

  return { fileList, reloadFiles };
}
