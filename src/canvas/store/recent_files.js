/**
 * Recent Files Storage and Management for VOO Design.
 * Stores and manages recently opened/saved .voo project records.
 */

const RECENT_FILES_KEY = "voo_design_recent_files";
const MAX_RECENT_FILES = 30;

function getStorage() {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export function getRecentFiles() {
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

export function addRecentFile({ name, path = null, preview = null, size = null }) {
  if (!name && !path) return;
  const storage = getStorage();
  if (!storage) return;

  try {
    const current = getRecentFiles();
    const id = path || name;
    // Remove existing entry with same path or name
    const filtered = current.filter((item) => (item.path ? item.path !== path : item.name !== name));

    const newEntry = {
      id,
      name: name || (path ? path.split(/[/\\]/).pop() : "Untitled.voo"),
      path,
      updatedAt: Date.now(),
      preview: preview && preview.startsWith("data:image/") ? preview : null,
      size,
    };

    const updated = [newEntry, ...filtered].slice(0, MAX_RECENT_FILES);
    storage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
    return newEntry;
  } catch (err) {
    console.warn("[VOO] Failed to add recent file:", err);
    return null;
  }
}

export function removeRecentFile(idOrPath) {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const current = getRecentFiles();
    const updated = current.filter((item) => item.id !== idOrPath && item.path !== idOrPath && item.name !== idOrPath);
    storage.setItem(RECENT_FILES_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("[VOO] Failed to remove recent file:", err);
    return [];
  }
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
