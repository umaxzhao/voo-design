/**
 * Named pose snapshots of a node, like Spline's States.
 *
 * A state stores the node's spatial values and opacity. The first state added
 * also records the node's current pose as an undeletable "Base" state, so
 * there is always a way back. Applying a state is an ordinary document edit,
 * which keeps it undoable and animatable.
 */
import { getNodeSpatial } from "./canvas-composition-model.js";

export const BASE_STATE_ID = "base";
export const STATE_SPATIAL_KEYS = Object.freeze([
  "x",
  "y",
  "z",
  "width",
  "height",
  "rotationX",
  "rotationY",
  "rotationZ",
]);

export function captureStateValues(node) {
  const spatial = getNodeSpatial(node);
  const values = {};
  for (const key of STATE_SPATIAL_KEYS) values[key] = spatial[key];
  values.opacity = Number.isFinite(node.opacity) ? node.opacity : 1;
  return values;
}

export function getNodeStates(node) {
  return Array.isArray(node?.states) ? node.states : [];
}

/** Add a state holding the node's current pose; seeds the Base state first. */
export function addNodeState(node, { id, name }) {
  if (typeof id !== "string" || !id)
    throw new TypeError("A state id is required");
  const existing = getNodeStates(node);
  const values = captureStateValues(node);
  const seeded = existing.length
    ? existing
    : [{ id: BASE_STATE_ID, name, isBase: true, values }];
  const label = existing.length ? name : `${name} 1`;
  return [...seeded, { id, name: label, values }];
}

export function renameNodeState(states, id, name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) throw new TypeError("A state needs a name");
  return states.map((state) =>
    state.id === id ? { ...state, name: trimmed } : state,
  );
}

/** The Base state stays; removing the last other state drops the set. */
export function removeNodeState(states, id) {
  if (id === BASE_STATE_ID) throw new RangeError("The base state is permanent");
  const next = states.filter((state) => state.id !== id);
  return next.every((state) => state.isBase) ? [] : next;
}

/** Re-capture a state from the node's current pose. */
export function recaptureNodeState(states, id, node) {
  const values = captureStateValues(node);
  return states.map((state) =>
    state.id === id ? { ...state, values } : state,
  );
}

/** Fields for the editor's node patch that put the node into this state. */
export function stateValuesPatch(state) {
  if (!state?.values) throw new TypeError("State has no values");
  return { ...state.values };
}
