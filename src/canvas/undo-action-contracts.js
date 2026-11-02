import { createEditorUndoActionContracts } from "./editor/editor_undo_actions.js";
import {
  UNDO_BOUNDARY,
  UNDO_DOMAIN_ADAPTERS,
} from "./undo_contracts_domains.js";

export { UNDO_BOUNDARY, UNDO_DOMAIN_ADAPTERS };

export const UNDO_ACTION_CONTRACTS = Object.freeze({
  ...createEditorUndoActionContracts(UNDO_BOUNDARY),
});

export function undoActionContract(actionId) {
  const contract = UNDO_ACTION_CONTRACTS[actionId];
  if (!contract) {
    return {
      domain: "editor",
      userAction: actionId,
      boundary: UNDO_BOUNDARY.ATOMIC,
      source: "editor",
    };
  }
  return contract;
}

const editorActionStack = [];

export function currentEditorHistoryLabel() {
  for (const contract of editorActionStack) {
    if (contract.historyLabel) return contract.historyLabel;
  }
  return null;
}

export function commitEditorAction(actionId, reduce) {
  const contract = undoActionContract(actionId);
  if (typeof reduce !== "function") {
    throw new TypeError(`Undo action ${actionId} requires an editor reducer`);
  }
  editorActionStack.push(contract);
  let result;
  try {
    result = reduce(contract);
  } catch (error) {
    editorActionStack.pop();
    throw error;
  }
  if (result && typeof result.then === "function") {
    return result.finally(() => {
      const index = editorActionStack.lastIndexOf(contract);
      if (index >= 0) editorActionStack.splice(index, 1);
    });
  }
  editorActionStack.pop();
  return result;
}

export function commitEditorDocument(actionId, setDoc, next, options) {
  return commitEditorAction(actionId, () => setDoc(next, options));
}

export function commitOrPreviewEditorDocument(actionId, setDoc, next, options) {
  return commitEditorDocument(actionId, setDoc, next, options);
}

export function commitWorkflowHistory(storeOrGet, actionId, options = {}) {
  return true;
}

export function commitWorkflowGesture(storeOrGet, beforeSnapshot, applyChanges, actionId, options = {}) {
  if (typeof applyChanges === "function") applyChanges();
  return true;
}
