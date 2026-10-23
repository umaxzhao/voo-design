/**
 * Local crash-recovery drafts for open documents.
 *
 * Stores a compact JSON snapshot under IndexedDB (preferred) or localStorage
 * so a reload after an unexpected exit can offer restore. Never stores image
 * bytes — callers should pass structure-only document JSON.
 */

const DB_NAME = "voo-crash-recovery";
const STORE = "drafts";
const DB_VERSION = 1;
const LS_PREFIX = "voo.crashDraft.";
const MAX_DRAFT_CHARS = 2_000_000;

/** @type {Map<string, object>} */
const memoryDrafts = new Map();

/** @type {IDBDatabase | null} */
let dbPromise = null;

function openDb() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function serialize(payload) {
  const text = JSON.stringify(payload);
  if (text.length > MAX_DRAFT_CHARS) {
    throw new Error("Crash draft exceeds size budget");
  }
  return text;
}

/**
 * @param {string} documentId
 * @param {object} document
 * @param {{ savedAt?: number, label?: string }} [meta]
 */
export async function saveCrashDraft(documentId, document, meta = {}) {
  if (!documentId || !document) return false;
  const entry = {
    id: String(documentId),
    savedAt: meta.savedAt ?? Date.now(),
    label: meta.label ?? "",
    document,
  };
  try {
    const text = serialize(entry);
    const db = await openDb();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(entry);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LS_PREFIX + entry.id, text);
      return true;
    }
  } catch {
    /* fall through to memory */
  }
  memoryDrafts.set(entry.id, entry);
  return true;
}

/** @param {string} documentId */
export async function loadCrashDraft(documentId) {
  if (!documentId) return null;
  const id = String(documentId);
  try {
    const db = await openDb();
    if (db) {
      const row = await new Promise((resolve) => {
        const tx = db.transaction(STORE, "readonly");
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      });
      if (row?.document) return row;
    }
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(LS_PREFIX + id);
      if (!raw) return null;
      return JSON.parse(raw);
    }
  } catch {
    /* fall through */
  }
  return memoryDrafts.get(id) ?? null;
}

/** @param {string} documentId */
export async function clearCrashDraft(documentId) {
  if (!documentId) return;
  const id = String(documentId);
  try {
    const db = await openDb();
    if (db) {
      await new Promise((resolve) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(LS_PREFIX + id);
    }
    memoryDrafts.delete(id);
  } catch {
    memoryDrafts.delete(id);
  }
}

/**
 * True when a draft exists and is newer than `baselineMs` (last known save).
 * @param {string} documentId
 * @param {number} [baselineMs]
 */
export async function hasNewerCrashDraft(documentId, baselineMs = 0) {
  const draft = await loadCrashDraft(documentId);
  if (!draft?.document) return false;
  return Number(draft.savedAt || 0) > Number(baselineMs || 0);
}
