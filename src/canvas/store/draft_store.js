/**
 * Local copies of unsaved documents ("drafts").
 *
 * A draft is a .voo payload kept in IndexedDB under the id of its recent-files
 * entry, so an unsaved document can be reopened from the Recents list. It is
 * NOT a workspace file: writing the real .voo file stays a manual Save.
 *
 * Every function swallows storage failures after a console warning and reports
 * them through its return value (null / false), so the UI is never interrupted.
 */

const DB_NAME = "voo-unsaved-drafts";
const STORE = "drafts";
const DB_VERSION = 1;

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
          req.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        console.warn("[VOO] Could not open the draft store:", req.error);
        dbPromise = null;
        resolve(null);
      };
    } catch (err) {
      console.warn("[VOO] Could not open the draft store:", err);
      dbPromise = null;
      resolve(null);
    }
  });
  return dbPromise;
}

/** Runs one request inside a transaction and resolves with its result. */
function run(db, mode, makeRequest) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = makeRequest(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Stores the encoded .voo bytes of a draft. Returns true when written. */
export async function saveDraftBytes(id, bytes, name) {
  if (!id || !bytes) return false;
  try {
    const db = await openDb();
    if (!db) return false;
    await run(db, "readwrite", (store) =>
      store.put({ id: String(id), bytes, name: name || "", savedAt: Date.now() }),
    );
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new CustomEvent("voo:draft-updated", {
        detail: { id: String(id), name },
      }));
    }
    return true;
  } catch (err) {
    console.warn("[VOO] Failed to save draft copy:", err);
    return false;
  }
}

/** Returns { bytes, name } for a draft, or null when it is missing or unreadable. */
export async function loadDraftBytes(id) {
  if (!id) return null;
  try {
    const db = await openDb();
    if (!db) return null;
    const row = await run(db, "readonly", (store) => store.get(String(id)));
    if (!row?.bytes) return null;
    return { bytes: row.bytes, name: row.name || "", savedAt: row.savedAt };
  } catch (err) {
    console.warn("[VOO] Failed to load draft copy:", err);
    return null;
  }
}

/** Removes a draft copy. Returns true when the delete went through. */
export async function deleteDraft(id) {
  if (!id) return false;
  try {
    const db = await openDb();
    if (!db) return false;
    await run(db, "readwrite", (store) => store.delete(String(id)));
    return true;
  } catch (err) {
    console.warn("[VOO] Failed to delete draft copy:", err);
    return false;
  }
}
