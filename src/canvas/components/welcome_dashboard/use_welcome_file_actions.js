import { useState } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import {
  toggleStarFile,
  renameRecentFile,
  duplicateRecentFile,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
  emptyTrash,
} from "../../store/recent_files.js";
import { workspaceStorage } from "../../../services/workspace_storage.js";

/** File item mutation state and handlers: star, folder move, rename, duplicate, trash. */
export function useWelcomeFileActions({ reloadFiles, setActiveMenuId }) {
  const [renameItem, setRenameItem] = useState(null);
  const [renameInput, setRenameInput] = useState("");
  const [confirmEmptyTrashOpen, setConfirmEmptyTrashOpen] = useState(false);

  const handleToggleStar = async (e, id) => {
    e?.stopPropagation?.();
    try {
      await workspaceStorage.toggleStar(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.toggleStar error:", err);
    }
    toggleStarFile(id);
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleMoveToFolder = async (e, id, folderName) => {
    e?.stopPropagation?.();
    try {
      const res = await workspaceStorage.moveToFolder(id, folderName || null);
      if (!res?.ok) {
        console.warn("[VOO] moveToFolder failed:", res?.error);
      }
    } catch (err) {
      console.warn("[VOO] workspaceStorage.moveToFolder error:", err);
    }
    await reloadFiles();
  };

  const handleStartRename = (e, item) => {
    e.stopPropagation();
    setRenameItem(item);
    setRenameInput((item.name || "").replace(/\.voo$/i, ""));
    setActiveMenuId(null);
  };

  const handleConfirmRename = async () => {
    if (renameItem && renameInput.trim()) {
      const cleanName = renameInput.trim();
      const formattedName = cleanName.endsWith(".voo") ? cleanName : `${cleanName}.voo`;
      try {
        const res = await workspaceStorage.renameFile(renameItem.id, formattedName);
        const currentStore = useDesignStore.getState();
        // If currently open in canvas, update canvas filePath and fileName in designStore
        if (
          renameItem.path &&
          currentStore.filePath &&
          currentStore.filePath === renameItem.path
        ) {
          const newPath =
            res?.file?.path ||
            res?.newPath ||
            (renameItem.path.includes("/")
              ? renameItem.path.replace(/[^/]+$/, formattedName)
              : renameItem.path.replace(/[^\\]+$/, formattedName));
          currentStore.setFilePath?.(newPath);
          currentStore.setFileName?.(formattedName);
        } else if (
          (!renameItem.path || !currentStore.filePath) &&
          currentStore.fileName === renameItem.name
        ) {
          currentStore.setFileName?.(formattedName);
        }
      } catch (err) {
        console.warn("[VOO] workspaceStorage.renameFile error:", err);
      }
      renameRecentFile(renameItem.id, formattedName);
      await reloadFiles();
    }
    setRenameItem(null);
    setRenameInput("");
  };

  const handleDuplicate = (e, id) => {
    e.stopPropagation();
    duplicateRecentFile(id);
    reloadFiles();
    setActiveMenuId(null);
  };

  const handleMoveToTrash = async (e, id) => {
    e?.stopPropagation?.();
    try {
      await workspaceStorage.moveToTrash(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.moveToTrash error:", err);
    }
    moveToTrash(id);
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleRestore = async (e, id) => {
    e?.stopPropagation?.();
    try {
      await workspaceStorage.restoreFromTrash(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.restoreFromTrash error:", err);
    }
    restoreFromTrash(id);
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleDeletePermanently = async (e, id) => {
    e?.stopPropagation?.();
    try {
      await workspaceStorage.deletePermanently(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.deletePermanently error:", err);
    }
    deletePermanently(id);
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleEmptyTrash = async () => {
    try {
      await workspaceStorage.emptyTrash();
    } catch (err) {
      console.warn("[VOO] workspaceStorage.emptyTrash error:", err);
    }
    emptyTrash();
    setConfirmEmptyTrashOpen(false);
    await reloadFiles();
  };

  return {
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
  };
}
