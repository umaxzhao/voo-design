import { commitEditorAction } from "../undo-action-contracts.js";
/**
 * Document Operations for Linear Array Modifiers.
 *
 * Provides undoable, deterministic parameter change operations on an editor engine or document:
 * - addLinearArrayModifier(engineOrDoc, { targetId, count, step, id? }, options)
 * - updateLinearArrayModifier(engineOrDoc, modifierId, patch, options)
 * - removeLinearArrayModifier(engineOrDoc, modifierId, options)
 *
 * Follows VOO single undo step contract per user commit.
 * Non-destructive: operates on doc.modifiers without polluting canonical doc.nodes.
 */

import {
  MODIFIER_TYPE,
  validateAndNormalizeModifierCollection,
  validateModifierPatch,
  normalizeLinearArrayModifier,
} from "./scene-linear-array-validation.js";

function getDocument(engineOrDoc) {
  if (typeof engineOrDoc?.getDocument === "function") {
    return engineOrDoc.getDocument();
  }
  if (engineOrDoc && Array.isArray(engineOrDoc.nodes)) {
    return engineOrDoc;
  }
  throw new TypeError("Invalid engine or document provided");
}

function commitDocument(
  engineOrDoc,
  nextDoc,
  { commit = true, name = null } = {},
) {
  if (typeof engineOrDoc?.setDoc === "function") {
    if (commit === false) {
      engineOrDoc.setDoc(nextDoc, { commit: false, name });
    } else {
      commitEditorAction("editor.modifier.change", () =>
        engineOrDoc.setDoc(nextDoc, { commit: true, name }),
      );
    }
    return nextDoc;
  }
  if (engineOrDoc && Array.isArray(engineOrDoc.nodes)) {
    return {
      ...engineOrDoc,
      modifiers: nextDoc.modifiers,
    };
  }
  return nextDoc;
}

/**
 * Adds a new linear array modifier to the document.
 */
export function addLinearArrayModifier(
  engineOrDoc,
  { id, targetId, count = 2, step = { x: 50, y: 0, z: 0 }, name = null } = {},
  options = {},
) {
  const doc = getDocument(engineOrDoc);
  // Pre-validate existing collection before making any changes
  validateAndNormalizeModifierCollection(doc.modifiers, doc.nodes);

  const targetNode = doc.nodes.find((n) => n.id === targetId);
  if (!targetNode) {
    throw new TypeError(`Target node not found: "${targetId}"`);
  }

  const existing = doc.modifiers ?? [];
  const modifierId =
    id && typeof id === "string" && id.trim()
      ? id.trim()
      : `mod_arr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (existing.some((m) => m.id === modifierId)) {
    throw new TypeError(`Modifier with id "${modifierId}" already exists`);
  }
  if (
    existing.some(
      (m) => m.targetId === targetId && m.type === MODIFIER_TYPE.LINEAR_ARRAY,
    )
  ) {
    throw new TypeError(
      `Linear array modifier already exists on target "${targetId}"`,
    );
  }

  const normalized = normalizeLinearArrayModifier(
    {
      id: modifierId,
      type: MODIFIER_TYPE.LINEAR_ARRAY,
      targetId,
      count,
      step,
    },
    targetNode,
  );

  const candidateModifiers = [...existing, normalized];
  // Validate entire candidate collection against doc.nodes before constructing nextDoc
  validateAndNormalizeModifierCollection(candidateModifiers, doc.nodes);

  const nextDoc = {
    ...doc,
    modifiers: candidateModifiers,
  };

  return commitDocument(engineOrDoc, nextDoc, {
    commit: options.commit !== false,
    name: options.name ?? name ?? "editor.history.entry.action",
  });
}

/**
 * Updates parameters of an existing linear array modifier (e.g. count, step).
 */
export function updateLinearArrayModifier(
  engineOrDoc,
  modifierId,
  patch = {},
  options = {},
) {
  if (typeof modifierId !== "string" || !modifierId) {
    throw new TypeError("modifierId must be a non-empty string");
  }
  const doc = getDocument(engineOrDoc);
  // Pre-validate existing collection before making any changes
  validateAndNormalizeModifierCollection(doc.modifiers, doc.nodes);

  const existing = doc.modifiers ?? [];
  const index = existing.findIndex((m) => m.id === modifierId);
  if (index === -1) {
    throw new TypeError(`Modifier not found: "${modifierId}"`);
  }

  const current = existing[index];
  const targetNode = doc.nodes.find((n) => n.id === current.targetId);
  if (!targetNode) {
    throw new TypeError(`Target node not found: "${current.targetId}"`);
  }

  const normalized = validateModifierPatch(current, patch, targetNode);
  const candidateModifiers = [...existing];
  candidateModifiers[index] = normalized;

  // Validate entire candidate collection against doc.nodes before constructing nextDoc
  validateAndNormalizeModifierCollection(candidateModifiers, doc.nodes);

  const nextDoc = {
    ...doc,
    modifiers: candidateModifiers,
  };

  return commitDocument(engineOrDoc, nextDoc, {
    commit: options.commit !== false,
    name: options.name ?? "editor.history.entry.action",
  });
}

/**
 * Removes a linear array modifier by id.
 */
export function removeLinearArrayModifier(
  engineOrDoc,
  modifierId,
  options = {},
) {
  if (typeof modifierId !== "string" || !modifierId) {
    throw new TypeError("modifierId must be a non-empty string");
  }
  const doc = getDocument(engineOrDoc);
  // Pre-validate existing collection before making any changes
  validateAndNormalizeModifierCollection(doc.modifiers, doc.nodes);

  const existing = doc.modifiers ?? [];
  const nextModifiers = existing.filter((m) => m.id !== modifierId);
  if (nextModifiers.length === existing.length) {
    return doc;
  }

  const nextDoc = {
    ...doc,
    modifiers: nextModifiers,
  };

  return commitDocument(engineOrDoc, nextDoc, {
    commit: options.commit !== false,
    name: options.name ?? "editor.history.entry.action",
  });
}

