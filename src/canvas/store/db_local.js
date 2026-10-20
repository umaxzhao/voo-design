/**
 * Local IndexedDB backend — the original db.js implementation, encapsulated
 * behind the backend interface so the database can also live behind a message
 * proxy (db_proxy.js) without any caller noticing.
 *
 * Three stores, deliberately separated: `workflows` holds the small graph
 * document (nodes/edges reference images by id only), `images` holds the
 * megabyte-scale picture payloads, and `assets` holds generated-picture
 * metadata for the asset library. Keeping the graph apart from the pictures
 * means autosaving on every drag does not rewrite the pictures.
 *
 * Images are stored as `Blob`, not base64 strings: structured clone keeps them
 * out of the JS heap where possible and avoids the 33% base64 size overhead.
 * Records written by older versions hold a `dataUrl` string instead — every
 * read path accepts both shapes, so no migration run is needed.
 *
 * The service worker imports this same module to serve DB_OP requests from
 * hosted pages: the worker is on the extension origin, so it opens the exact
 * same database the canvas pages do.
 */

import { blobToDataUrl, dataUrlToBlob } from "../../shared/db_wire.js";
import {
  pruneImageRecords,
  updateImageRetention as updateRetention,
  writePublicationIntent,
} from "./db-image-retention.js";

const DB_NAME = "chat-image-workflow";
const DB_VERSION = 5;
const DB_VERSION_FLOOR = 4;
const STORE_WORKFLOWS = "workflows";
const STORE_WORKFLOW_EXECUTIONS = "workflowExecutions";
const STORE_IMAGES = "images";
const STORE_ASSETS = "assets";
// Thumbnails live in their own store, never inside asset records: records
// cross the bridge as JSON, where a Blob would be lost.
const STORE_THUMBNAILS = "thumbnails";
const STORE_AGENT_SKILLS = "agentSkills";

/** Normalizes a record from either the legacy (`dataUrl`) or new (`blob`) shape. */
function recordToBlob(record) {
  if (record.blob) return record.blob;
  return dataUrlToBlob(record.dataUrl);
}

export function createLocalDbBackend() {
  let dbPromise = null;

  function openDatabase() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_WORKFLOWS)) {
          db.createObjectStore(STORE_WORKFLOWS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_WORKFLOW_EXECUTIONS)) {
          db.createObjectStore(STORE_WORKFLOW_EXECUTIONS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_IMAGES)) {
          db.createObjectStore(STORE_IMAGES, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_ASSETS)) {
          const assets = db.createObjectStore(STORE_ASSETS, { keyPath: "id" });
          // The library lists newest first and evicts least-recently-used first,
          // so both orders come from an index rather than a full-table sort.
          assets.createIndex("createdAt", "createdAt");
          assets.createIndex("lastUsedAt", "lastUsedAt");
        }
        if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
          db.createObjectStore(STORE_THUMBNAILS, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(STORE_AGENT_SKILLS)) {
          db.createObjectStore(STORE_AGENT_SKILLS, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        // The canvas can be open in a side panel and a floating window at once.
        // Without this, an older connection here would block the newer page's
        // version upgrade forever; closing lets that upgrade proceed, and this
        // page picks the new schema up on its next reload.
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        const error = request.error;
        if (error && error.name === "VersionError") {
          const message =
            `IndexedDB VersionError opening "${DB_NAME}" at version ${DB_VERSION}: ` +
            `existing database has a higher version. Downgrading IndexedDB below floor version ` +
            `${DB_VERSION_FLOOR} is forbidden to prevent data corruption. (See rollback-plan.md)`;
          const wrapped = new Error(message, { cause: error });
          wrapped.name = "VersionError";
          wrapped.code = "ERR_DB_VERSION_DOWNGRADE";
          wrapped.originalError = error;
          reject(wrapped);
          return;
        }
        reject(error);
      };
      request.onblocked = () =>
        reject(new Error("Workflow database upgrade was blocked"));
    }).catch((error) => {
      // `dbPromise` is memoised above, so a failed open must not be cached:
      // without this reset, one transient failure (a blocked upgrade while
      // another instance holds an older connection, a busy storage backend)
      // would poison every later retry — the canvas's "retry" and any new
      // document — with the identical error until a full reload.
      dbPromise = null;
      throw error;
    });

    return dbPromise;
  }

  async function runTransaction(storeName, mode, operation) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      let result;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(
          transaction.error || new Error("Database transaction was aborted"),
        );
      transaction.oncomplete = () => resolve(result);
      const request = operation(store);
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Writes a workflow document, refusing the write when the stored copy has
   * moved on since this canvas last read it.
   *
   * The read and the write share one transaction, which is what makes the check
   * atomic against the other canvases writing the same document. `expectedRev`
   * of `null` means "write regardless" and is for documents this canvas just
   * created or imported, where there is nothing to conflict with.
   *
   * @param {object} workflow - `{ id, name, nodes, edges, settings }`
   * @param {{expectedRev?: number | null}} [options]
   * @returns {Promise<{ok: boolean, rev: number, stored?: object}>} `ok: false`
   *   carries the stored document, for the caller to merge against.
   */
  async function saveWorkflow(workflow, { expectedRev = null } = {}) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_WORKFLOWS, "readwrite");
      const store = transaction.objectStore(STORE_WORKFLOWS);
      let outcome = null;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(
          transaction.error || new Error("Workflow transaction was aborted"),
        );
      transaction.oncomplete = () => resolve(outcome);

      const read = store.get(workflow.id);
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        const stored = read.result ?? null;
        const storedRev = stored?.rev ?? 0;

        if (stored && expectedRev !== null && storedRev !== expectedRev) {
          outcome = { ok: false, rev: storedRev, stored };
          return;
        }

        const rev = storedRev + 1;
        outcome = { ok: true, rev };
        // Publication owners are independent of graph snapshots: an older autosave
        // must not erase a newer pending image or another window's undo refs.
        const next = { ...workflow, rev, updatedAt: Date.now() };
        delete next.assetRetentions;
        if (stored?.assetRetentions)
          next.assetRetentions = stored.assetRetentions;
        const write = store.put(next);
        write.onerror = () => reject(write.error);
      };
    });
  }

  async function loadWorkflow(id) {
    return runTransaction(STORE_WORKFLOWS, "readonly", (store) =>
      store.get(id),
    );
  }

  /** Revision-checked durable journal write for one workflow execution. */
  async function saveWorkflowExecution(execution, { expectedRev = null } = {}) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        STORE_WORKFLOW_EXECUTIONS,
        "readwrite",
      );
      const store = transaction.objectStore(STORE_WORKFLOW_EXECUTIONS);
      let outcome = null;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(
          transaction.error ||
            new Error("Workflow execution transaction was aborted"),
        );
      transaction.oncomplete = () => resolve(outcome);

      const read = store.get(execution.id);
      read.onerror = () => reject(read.error);
      read.onsuccess = () => {
        const stored = read.result ?? null;
        const storedRev = stored?.rev ?? 0;
        if (expectedRev !== null && storedRev !== expectedRev) {
          outcome = { ok: false, rev: storedRev, stored };
          return;
        }
        const rev = storedRev + 1;
        outcome = { ok: true, rev };
        const write = store.put({ ...execution, rev, updatedAt: Date.now() });
        write.onerror = () => reject(write.error);
      };
    });
  }

  async function loadWorkflowExecution(id) {
    return runTransaction(STORE_WORKFLOW_EXECUTIONS, "readonly", (store) =>
      store.get(id),
    );
  }

  async function listWorkflowExecutions(workflowId) {
    const records = await runTransaction(
      STORE_WORKFLOW_EXECUTIONS,
      "readonly",
      (store) => store.getAll(),
    );
    return records
      .filter((record) => record.workflowId === workflowId)
      .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0));
  }

  async function listWorkflows() {
    const all = await runTransaction(STORE_WORKFLOWS, "readonly", (store) =>
      store.getAll(),
    );
    return all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }

  async function listWorkflowSummaries() {
    const all = await listWorkflows();
    return all.map((workflow) => ({
      id: workflow.id,
      name: workflow.name ?? "",
      updatedAt: workflow.updatedAt ?? 0,
      nodeCount: workflow.nodes?.length ?? 0,
    }));
  }

  async function listAgentSkills() {
    const records = await runTransaction(
      STORE_AGENT_SKILLS,
      "readonly",
      (store) => store.getAll(),
    );
    const latestById = new Map();
    for (const skill of records) {
      latestById.set(`${skill.source ?? "upload"}:${skill.id}`, skill);
    }
    return [...latestById.values()];
  }

  async function saveAgentSkill(skill) {
    const key = `${skill.source ?? "upload"}:${skill.id}:${skill.contentHash}`;
    return runTransaction(STORE_AGENT_SKILLS, "readwrite", (store) =>
      store.put({ key, ...skill, enabled: skill.enabled !== false }),
    ).then(() => ({ ...skill, key, enabled: skill.enabled !== false }));
  }

  async function deleteAgentSkill(source, id) {
    if (!source || !id) throw new Error("Skill source and id are required");
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_AGENT_SKILLS, "readwrite");
      const store = transaction.objectStore(STORE_AGENT_SKILLS);
      const prefix = `${source}:${id}:`;
      let deleted = 0;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error("Skill deletion was aborted"));
      transaction.oncomplete = () => resolve(deleted);

      // A skill can have several saved content hashes; delete every revision.
      const keys = store.getAllKeys();
      keys.onerror = () => reject(keys.error);
      keys.onsuccess = () => {
        for (const key of keys.result) {
          if (typeof key !== "string" || !key.startsWith(prefix)) continue;
          const removal = store.delete(key);
          removal.onerror = () => reject(removal.error);
          deleted += 1;
        }
      };
    });
  }

  async function deleteWorkflow(id) {
    return runTransaction(STORE_WORKFLOWS, "readwrite", (store) =>
      store.delete(id),
    );
  }

  /**
   * Writes several images in a single transaction.
   *
   * @param {Array<[string, string | Blob]>} entries - `[id, dataUrlOrBlob]` pairs
   */
  async function putImages(entries, retention) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        retention ? [STORE_IMAGES, STORE_WORKFLOWS] : STORE_IMAGES,
        "readwrite",
      );
      const store = transaction.objectStore(STORE_IMAGES);
      const writeImages = () =>
        entries.forEach(([id, source]) => {
          const blob =
            typeof source === "string" ? dataUrlToBlob(source) : source;
          store.put({ id, blob, createdAt: Date.now() });
        });
      if (retention)
        writePublicationIntent(transaction, retention, writeImages, reject);
      else writeImages();
      transaction.oncomplete = () => resolve();
      transaction.onerror = (event) =>
        reject(
          transaction.error ||
            event.target?.error ||
            new Error("Image write transaction failed"),
        );
      transaction.onabort = () =>
        reject(transaction.error || new Error("Image transaction was aborted"));
    });
  }

  /** Stores one image. Accepts a data URL string or an already-typed Blob. */
  async function putImage(id, source, retention) {
    await putImages([[id, source]], retention);
    return id;
  }

  /** Deletes several images in a single transaction. Missing ids are ignored. */
  async function deleteImages(ids) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_IMAGES, "readwrite");
      const store = transaction.objectStore(STORE_IMAGES);
      ids.forEach((id) => store.delete(id));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error("Image transaction was aborted"));
    });
  }

  /** Deletes one image. Missing ids are ignored. */
  async function deleteImage(id) {
    await deleteImages([id]);
  }

  /**
   * Reads raw records for several ids in a single transaction, instead of one
   * transaction per image.
   *
   * @returns {Promise<Map<string, object>>} id -> stored record
   */
  async function getImageRecords(ids) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_IMAGES, "readonly");
      const store = transaction.objectStore(STORE_IMAGES);
      const records = new Map();
      ids.forEach((id) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) records.set(id, request.result);
        };
        request.onerror = () => reject(request.error);
      });
      transaction.oncomplete = () => resolve(records);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error("Image transaction was aborted"));
    });
  }

  /**
   * Loads several images as Blobs in one transaction, for rendering.
   *
   * @returns {Promise<Map<string, Blob>>} id -> Blob (missing ids are skipped)
   */
  async function getImageBlobMap(ids) {
    const records = await getImageRecords(ids);
    return new Map(
      [...records].map(([id, record]) => [id, recordToBlob(record)]),
    );
  }

  /**
   * Loads several images as data URLs in one transaction, for transport
   * (postMessage / API payloads) and JSON export.
   *
   * @returns {Promise<object>} id -> data URL (missing ids are skipped)
   */
  async function getImageDataUrls(ids) {
    const records = await getImageRecords(ids);
    const entries = await Promise.all(
      [...records].map(async ([id, record]) => [
        id,
        record.dataUrl && !record.blob
          ? record.dataUrl
          : await blobToDataUrl(recordToBlob(record)),
      ]),
    );
    return Object.fromEntries(entries);
  }

  /** Loads one image as a data URL, or null when it does not exist. */
  async function getImageDataUrl(id) {
    return (await getImageDataUrls([id]))[id] ?? null;
  }

  /**
   * Stores generated pictures and registers them in the asset library in one
   * transaction, so a crash can never leave a library row without its blob.
   * Thumbnails share the transaction for the same reason.
   *
   * @param {Array<[string, string | Blob]>} entries - `[id, dataUrlOrBlob]` pairs
   * @param {object} meta - `platform`, `prompt`, `nodeId`, `workflowId`
   * @param {Array<[string, string | Blob]>} [thumbs] - `[id, thumbnail]` pairs;
   *   entries without a pair (videos, legacy writes) fall back to the full blob
   *   on read.
   */
  async function putLibraryImages(entries, meta, thumbs = []) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [STORE_IMAGES, STORE_ASSETS, STORE_THUMBNAILS],
        "readwrite",
      );
      const images = transaction.objectStore(STORE_IMAGES);
      const assets = transaction.objectStore(STORE_ASSETS);
      const thumbnails = transaction.objectStore(STORE_THUMBNAILS);
      const now = Date.now();
      entries.forEach(([id, source]) => {
        const blob =
          typeof source === "string" ? dataUrlToBlob(source) : source;
        images.put({ id, blob, createdAt: now });
        assets.put({
          id,
          platform: meta.platform ?? null,
          prompt: meta.prompt ?? "",
          nodeId: meta.nodeId ?? null,
          workflowId: meta.workflowId ?? null,
          bytes: blob.size,
          createdAt: now,
          lastUsedAt: now,
        });
      });
      thumbs.forEach(([id, source]) => {
        const blob =
          typeof source === "string" ? dataUrlToBlob(source) : source;
        thumbnails.put({ id, blob });
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error("Asset transaction was aborted"));
    });
  }

  /** Every asset-library row, newest first. Blobs are read separately. */
  async function listAssetRecords() {
    const all = await runTransaction(STORE_ASSETS, "readonly", (store) =>
      store.getAll(),
    );
    return all.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  /**
   * One newest-first page of library rows plus totals, so the panel can
   * paginate without shipping every record (and blob) at once. Records are
   * metadata-only — a few hundred bytes each — so getAll+slice is cheap even
   * for large libraries; it is the blobs that must stay paged. `platform`
   * narrows the page to one source (e.g. "import" for the material library's
   * local tab); totals then describe that subset.
   *
   * @returns {Promise<{records: object[], total: number, bytes: number}>}
   */
  async function listAssetPage({
    offset = 0,
    limit = 24,
    platform = null,
  } = {}) {
    const all = await listAssetRecords();
    const filtered = platform
      ? all.filter((record) => record.platform === platform)
      : all;
    return {
      records: filtered.slice(offset, offset + limit),
      total: filtered.length,
      bytes: filtered.reduce((sum, record) => sum + (record.bytes ?? 0), 0),
    };
  }

  /**
   * Loads thumbnails for several asset ids in one transaction.
   *
   * @returns {Promise<Map<string, Blob>>} id -> thumbnail Blob (missing ids
   *   are skipped — the caller falls back to the full image for those)
   */
  async function getAssetThumbMap(ids) {
    const db = await openDatabase();
    const thumbs = await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_THUMBNAILS, "readonly");
      const store = transaction.objectStore(STORE_THUMBNAILS);
      const records = new Map();
      ids.forEach((id) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) records.set(id, request.result.blob);
        };
        request.onerror = () => reject(request.error);
      });
      transaction.oncomplete = () => resolve(records);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(
          transaction.error || new Error("Thumbnail transaction was aborted"),
        );
    });
    return thumbs;
  }

  /**
   * Thumbnails as data URLs, for transport over the external bridge.
   *
   * @returns {Promise<object>} id -> data URL (missing ids are skipped)
   */
  async function getAssetThumbDataUrls(ids) {
    const thumbs = await getAssetThumbMap(ids);
    const entries = await Promise.all(
      [...thumbs].map(async ([id, blob]) => [id, await blobToDataUrl(blob)]),
    );
    return Object.fromEntries(entries);
  }

  /** Ids of every registered asset — the library's half of the keep set. */
  async function listAssetIds() {
    return runTransaction(STORE_ASSETS, "readonly", (store) =>
      store.getAllKeys(),
    );
  }

  /** Stamps assets as just used, which is what keeps them out of LRU eviction. */
  async function touchAssets(ids) {
    if (ids.length === 0) return;
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_ASSETS, "readwrite");
      const store = transaction.objectStore(STORE_ASSETS);
      const now = Date.now();
      ids.forEach((id) => {
        const request = store.get(id);
        request.onsuccess = () => {
          if (request.result) store.put({ ...request.result, lastUsedAt: now });
        };
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error("Asset transaction was aborted"));
    });
  }

  /**
   * Removes library rows. The blobs stay behind for `pruneImages` to collect,
   * because a workflow on the canvas may still be pointing at them. Thumbnails
   * have no such second owner, so they leave with the row.
   */
  async function deleteAssetRecords(ids) {
    if (ids.length === 0) return;
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(
        [STORE_ASSETS, STORE_THUMBNAILS],
        "readwrite",
      );
      const assets = transaction.objectStore(STORE_ASSETS);
      const thumbnails = transaction.objectStore(STORE_THUMBNAILS);
      ids.forEach((id) => {
        assets.delete(id);
        thumbnails.delete(id);
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error || new Error("Asset transaction was aborted"));
    });
  }

  /** Reference reads, library ownership and deletion are one transaction. */
  async function pruneImages(referencedIds, options = {}) {
    return pruneImageRecords(await openDatabase(), {
      ...options,
      referencedIds,
    });
  }

  async function pruneOrphans(extraLiveNodes = [], options = {}) {
    return pruneImageRecords(await openDatabase(), {
      ...options,
      extraLiveNodes,
    });
  }

  async function imageRetention(update) {
    const db = await openDatabase();
    const result = await updateRetention(db, update);
    if (
      !update.deferCleanup &&
      (update.action === "rollback" || update.action === "dispose")
    ) {
      await pruneImageRecords(db);
    }
    return result;
  }

  return {
    DB_NAME,
    DB_VERSION,
    DB_VERSION_FLOOR,
    saveWorkflow,
    loadWorkflow,
    listWorkflows,
    listWorkflowSummaries,
    listAgentSkills,
    saveAgentSkill,
    deleteAgentSkill,
    deleteWorkflow,
    saveWorkflowExecution,
    loadWorkflowExecution,
    listWorkflowExecutions,
    putImages,
    putImage,
    deleteImages,
    deleteImage,
    getImageBlobMap,
    getImageDataUrls,
    getImageDataUrl,
    putLibraryImages,
    listAssetRecords,
    listAssetPage,
    getAssetThumbMap,
    getAssetThumbDataUrls,
    listAssetIds,
    touchAssets,
    deleteAssetRecords,
    pruneImages,
    imageRetention,
    pruneOrphans,
  };
}

createLocalDbBackend.DB_NAME = DB_NAME;
createLocalDbBackend.DB_VERSION = DB_VERSION;
createLocalDbBackend.DB_VERSION_FLOOR = DB_VERSION_FLOOR;
