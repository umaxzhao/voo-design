import { useState, useEffect, useCallback } from "react";
import { forgetDeletedFolderRecents } from "./welcome-trash-actions.js";
import { workspaceStorage } from "../../../services/workspace_storage.js";

/** Project folder list plus the inline "new folder" form state and submit handler. */
export function useWelcomeFolders({ t, activeFolder, setActiveFolder }) {
  const [folders, setFolders] = useState([]);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");

  const loadFolders = useCallback(async () => {
    try {
      setFolders(await workspaceStorage.listFolders());
    } catch (err) {
      console.warn("[VOO] listFolders failed:", err);
      setFolders([]);
    }
  }, []);

  useEffect(() => {
    loadFolders();
    window.addEventListener("voo:workspace-changed", loadFolders);
    const unsubscribe = workspaceStorage.subscribe(loadFolders);
    return () => {
      window.removeEventListener("voo:workspace-changed", loadFolders);
      unsubscribe();
    };
  }, [loadFolders]);

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    setFolderError("");
    try {
      const res = await workspaceStorage.createFolder(name);
      if (res.ok) {
        setFolderName("");
        setCreatingFolder(false);
        await loadFolders();
        return;
      }
      const messageKeys = {
        already_exists: "welcome.folders.exists",
        invalid_name: "welcome.folders.invalid",
      };
      setFolderError(t(messageKeys[res.error] || "welcome.folders.failed"));
    } catch (error) {
      console.error("[VOO] createFolder failed:", error);
      setFolderError(t("welcome.folders.failed"));
    }
  };

  const handleDeleteFolder = async (e, folder) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(t("welcome.folders.deleteConfirm", { name: folder.name }))
    )
      return;
    try {
      const result = await workspaceStorage.deleteFolder(folder.name);
      if (result.ok) {
        forgetDeletedFolderRecents(result.originalPath);
        if (activeFolder === folder.name) setActiveFolder(null);
        await loadFolders();
        return;
      }
      throw new Error(result.error || "operation_failed");
    } catch (error) {
      console.error("[VOO] deleteFolder failed:", error);
      window.alert(
        t("welcome.files.actionFailed", {
          reason: error.message || String(error),
        }),
      );
    }
  };

  return {
    folders,
    creatingFolder,
    setCreatingFolder,
    folderName,
    setFolderName,
    folderError,
    setFolderError,
    handleCreateFolder,
    handleDeleteFolder,
  };
}
