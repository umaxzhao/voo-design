import { useState, useEffect, useCallback } from "react";
import { workspaceStorage } from "../../../services/workspace_storage.js";

/** Project folder list plus the inline "new folder" form state and submit handler. */
export function useWelcomeFolders({ t }) {
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
      const messageKeys = { already_exists: "welcome.folders.exists", invalid_name: "welcome.folders.invalid" };
      setFolderError(t(messageKeys[res.error] || "welcome.folders.failed"));
    } catch (error) {
      console.error("[VOO] createFolder failed:", error);
      setFolderError(t("welcome.folders.failed"));
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
  };
}
