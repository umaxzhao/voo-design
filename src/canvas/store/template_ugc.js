import { useCallback, useEffect, useState } from "react";
import {
  collectTemplateNodes,
  layoutTemplateNodes,
  serializeTemplateNodes,
} from "../template_ugc.js";
import { scheduleSave } from "./persistence.js";
import { commitWorkflowHistory } from "../undo-action-contracts.js";
import { isWorkflowReadOnly } from "./workflow_readonly.js";

/**
 * User-created ("My") templates: IndexedDB persistence, a small React hook
 * for the template drawer, and the store actions that capture a selection
 * into a template or apply one onto the canvas.
 *
 * The database is deliberately separate from the workflow DB: a template is a
 * portable node structure, not a document, and this keeps the schema bump out
 * of the shared storage layer.
 */

const DB_NAME = "voo-user-templates";
const STORE_NAME = "templates";
const DB_VERSION = 1;

let dbPromise = null;

function openTemplateDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function withStore(mode, run) {
  return openTemplateDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        let result;
        const hasTransactionEvents =
          typeof transaction?.addEventListener === "function";
        if (hasTransactionEvents) {
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () =>
            reject(
              transaction.error ||
                new Error("Template transaction was aborted"),
            );
          transaction.oncomplete = () => resolve(result);
        }
        const request = run(store);
        request.onsuccess = () => {
          result = request.result;
          if (!hasTransactionEvents) {
            resolve(result);
          }
        };
        request.onerror = () => reject(request.error);
      }),
  );
}

/** All saved templates, newest first. */
export async function fetchUserTemplates() {
  const templates = await withStore("readonly", (store) => store.getAll());
  return (templates ?? []).sort(
    (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );
}

/** Persists (or replaces) one template record. */
export async function insertUserTemplate(template) {
  return withStore("readwrite", (store) => store.put(template));
}

/** Removes a template by id. */
export async function removeUserTemplate(id) {
  return withStore("readwrite", (store) => store.delete(id));
}

/** Renames a template in place, keeping its created/updated timestamps sane. */
export async function updateUserTemplateName(id, name) {
  const template = await withStore("readonly", (store) => store.get(id));
  if (!template) return null;
  return withStore("readwrite", (store) =>
    store.put({ ...template, name, updatedAt: Date.now() }),
  );
}

/** Live list of saved templates for the drawer, with a manual reload. */
export function useUserTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await fetchUserTemplates());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { templates, loading, reload };
}

/** Template-UGC store actions, spread into the workflow store. */
export function createTemplateUgcActions(set, get) {
  return {
    /** Captures the current selection (group subtrees included) as a named template. */
    async saveSelectionAsTemplate(name) {
      const selectedIds = get()
        .nodes.filter((node) => node.selected)
        .map((node) => node.id);
      const captured = collectTemplateNodes(get().nodes, selectedIds);
      if (captured.length === 0) return null;
      const template = {
        id: `tmpl-${crypto.randomUUID()}`,
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        nodes: serializeTemplateNodes(captured),
      };
      await insertUserTemplate(template);
      return template;
    },

    /**
     * Applies a template non-destructively: fresh node ids, the template's
     * bounding box centred on `center`, existing nodes untouched, and the
     * whole insertion undoable in one step.
     */
    applyTemplate(template, center) {
      if (isWorkflowReadOnly(get())) return false;
      const cloned = layoutTemplateNodes(template?.nodes, center);
      if (cloned.length === 0) return false;
      commitWorkflowHistory(get, "workflow.template.apply");
      set({ nodes: [...get().nodes, ...cloned] });
      scheduleSave(get);
      return true;
    },

    async renameMyTemplate(id, name) {
      return updateUserTemplateName(id, name);
    },

    async deleteMyTemplate(id) {
      return removeUserTemplate(id);
    },
  };
}
