/**
 * Standalone local persistence adapter for VOO Design.
 * Uses browser IndexedDB with an in-memory fallback for testing environments.
 */

import { dataUrlToBlob } from "../shared/db_wire.js";
export { dataUrlToBlob };

const DB_NAME = "voo_design_db";
const DB_VERSION = 1;
const STORE_ASSETS = "assets";
const STORE_DOCUMENTS = "documents";

let dbPromise = null;
const memoryStore = new Map();

function openDatabase() {
  if (dbPromise) return dbPromise;

  if (typeof indexedDB === "undefined") {
    // In-memory fallback
    return Promise.resolve(null);
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        db.createObjectStore(STORE_DOCUMENTS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("Failed to open IndexedDB, falling back to in-memory store:", request.error);
      resolve(null);
    };
  });

  return dbPromise;
}

export async function putImage(id, source) {
  const db = await openDatabase();
  const blob = typeof source === "string" && source.startsWith("data:")
    ? dataUrlToBlob(source)
    : source;

  if (!db) {
    memoryStore.set(`asset:${id}`, blob);
    return true;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ASSETS, "readwrite");
    const store = tx.objectStore(STORE_ASSETS);
    store.put({ id, blob, updatedAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function putImages(entries) {
  await Promise.all(entries.map(([id, source]) => putImage(id, source)));
  return true;
}

export async function getImageBlob(id) {
  const db = await openDatabase();
  if (!db) {
    return memoryStore.get(`asset:${id}`) || null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_ASSETS, "readonly");
    const store = tx.objectStore(STORE_ASSETS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ? req.result.blob : null);
    req.onerror = () => resolve(null);
  });
}

export async function getImageBlobMap(ids) {
  const map = new Map();
  if (!ids || !ids.length) return map;

  const results = await Promise.all(
    ids.map(async (id) => {
      const blob = await getImageBlob(id);
      return [id, blob];
    })
  );

  for (const [id, blob] of results) {
    if (blob) map.set(id, blob);
  }
  return map;
}

export async function getImageDataUrl(id) {
  const blob = await getImageBlob(id);
  if (!blob) return null;
  if (typeof blob === "string") return blob;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function getImageDataUrls(ids) {
  const map = new Map();
  if (!ids || !ids.length) return map;

  await Promise.all(
    ids.map(async (id) => {
      const url = await getImageDataUrl(id);
      if (url) map.set(id, url);
    })
  );
  return map;
}

export async function deleteImage(id) {
  const db = await openDatabase();
  if (!db) {
    memoryStore.delete(`asset:${id}`);
    return true;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_ASSETS, "readwrite");
    const store = tx.objectStore(STORE_ASSETS);
    store.delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export async function deleteImages(ids) {
  await Promise.all((ids || []).map((id) => deleteImage(id)));
  return true;
}

export async function saveDocument(doc) {
  const db = await openDatabase();
  if (!db) {
    memoryStore.set(`doc:${doc.id}`, doc);
    return true;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DOCUMENTS, "readwrite");
    const store = tx.objectStore(STORE_DOCUMENTS);
    store.put({ id: doc.id || "default", doc, updatedAt: Date.now() });
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDocument(id = "default") {
  const db = await openDatabase();
  if (!db) {
    return memoryStore.get(`doc:${id}`) || null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_DOCUMENTS, "readonly");
    const store = tx.objectStore(STORE_DOCUMENTS);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ? req.result.doc : null);
    req.onerror = () => resolve(null);
  });
}
