import { serialiseDocument, serializeDocumentFields } from "./scene_model_serialization.js";
import { serializeSceneNode } from "./scene-node-serialization.js";

/** Immutable engine/history nodes let dirty checks inspect only changed records. */
export function createDocumentSnapshotState(getDocument) {
  let cache = null;
  let applied = null;
  let baseline = null;
  let checked = null;

  function serialize() {
    const doc = getDocument();
    if (cache?.doc !== doc) {
      const record = serialiseDocument(doc);
      cache = { doc, record, text: JSON.stringify(record) };
    }
    return cache.text;
  }

  function anchor() {
    // Keep canonical top-level records without reparsing a large JSON string.
    // Nested scene data stays immutable and shared, as in engine history.
    const { nodes, ...fields } = cache.record;
    baseline = { doc: cache.doc, nodes, fields: JSON.stringify(fields), nodeTexts: new Map() };
  }

  function setApplied(text) {
    if (text === applied) return;
    applied = text;
    checked = null;
    baseline = null;
    if (cache?.text === text) anchor();
  }

  function differsFromBaseline(doc) {
    if (doc === baseline.doc) return false;
    const previous = baseline.doc.nodes;
    if (doc.nodes.length !== previous.length) return true;
    for (let index = 0; index < doc.nodes.length; index += 1) {
      const node = doc.nodes[index];
      if (node === previous[index]) continue;
      let saved = baseline.nodeTexts.get(index);
      if (saved === undefined) {
        saved = JSON.stringify(baseline.nodes[index]);
        baseline.nodeTexts.set(index, saved);
      }
      if (JSON.stringify(serializeSceneNode(node)) !== saved) return true;
    }
    return JSON.stringify(serializeDocumentFields(doc)) !== baseline.fields;
  }

  function isDirty() {
    if (applied === null) return false;
    // The existing empty baseline denotes a new/imported unsaved document.
    if (applied === "") return true;
    const doc = getDocument();
    if (checked?.doc === doc) return checked.dirty;
    let dirty;
    if (baseline) dirty = differsFromBaseline(doc);
    else {
      // Persisted/legacy baselines may differ from the open document. Preserve
      // exact historical string equality until a matching checkpoint is known.
      dirty = serialize() !== applied;
      if (!dirty) anchor();
    }
    checked = { doc, dirty };
    return dirty;
  }

  return { serialize, isDirty, setApplied, getApplied: () => applied };
}
