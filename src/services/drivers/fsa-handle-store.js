import { reportFsaError } from "./fsa-diagnostics.js";

const DATABASE = "voo_fsa_workspace", STORE = "handles", KEY = "active_dir_handle";

async function openHandleDatabase() {
  if (typeof indexedDB === "undefined") return null;
  return new Promise(resolve => {
    let request;
    try { request = indexedDB.open(DATABASE, 1); }
    catch (error) { reportFsaError("open-handle-store", error); resolve(null); return; }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { reportFsaError("open-handle-store", request.error); resolve(null); };
  });
}

/** A failed remembered mount does not invalidate this session's chosen directory. */
async function useHandleStore(mode, action) {
  const db = await openHandleDatabase();
  if (!db) return null;
  return new Promise(resolve => {
    let tx, finished = false;
    const finish = value => {
      if (finished) return;
      finished = true; db.close(); resolve(value);
    };
    try { tx = db.transaction(STORE, mode); }
    catch (error) { reportFsaError("access-handle-store", error); finish(null); return; }
    let value = null, requestError = null;
    try {
      const request = action(tx.objectStore(STORE));
      request.onsuccess = () => { value = mode === "readwrite" ? true : request.result || null; };
      request.onerror = () => { requestError = request.error; };
    } catch (error) { reportFsaError("access-handle-store", error); finish(null); return; }
    tx.oncomplete = () => finish(value);
    tx.onerror = tx.onabort = () => {
      if (finished) return;
      reportFsaError("access-handle-store", tx.error ?? requestError); finish(null);
    };
  });
}

export const saveFsaHandle = handle => useHandleStore("readwrite", store => store.put(handle, KEY));
export const loadFsaHandle = () => useHandleStore("readonly", store => store.get(KEY));
