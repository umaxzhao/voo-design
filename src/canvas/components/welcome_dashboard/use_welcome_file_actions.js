import { useState } from "react";
import { useDesignStore } from "../../../store/design_store.js";
import {
  renameRecentFile,
  addRecentFile,
  moveToTrash,
  restoreFromTrash,
  deletePermanently,
  emptyTrash,
  syncRecentFile,
} from "../../store/recent_files.js";
import { folderOfFile, setFileFolder } from "../../store/file_folders.js";
import { workspaceStorage } from "../../../services/workspace_storage.js";

/** File item mutation state and handlers: star, folder move, rename, duplicate, trash. */
export function useWelcomeFileActions({ reloadFiles, setActiveMenuId }) {
  const [renameItem, setRenameItem] = useState(null);
  const [renameInput, setRenameInput] = useState("");
  const [confirmEmptyTrashOpen, setConfirmEmptyTrashOpen] = useState(false);

  const handleToggleStar = async (e, id) => {
    e?.stopPropagation?.();
    try {
      const result = await workspaceStorage.toggleStar(id);
      if (!result?.ok) return;
      syncRecentFile(id, { starred: Boolean(result.starred) });
    } catch (err) {
      console.warn("[VOO] workspaceStorage.toggleStar error:", err);
      return;
    }
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleMoveToFolder = async (e, id, folderName) => {
    e?.stopPropagation?.();
    try {
      const res = await workspaceStorage.moveToFolder(id, folderName || null);
      if (!res?.ok) {
        console.warn("[VOO] moveToFolder failed:", res?.error);
        return;
      }
      const movedFile = res.file;
      setFileFolder(id, null);
      setFileFolder(movedFile?.id || id, folderName || null);
      syncRecentFile(id, {
        ...(movedFile?.id ? { id: movedFile.id, path: movedFile.path || null } : {}),
        folder: folderName || null,
      });
    } catch (err) {
      console.warn("[VOO] workspaceStorage.moveToFolder error:", err);
      return;
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
      const previousFolder = folderOfFile(renameItem.id) || renameItem.folder || null;
      try {
        const res = await workspaceStorage.renameFile(renameItem.id, formattedName);
        if (!res?.ok) throw new Error(res?.error || "rename-failed");
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
        renameRecentFile(renameItem.id, formattedName);
        const renamed = res?.file;
        const nextId = renamed?.id || res?.newPath || renameItem.id;
        if (nextId !== renameItem.id) {
          setFileFolder(renameItem.id, null);
          setFileFolder(nextId, previousFolder);
        }
        syncRecentFile(formattedName, {
          id: nextId,
          path: renamed?.path || res?.newPath || null,
          folder: previousFolder,
        });
      } catch (err) {
        console.warn("[VOO] workspaceStorage.renameFile error:", err);
        return;
      }
      await reloadFiles();
    }
    setRenameItem(null);
    setRenameInput("");
  };

  const handleDuplicate = async (e, id) => {
    e.stopPropagation();
    try {
      const source = (await workspaceStorage.scanFiles({ includeTrashed: true }))
        .find((file) => file.id === id || file.path === id);
      if (!source) return;
      const bytes = await workspaceStorage.readFileBytes(source.id);
      const baseName = (source.name || "Untitled.voo").replace(/\.voo$/i, "");
      let copyName = `${baseName} (Copy).voo`;
      const names = new Set((await workspaceStorage.scanFiles({ includeTrashed: true })).map((file) => file.name));
      for (let suffix = 2; names.has(copyName); suffix += 1) copyName = `${baseName} (Copy ${suffix}).voo`;
      const copied = await workspaceStorage.writeFileBytes(copyName, bytes, {
        category: source.category,
        preview: source.preview,
      });
      if (!copied?.ok) return;
      addRecentFile({
        name: copied.name || copyName,
        path: copied.path || null,
        category: copied.category || source.category,
        preview: copied.preview || source.preview || null,
        size: copied.size || bytes.byteLength,
        isDraft: false,
      });
      syncRecentFile(copied.name || copyName, {
        id: copied.id || copyName,
        name: copied.name || copyName,
        path: copied.path || null,
        size: copied.size || bytes.byteLength,
        category: copied.category || source.category,
        preview: copied.preview || source.preview || null,
        isDraft: false,
      });
      await reloadFiles();
    } catch (err) {
      console.warn("[VOO] workspace file duplication failed:", err);
    }
    setActiveMenuId(null);
  };

  const handleMoveToTrash = async (e, id) => {
    e?.stopPropagation?.();
    try {
      const result = await workspaceStorage.moveToTrash(id);
      if (!result?.ok) return;
      moveToTrash(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.moveToTrash error:", err);
      return;
    }
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleRestore = async (e, id) => {
    e?.stopPropagation?.();
    try {
      const result = await workspaceStorage.restoreFromTrash(id);
      if (!result?.ok) return;
      restoreFromTrash(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.restoreFromTrash error:", err);
      return;
    }
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleDeletePermanently = async (e, id) => {
    e?.stopPropagation?.();
    try {
      const result = await workspaceStorage.deletePermanently(id);
      if (!result?.ok) return;
      deletePermanently(id);
    } catch (err) {
      console.warn("[VOO] workspaceStorage.deletePermanently error:", err);
      return;
    }
    await reloadFiles();
    setActiveMenuId(null);
  };

  const handleEmptyTrash = async () => {
    try {
      const result = await workspaceStorage.emptyTrash();
      if (!result?.ok) return;
      emptyTrash();
    } catch (err) {
      console.warn("[VOO] workspaceStorage.emptyTrash error:", err);
      return;
    }
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
