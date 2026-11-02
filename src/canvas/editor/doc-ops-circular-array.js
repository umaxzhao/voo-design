import { commitEditorAction } from "../undo-action-contracts.js";
/**
 * Circular array — document operations.
 *
 * Mirrors `doc-ops-linear-array.js` so a circular modifier is created, updated and removed through the same
 * engine surface as a linear one, which is what lets the existing Undo/Redo, application-save and
 * new-engine-reopen paths treat it as a first-class modifier rather than a special case.
 *
 * NO ANIMATION OPERATIONS. The linear module also exports keyframe helpers; a circular array has no
 * supported animated property — validation rejects an `animations` field outright — so there is deliberately
 * nothing here to animate rather than a stub that would imply a capability the feature does not have.
 *
 * VALIDATE BEFORE AND AFTER. Like the linear operations, the existing collection is validated before any
 * change and the whole CANDIDATE collection is validated before it is committed, so a modifier can never be
 * written into a document that the collection validator would reject on reload.
 *
 * @module doc-ops-circular-array
 */

import {
  MODIFIER_TYPE,
  validateAndNormalizeModifierCollection,
  validateModifierPatch,
} from "./scene-linear-array-validation.js";
import { normalizeCircularArrayModifier } from "./scene-circular-array-validation.js";

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
    return { ...engineOrDoc, modifiers: nextDoc.modifiers };
  }
  return nextDoc;
}

const DEFAULT_RADIUS = 100;
const DEFAULT_START_ANGLE = 0;
const DEFAULT_ARC_SPAN = 360;

/**
 * Adds a circular array modifier to a target node.
 *
 * @param {object} engineOrDoc
 * @param {{id?:string, targetId:string, count?:number, radius?:number, startAngle?:number, arcSpan?:number, name?:string}} params
 * @param {{commit?:boolean, name?:string}} [options]
 */
export function addCircularArrayModifier(
  engineOrDoc,
  {
    id,
    targetId,
    count = 2,
    radius = DEFAULT_RADIUS,
    startAngle = DEFAULT_START_ANGLE,
    arcSpan = DEFAULT_ARC_SPAN,
    name = null,
    ...rest
  } = {},
  options = {},
) {
  // Refuse an unsupported field rather than destructuring it away. `animations` in particular must not be
  // silently dropped: destructuring only the known params would accept the call and ignore the request,
  // which tells the caller their animation was honoured when nothing was stored.
  const unsupported = Object.keys(rest);
  if (unsupported.length > 0) {
    throw new TypeError(
      `Circular array does not support: ${unsupported.join(", ")}`,
    );
  }
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
      : `mod_arr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  if (existing.some((m) => m.id === modifierId)) {
    throw new TypeError(`Modifier with id "${modifierId}" already exists`);
  }
  if (
    existing.some(
      (m) => m.targetId === targetId && m.type === MODIFIER_TYPE.CIRCULAR_ARRAY,
    )
  ) {
    throw new TypeError(
      `Circular array modifier already exists on target "${targetId}"`,
    );
  }

  const normalized = normalizeCircularArrayModifier(
    {
      id: modifierId,
      type: MODIFIER_TYPE.CIRCULAR_ARRAY,
      targetId,
      count,
      radius,
      startAngle,
      arcSpan,
    },
    targetNode,
  );

  const candidateModifiers = [...existing, normalized];
  validateAndNormalizeModifierCollection(candidateModifiers, doc.nodes);

  return commitDocument(
    engineOrDoc,
    { ...doc, modifiers: candidateModifiers },
    {
      commit: options.commit !== false,
      name: options.name ?? name ?? "editor.history.entry.action",
    },
  );
}

/**
 * Updates an existing circular array modifier.
 *
 * Patch fields are restricted by `validateModifierPatch`, so identity fields (`id`, `targetId`, `type`) stay
 * immutable and a patch cannot silently retarget the array.
 *
 * @param {object} engineOrDoc
 * @param {string} modifierId
 * @param {object} [patch]
 * @param {{commit?:boolean, name?:string}} [options]
 */
export function updateCircularArrayModifier(
  engineOrDoc,
  modifierId,
  patch = {},
  options = {},
) {
  const doc = getDocument(engineOrDoc);
  const existing = doc.modifiers ?? [];
  validateAndNormalizeModifierCollection(existing, doc.nodes);

  const index = existing.findIndex((m) => m.id === modifierId);
  if (index === -1) {
    throw new TypeError(`Modifier not found: "${modifierId}"`);
  }
  const current = existing[index];
  if (current.type !== MODIFIER_TYPE.CIRCULAR_ARRAY) {
    throw new TypeError(`Modifier "${modifierId}" is not a circular array`);
  }
  const targetNode = doc.nodes.find((n) => n.id === current.targetId) ?? null;
  validateModifierPatch(current, patch, targetNode);

  const normalized = normalizeCircularArrayModifier(
    { ...current, ...patch },
    targetNode,
  );

  const candidateModifiers = [...existing];
  candidateModifiers[index] = normalized;
  validateAndNormalizeModifierCollection(candidateModifiers, doc.nodes);

  return commitDocument(
    engineOrDoc,
    { ...doc, modifiers: candidateModifiers },
    {
      commit: options.commit !== false,
      name: options.name ?? "editor.history.entry.action",
    },
  );
}

/**
 * Removes a circular array modifier.
 *
 * Removing the modifier removes the derived instances by construction: they only exist because the evaluator
 * expands the modifier, and the canonical source was never modified or moved.
 *
 * @param {object} engineOrDoc
 * @param {string} modifierId
 * @param {{commit?:boolean, name?:string}} [options]
 */
export function removeCircularArrayModifier(
  engineOrDoc,
  modifierId,
  options = {},
) {
  const doc = getDocument(engineOrDoc);
  const existing = doc.modifiers ?? [];
  validateAndNormalizeModifierCollection(existing, doc.nodes);

  const index = existing.findIndex((m) => m.id === modifierId);
  if (index === -1) {
    throw new TypeError(`Modifier not found: "${modifierId}"`);
  }
  const current = existing[index];
  if (current.type !== MODIFIER_TYPE.CIRCULAR_ARRAY) {
    throw new TypeError(`Modifier "${modifierId}" is not a circular array`);
  }

  const candidateModifiers = existing.filter((m) => m.id !== modifierId);
  validateAndNormalizeModifierCollection(candidateModifiers, doc.nodes);

  return commitDocument(
    engineOrDoc,
    { ...doc, modifiers: candidateModifiers },
    {
      commit: options.commit !== false,
      name: options.name ?? "editor.history.entry.action",
    },
  );
}

