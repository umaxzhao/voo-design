import { createDocumentBridge } from "../../src/canvas/collab/document_bridge.js";

export function createEditor(store, initial = store.getState()) {
  let document = structuredClone(initial.document ?? initial);
  const listeners = new Set();
  return {
    getDocument: () => document,
    snapshotDoc: () => JSON.stringify(document),
    setDoc(next) {
      document = structuredClone(next);
      store.getState().document = document;
      listeners.forEach((listener) => listener());
    },
    subscribeRender(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    edit(next) {
      document = structuredClone(next);
      store.getState().document = document;
      listeners.forEach((listener) => listener());
    },
  };
}

export function attachEditorBridge(session, store, editor, db = {}) {
  return createDocumentBridge({
    session,
    store,
    engine: editor,
    db: {
      getImageDataUrls: async () => ({}),
      getImageBlobMap: async () => new Map(),
      putImages: async () => {},
      ...db,
    },
    setTimeout: (fn) => {
      fn();
      return 1;
    },
    clearTimeout: () => {},
  });
}
