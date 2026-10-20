import { commitEditorAction } from "../undo-action-contracts.js";
/**
 * Document Operations for Grid Array Modifiers.
 *
 * Provides undoable, deterministic parameter change operations on an editor engine or document:
 * - addGridArrayModifier(engineOrDoc, { targetId, rows, cols, layers, step, id? }, options)
 * - updateGridArrayModifier(engineOrDoc, modifierId, patch, options)
 * - removeGridArrayModifier(engineOrDoc, modifierId, options)
 *
 * Follows VOO single undo step contract per user commit.
 * Non-destructive: operates on doc.modifiers without polluting canonical doc.nodes.
 */

import {
  GRID_MODIFIER_TYPE,
  normalizeGridArrayModifier,
  validateGridModifierPatch,
} from "./scene-grid-array.js";
import { validateAndNormalizeModifierCollection } from "./scene-linear-array-validation.js";
import {
  upsertModifierKeyframe,
  removeModifierKeyframe,
} from "./scene-motion.js";

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
 * Adds a new grid array modifier to the document.
 */
export function addGridArrayModifier(
  engineOrDoc,
  {
    id,
    targetId,
    rows = 2,
    cols = 2,
    layers = 1,
    step = { x: 50, y: 50, z: 0 },
    name = null,
  } = {},
  options = {},
) {
  const doc = getDocument(engineOrDoc);
  validateAndNormalizeModifierCollection(doc.modifiers, doc.nodes);

  const targetNode = doc.nodes.find((n) => n.id === targetId);
  if (!targetNode) {
    throw new TypeError(`Target node not found: "${targetId}"`);
  }

  const existing = doc.modifiers ?? [];
  const modifierId =
    id && typeof id === "string" && id.trim()
      ? id.trim()
      : `mod_grid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (existing.some((m) => m.id === modifierId)) {
    throw new TypeError(`Modifier with id "${modifierId}" already exists`);
  }
  if (
    existing.some(
      (m) => m.targetId === targetId && m.type === GRID_MODIFIER_TYPE,
    )
  ) {
    throw new TypeError(
      `Grid array modifier already exists on target "${targetId}"`,
    );
  }

  const normalized = normalizeGridArrayModifier(
    {
      id: modifierId,
      type: GRID_MODIFIER_TYPE,
      targetId,
      rows,
      cols,
      layers,
      step,
    },
    targetNode,
  );

  const candidateModifiers = [...existing, normalized];
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
 * Updates parameters of an existing grid array modifier (e.g. rows, cols, layers, step).
 */
export function updateGridArrayModifier(
  engineOrDoc,
  modifierId,
  patch = {},
  options = {},
) {
  if (typeof modifierId !== "string" || !modifierId) {
    throw new TypeError("modifierId must be a non-empty string");
  }
  const doc = getDocument(engineOrDoc);
  validateAndNormalizeModifierCollection(doc.modifiers, doc.nodes);

  const existing = doc.modifiers ?? [];
  const index = existing.findIndex((m) => m.id === modifierId);
  if (index === -1) {
    throw new TypeError(`Modifier not found: "${modifierId}"`);
  }

  const current = existing[index];
  if (current.type !== GRID_MODIFIER_TYPE) {
    throw new TypeError(
      `Modifier "${modifierId}" is not a grid array modifier (type: "${current.type}")`,
    );
  }

  const targetNode = doc.nodes.find((n) => n.id === current.targetId);
  if (!targetNode) {
    throw new TypeError(`Target node not found: "${current.targetId}"`);
  }

  const normalized = validateGridModifierPatch(current, patch, targetNode);
  const candidateModifiers = [...existing];
  candidateModifiers[index] = normalized;

  validateAndNormalizeModifierCollection(candidateModifiers, doc.nodes);

  const nextDoc = {
    ...doc,
    modifiers: candidateModifiers,
  };

  return commitDocument(engineOrDoc, nextDoc, {
    commit: options.commit !== false,
    name: options.name ?? options.historyName ?? "editor.history.entry.action",
  });
}

/**
 * Removes a grid array modifier from the document.
 */
export function removeGridArrayModifier(engineOrDoc, modifierId, options = {}) {
  if (typeof modifierId !== "string" || !modifierId) {
    throw new TypeError("modifierId must be a non-empty string");
  }
  const doc = getDocument(engineOrDoc);
  const existing = doc.modifiers ?? [];
  const index = existing.findIndex((m) => m.id === modifierId);
  if (index === -1) {
    return doc;
  }

  const nextModifiers = existing.filter((m) => m.id !== modifierId);
  validateAndNormalizeModifierCollection(nextModifiers, doc.nodes);

  const nextDoc = {
    ...doc,
    modifiers: nextModifiers,
  };

  return commitDocument(engineOrDoc, nextDoc, {
    commit: options.commit !== false,
    name: options.name ?? options.historyName ?? "editor.history.entry.action",
  });
}

/**
 * Upserts a keyframe on a grid array modifier's spacing track (step.x, step.y, or step.z).
 */
export function upsertGridArrayKeyframe(
  engineOrDoc,
  modifierId,
  property,
  frame,
  options = {},
) {
  if (typeof modifierId !== "string" || !modifierId) {
    throw new TypeError("modifierId must be a non-empty string");
  }
  const doc = getDocument(engineOrDoc);
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

  const updatedMod = upsertModifierKeyframe(current, property, frame);
  const normalized = normalizeGridArrayModifier(updatedMod, targetNode);

  const candidateModifiers = [...existing];
  candidateModifiers[index] = normalized;
  validateAndNormalizeModifierCollection(candidateModifiers, doc.nodes);

  const nextDoc = {
    ...doc,
    modifiers: candidateModifiers,
  };

  return commitDocument(engineOrDoc, nextDoc, {
    commit: options.commit !== false,
    name: options.name ?? "editor.history.entry.layer",
  });
}

/**
 * Removes a keyframe from a grid array modifier's spacing track.
 */
export function removeGridArrayKeyframe(
  engineOrDoc,
  modifierId,
  property,
  time,
  options = {},
) {
  if (typeof modifierId !== "string" || !modifierId) {
    throw new TypeError("modifierId must be a non-empty string");
  }
  const doc = getDocument(engineOrDoc);
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

  const updatedMod = removeModifierKeyframe(current, property, time);
  const normalized = normalizeGridArrayModifier(updatedMod, targetNode);

  const candidateModifiers = [...existing];
  candidateModifiers[index] = normalized;
  validateAndNormalizeModifierCollection(candidateModifiers, doc.nodes);

  const nextDoc = {
    ...doc,
    modifiers: candidateModifiers,
  };

  return commitDocument(engineOrDoc, nextDoc, {
    commit: options.commit !== false,
    name: options.name ?? "editor.history.entry.layer",
  });
}
