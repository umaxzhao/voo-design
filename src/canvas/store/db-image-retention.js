import { referencedImageIds } from "../engine/graph_run.js";
import {
  applyImageRetention,
  publicationImageIds,
} from "./image-retention-protocol.js";

function abortTransaction(transaction, reject, error) {
  reject(error);
  transaction.abort();
}

/** All request results and deletions share one native transaction; no awaited gap. */
export function pruneImageRecords(
  db,
  { extraLiveNodes = [], referencedIds = [], gracePeriodMs = 0 } = {},
) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      ["workflows", "assets", "images"],
      "readwrite",
    );
    const images = transaction.objectStore("images");
    let workflows, assets, candidates;
    let removed = 0;
    const finishRead = () => {
      if (!workflows || !assets || !candidates) return;
      try {
        const keep = new Set([
          ...referencedIds,
          ...referencedImageIds(extraLiveNodes),
        ]);
        for (const workflow of workflows) {
          referencedImageIds(workflow.nodes ?? []).forEach((id) =>
            keep.add(id),
          );
          publicationImageIds(workflow).forEach((id) => keep.add(id));
        }
        assets.forEach((id) => keep.add(id));
        const now = Date.now();
        for (const candidate of candidates) {
          const id = gracePeriodMs > 0 ? candidate.id : candidate;
          if (keep.has(id)) continue;
          if (
            gracePeriodMs > 0 &&
            now - (candidate.createdAt ?? 0) < gracePeriodMs
          )
            continue;
          images.delete(id);
          removed += 1;
        }
      } catch (error) {
        abortTransaction(transaction, reject, error);
      }
    };
    const read = (request, assign) => {
      request.onsuccess = () => {
        assign(request.result);
        finishRead();
      };
      request.onerror = () =>
        reject(request.error || new Error("Image retention request failed"));
    };
    transaction.oncomplete = () => resolve(removed);
    transaction.onerror = (event) =>
      reject(
        transaction.error ||
          event.target?.error ||
          new Error("Image transaction failed"),
      );
    transaction.onabort = () =>
      reject(
        transaction.error || new Error("Image cleanup transaction aborted"),
      );
    read(transaction.objectStore("workflows").getAll(), (value) => {
      workflows = value;
    });
    read(transaction.objectStore("assets").getAllKeys(), (value) => {
      assets = value;
    });
    read(gracePeriodMs > 0 ? images.getAll() : images.getAllKeys(), (value) => {
      candidates = value;
    });
  });
}

/** Sender owns the entire versioned snapshot, never a callback transferred across realms. */
export function updateImageRetention(db, update) {
  if (update.action === "list") return listImageRetentions(db, update.origin);
  const updates = update.owners ?? [update];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(["workflows", "images"], "readwrite");
    const store = transaction.objectStore("workflows");
    const request = store.getAll();
    let result;
    request.onsuccess = () => {
      try {
        const workflows = new Map(
          request.result.map((workflow) => [workflow.id, workflow]),
        );
        result = updates.map((item) => {
          const workflow = workflows.get(item.workflowId);
          if (!workflow && item.action === "dispose") return null;
          const next = applyImageRetention(workflow, item);
          workflows.set(item.workflowId, next);
          store.put(next);
          return next.assetRetentions[item.ownerId];
        });
      } catch (error) {
        abortTransaction(transaction, reject, error);
      }
    };
    request.onerror = () =>
      reject(request.error || new Error("Image retention request failed"));
    transaction.oncomplete = () => resolve(update.owners ? result : result[0]);
    transaction.onerror = (event) =>
      reject(
        transaction.error ||
          event.target?.error ||
          new Error("Image transaction failed"),
      );
    transaction.onabort = () =>
      reject(
        transaction.error || new Error("Image retention transaction aborted"),
      );
  });
}

function listImageRetentions(db, origin) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("workflows", "readonly");
    const request = transaction.objectStore("workflows").getAll();
    let owners;
    request.onsuccess = () => {
      owners = request.result.flatMap((workflow) =>
        Object.entries(workflow.assetRetentions ?? {})
          .filter(([, owner]) => !owner.disposed && owner.origin === origin)
          .map(([ownerId, owner]) => ({
            workflowId: workflow.id,
            ownerId,
            epoch: owner.epoch,
            origin: owner.origin,
            version: owner.version,
          })),
      );
    };
    request.onerror = () =>
      reject(request.error || new Error("Image retention request failed"));
    transaction.oncomplete = () => resolve(owners);
    transaction.onerror = (event) =>
      reject(
        transaction.error ||
          event.target?.error ||
          new Error("Image transaction failed"),
      );
    transaction.onabort = () =>
      reject(transaction.error || new Error("Retention listing aborted"));
  });
}

/** Called by PUT_IMAGES in the same transaction that commits the Blob batch. */
export function writePublicationIntent(
  transaction,
  update,
  writeImages,
  reject,
) {
  const store = transaction.objectStore("workflows");
  const request = store.getAll();
  request.onsuccess = () => {
    try {
      const workflows = new Map(
        request.result.map((workflow) => [workflow.id, workflow]),
      );
      for (const item of Array.isArray(update) ? update : [update]) {
        const next = applyImageRetention(workflows.get(item.workflowId), item, {
          allowSameVersion: true,
        });
        workflows.set(item.workflowId, next);
        store.put(next);
      }
      writeImages();
    } catch (error) {
      abortTransaction(transaction, reject, error);
    }
  };
  request.onerror = () =>
    reject(request.error || new Error("Image retention request failed"));
}
