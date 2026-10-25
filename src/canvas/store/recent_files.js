/**
 * Recent Files Storage and Management for VOO Design.
 * Aligned with Figma file workspace architecture (Recents, Drafts, Starred, Trash, Duplication, Renaming).
 */

import { deleteDraft } from "./draft_store.js";

const RECENT_FILES_KEY = "voo_design_recent_files";
const MAX_RECENT_FILES = 50;

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function readRawList() {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_FILES_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn("[VOO] Failed to read recent files from storage:", err);
    return [];
  }
}

function writeRawList(list) {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(RECENT_FILES_KEY, JSON.stringify(list.slice(0, MAX_RECENT_FILES)));
  } catch (err) {
    console.warn("[VOO] Failed to write recent files to storage:", err);
  }
}

/** Removes the local draft copy of every pathless entry that leaves the list for good. */
function dropDraftCopies(removed) {
  for (const item of removed) {
    if (!item.path && item.id) void deleteDraft(item.id);
  }
}

/**
 * Returns recent files. By default returns active (non-trashed) files.
 */
export function getRecentFiles(options = {}) {
  const {
    includeTrashed = false,
    starredOnly = false,
    draftsOnly = false,
    trashOnly = false,
    category = null,
    search = "",
    sortBy = "updatedAt",
    sortOrder = "desc",
  } = typeof options === "object" && options !== null ? options : {};

  const list = readRawList();

  let filtered = list.filter((item) => {
    const isTrashed = Boolean(item.trashed);
    if (trashOnly) return isTrashed;
    if (!includeTrashed && isTrashed) return false;
    if (starredOnly && !item.starred) return false;
    if (draftsOnly && !item.isDraft && item.path) return false;
    if (category && category !== "all" && item.category && item.category !== category) return false;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      const matchName = item.name?.toLowerCase().includes(q);
      const matchCategory = item.category?.toLowerCase().includes(q);
      if (!matchName && !matchCategory) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];
    if (sortBy === "name") {
      valA = (a.name || "").toLowerCase();
      valB = (b.name || "").toLowerCase();
      return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    valA = valA || 0;
    valB = valB || 0;
    return sortOrder === "asc" ? valA - valB : valB - valA;
  });

  return filtered;
}

export function getDrafts(options = {}) {
  return getRecentFiles({ ...options, draftsOnly: true, trashOnly: false });
}

export function getStarredFiles(options = {}) {
  return getRecentFiles({ ...options, starredOnly: true, trashOnly: false });
}

export function getTrashFiles(options = {}) {
  return getRecentFiles({ ...options, trashOnly: true });
}

export function addRecentFile({
  name,
  path = null,
  preview = null,
  size = null,
  category = "web",
  isDraft = false,
  type = "design",
  starred = false,
}) {
  if (!name && !path) return;
  const storage = getStorage();
  if (!storage) return;

  try {
    const current = readRawList();
    const id = path || `voo_doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // Remove existing entry with same path or name
    const filtered = current.filter((item) => (item.path ? item.path !== path : item.name !== name));

    const existing = current.find((item) => (item.path ? item.path === path : item.name === name));

    const newEntry = {
      id: existing?.id || id,
      name: name || (path ? path.split(/[/\\]/).pop() : "Untitled.voo"),
      path,
      updatedAt: Date.now(),
      createdAt: existing?.createdAt || Date.now(),
      preview: preview && preview.startsWith("data:image/") ? preview : (existing?.preview || null),
      size: size || existing?.size || null,
      starred: existing ? Boolean(existing.starred) : Boolean(starred),
      trashed: false,
      trashedAt: null,
      category: category || existing?.category || "web",
      isDraft: isDraft ?? existing?.isDraft ?? !path,
      type: type || existing?.type || "design",
    };

    const updated = [newEntry, ...filtered].slice(0, MAX_RECENT_FILES);
    writeRawList(updated);
    return newEntry;
  } catch (err) {
    console.warn("[VOO] Failed to add recent file:", err);
    return null;
  }
}

export function toggleStarFile(idOrPath) {
  const current = readRawList();
  let updatedItem = null;
  const updated = current.map((item) => {
    if (item.id === idOrPath || item.path === idOrPath || item.name === idOrPath) {
      updatedItem = { ...item, starred: !item.starred };
      return updatedItem;
    }
    return item;
  });
  writeRawList(updated);
  return updatedItem;
}

export function renameRecentFile(idOrPath, newName) {
  if (!newName || !newName.trim()) return null;
  const cleanName = newName.trim();
  const formattedName = cleanName.endsWith(".voo") ? cleanName : `${cleanName}.voo`;
  const current = readRawList();
  let updatedItem = null;
  const updated = current.map((item) => {
    if (item.id === idOrPath || item.path === idOrPath || item.name === idOrPath) {
      updatedItem = { ...item, name: formattedName, updatedAt: Date.now() };
      return updatedItem;
    }
    return item;
  });
  writeRawList(updated);
  return updatedItem;
}

/** Updates the cached workspace summary after its backing driver confirms a mutation. */
export function syncRecentFile(idOrPath, patch) {
  const current = readRawList();
  let updatedItem = null;
  const updated = current.map((item) => {
    if (item.id !== idOrPath && item.path !== idOrPath && item.name !== idOrPath) return item;
    updatedItem = { ...item, ...patch, updatedAt: Date.now() };
    return updatedItem;
  });
  writeRawList(updated);
  return updatedItem;
}

export function duplicateRecentFile(idOrPath) {
  const current = readRawList();
  const source = current.find((item) => item.id === idOrPath || item.path === idOrPath || item.name === idOrPath);
  if (!source) return null;

  const baseName = (source.name || "Untitled.voo").replace(/\.voo$/i, "");
  const copyName = `${baseName} (Copy).voo`;
  const copyId = `voo_doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const duplicate = {
    ...source,
    id: copyId,
    name: copyName,
    path: null, // Duplicated file begins as an unsaved local draft until saved
    isDraft: true,
    starred: false,
    trashed: false,
    trashedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const updated = [duplicate, ...current].slice(0, MAX_RECENT_FILES);
  writeRawList(updated);
  return duplicate;
}

export function moveToTrash(idOrPath) {
  const current = readRawList();
  const updated = current.map((item) => {
    if (item.id === idOrPath || item.path === idOrPath || item.name === idOrPath) {
      return { ...item, trashed: true, trashedAt: Date.now() };
    }
    return item;
  });
  writeRawList(updated);
  return getRecentFiles();
}

export function restoreFromTrash(idOrPath) {
  const current = readRawList();
  const updated = current.map((item) => {
    if (item.id === idOrPath || item.path === idOrPath || item.name === idOrPath) {
      return { ...item, trashed: false, trashedAt: null, updatedAt: Date.now() };
    }
    return item;
  });
  writeRawList(updated);
  return getRecentFiles();
}

export function deletePermanently(idOrPath) {
  const current = readRawList();
  const updated = current.filter((item) => item.id !== idOrPath && item.path !== idOrPath && item.name !== idOrPath);
  dropDraftCopies(current.filter((item) => !updated.includes(item)));
  writeRawList(updated);
  return getRecentFiles();
}

export function emptyTrash() {
  const current = readRawList();
  const updated = current.filter((item) => !item.trashed);
  dropDraftCopies(current.filter((item) => item.trashed));
  writeRawList(updated);
  return [];
}

/**
 * Remove a specific recent file (backwards-compatible).
 */
export function removeRecentFile(idOrPath) {
  return deletePermanently(idOrPath);
}

export function clearRecentFiles() {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(RECENT_FILES_KEY);
  } catch (err) {
    console.warn("[VOO] Failed to clear recent files:", err);
  }
}
