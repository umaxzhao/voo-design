/**
 * Storage for document version history (named snapshots and autosave checkpoints).
 * Uses IndexedDB in the browser/Electron, falling back to an in-memory Map in tests/Node.
 */

const DB_NAME = "voo-version-history";
const STORE = "document_versions";
const DB_VERSION = 1;
const MAX_AUTO_VERSIONS_PER_DOC = 20;

/** In-memory fallback when indexedDB is absent (e.g. Node test environment) */
const memoryStore = new Map();

/** @type {Promise<IDBDatabase | null> | null} */
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          const store = req.result.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("by_document", "documentId", { unique: false });
          store.createIndex("by_created", "createdAt", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("[VOO] Could not open version store:", req.error);
        dbPromise = null;
        resolve(null);
      };
    } catch (err) {
      console.warn("[VOO] Could not open version store:", err);
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
}

function run(db, mode, makeRequest) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = makeRequest(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

let counter = 0;

/**
 * Creates and stores a version snapshot.
 */
export async function createVersionRecord({
  documentId,
  name,
  vooFile,
  preview = null,
  layerCount = 0,
  autoSave = false,
}) {
  if (!documentId || !vooFile) return null;
  counter += 1;
  const createdAt = Date.now() + counter;
  const id = `ver-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    documentId: String(documentId),
    name: name?.trim() || (autoSave ? "Autosave" : "Untitled version"),
    createdAt,
    vooFile,
    preview: preview || null,
    layerCount: Number(layerCount) || 0,
    autoSave: Boolean(autoSave),
  };

  try {
    const db = await openDb();
    if (db) {
      await run(db, "readwrite", (store) => store.put(record));
      if (autoSave) {
        await pruneAutoVersions(documentId, MAX_AUTO_VERSIONS_PER_DOC);
      }
    } else {
      memoryStore.set(id, record);
    }

    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("voo:version-created", { detail: { id, documentId } }),
      );
    }
    return record;
  } catch (err) {
    console.warn("[VOO] Failed to save version:", err);
    return null;
  }
}

/**
 * Lists all versions for a given documentId, sorted newest first.
 */
export async function listVersions(documentId) {
  if (!documentId) return [];
  try {
    const db = await openDb();
    if (db) {
      const rows = await run(db, "readonly", (store) => {
        const idx = store.index("by_document");
        return idx.getAll(String(documentId));
      });
      return (rows || []).sort((a, b) => b.createdAt - a.createdAt);
    }
    const memRows = [...memoryStore.values()].filter(
      (v) => v.documentId === String(documentId),
    );
    return memRows.sort((a, b) => b.createdAt - a.createdAt);
  } catch (err) {
    console.warn("[VOO] Failed to list versions:", err);
    return [];
  }
}

/**
 * Loads a single version record by its ID.
 */
export async function loadVersion(id) {
  if (!id) return null;
  try {
    const db = await openDb();
    if (db) {
      return await run(db, "readonly", (store) => store.get(String(id)));
    }
    return memoryStore.get(String(id)) || null;
  } catch (err) {
    console.warn("[VOO] Failed to load version:", err);
    return null;
  }
}

/**
 * Deletes a version record by its ID.
 */
export async function deleteVersion(id) {
  if (!id) return false;
  try {
    const db = await openDb();
    if (db) {
      await run(db, "readwrite", (store) => store.delete(String(id)));
    } else {
      memoryStore.delete(String(id));
    }
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(
        new CustomEvent("voo:version-deleted", { detail: { id } }),
      );
    }
    return true;
  } catch (err) {
    console.warn("[VOO] Failed to delete version:", err);
    return false;
  }
}

/**
 * Prunes older autosave versions if they exceed the limit.
 */
async function pruneAutoVersions(documentId, keepCount = MAX_AUTO_VERSIONS_PER_DOC) {
  try {
    const all = await listVersions(documentId);
    const autos = all.filter((v) => v.autoSave);
    if (autos.length > keepCount) {
      const db = await openDb();
      if (!db) return;
      const toDelete = autos.slice(keepCount);
      for (const item of toDelete) {
        await run(db, "readwrite", (store) => store.delete(item.id));
      }
    }
  } catch (e) {
    console.warn("[VOO] Failed to prune autosave versions:", e);
  }
}
