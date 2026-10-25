/**
 * Prototype interactions (Figma-style flows): hotspot on a layer, trigger,
 * action and transition. Pure model + small doc reducers; the runner and the
 * panel read it, `.voo` serialisation persists it.
 */

export const PROTOTYPE_TRIGGERS = Object.freeze(["click", "whilePress"]);
export const PROTOTYPE_ACTIONS = Object.freeze(["navigate", "back", "overlay", "closeOverlay"]);
export const PROTOTYPE_TRANSITIONS = Object.freeze([
  "instant",
  "dissolve",
  "move-left",
  "move-right",
  "move-up",
  "move-down",
]);
export const PROTOTYPE_EASINGS = Object.freeze(["ease-out", "ease-in-out", "linear"]);

const MAX_INTERACTIONS = 200;

let seq = 0;
function newId() {
  const source = globalThis.crypto;
  if (source?.randomUUID) return source.randomUUID();
  return `interaction_${Date.now()}_${(seq += 1)}`;
}

function isFrame(node) {
  return Boolean(
    node &&
      (node.isFrame === true ||
        node.kind === "frame" ||
        node.containerType === "frame"),
  );
}

export function isFrameNode(node) {
  return isFrame(node);
}

/** Frames in document order — every prototype target must be one of these. */
export function prototypeFrames(doc) {
  return (doc?.nodes ?? []).filter((node) => isFrame(node) && node.visible !== false);
}

/** Walks parents up to the owning frame (or returns the node when it is one). */
export function frameOfNode(doc, node) {
  let current = node ?? null;
  const byId = new Map((doc?.nodes ?? []).map((entry) => [entry.id, entry]));
  let guard = 0;
  while (current && !isFrame(current) && guard < 64) {
    current = current.parentId ? byId.get(current.parentId) ?? null : null;
    guard += 1;
  }
  return current && isFrame(current) ? current : null;
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function normalizeInteraction(raw, doc = null) {
  if (!raw || typeof raw !== "object") return null;
  const nodes = doc ? new Set((doc.nodes ?? []).map((node) => node.id)) : null;
  if (typeof raw.sourceId !== "string" || !raw.sourceId) return null;
  if (nodes && !nodes.has(raw.sourceId)) return null;
  const action = PROTOTYPE_ACTIONS.includes(raw.action) ? raw.action : "navigate";
  // Navigate and overlay both need a target frame; back/closeOverlay do not.
  const needsTarget = action === "navigate" || action === "overlay";
  const targetId =
    needsTarget &&
    typeof raw.targetId === "string" &&
    (!nodes || nodes.has(raw.targetId))
      ? raw.targetId
      : null;
  if (needsTarget && !targetId) return null;
  const trigger = PROTOTYPE_TRIGGERS.includes(raw.trigger) ? raw.trigger : "click";
  const transition = PROTOTYPE_TRANSITIONS.includes(raw.transition)
    ? raw.transition
    : "instant";
  const easing = PROTOTYPE_EASINGS.includes(raw.easing) ? raw.easing : "ease-out";
  const duration = clamp(
    Number.isFinite(Number(raw.duration)) ? Math.round(Number(raw.duration)) : 300,
    0,
    2000,
  );
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
    sourceId: raw.sourceId,
    trigger,
    action,
    ...(targetId ? { targetId } : {}),
    transition,
    easing,
    duration,
  };
}

export function normalizePrototype(raw, doc = null) {
  const value = raw && typeof raw === "object" ? raw : {};
  const interactions = (Array.isArray(value.interactions) ? value.interactions : [])
    .map((entry) => normalizeInteraction(entry, doc))
    .filter(Boolean)
    .slice(0, MAX_INTERACTIONS);
  const startFrameId =
    typeof value.startFrameId === "string" &&
    (doc == null || (doc.nodes ?? []).some((node) => node.id === value.startFrameId && isFrame(node)))
      ? value.startFrameId
      : null;
  return { ...(startFrameId ? { startFrameId } : {}), interactions };
}

export function interactionsFor(doc, sourceId) {
  return (doc?.prototype?.interactions ?? []).filter(
    (interaction) => interaction.sourceId === sourceId,
  );
}

/** Patterns whose hotspot lives inside `frameId`. */
export function interactionsInFrame(doc, frameId) {
  const byId = new Map((doc?.nodes ?? []).map((node) => [node.id, node]));
  const frame = byId.get(frameId);
  if (!frame) return [];
  return (doc?.prototype?.interactions ?? []).filter((interaction) => {
    const source = byId.get(interaction.sourceId);
    if (!source) return false;
    if (source.id === frame.id) return true;
    return frameOfNode(doc, source)?.id === frame.id;
  });
}

export function defaultPrototype(doc = null) {
  return normalizePrototype({}, doc);
}

/** Adds an interaction (normalised against the current nodes) to a doc copy. */
export function addInteraction(doc, patch) {
  if (!doc) return doc;
  const interaction = normalizeInteraction(
    { ...patch, id: patch?.id ?? newId() },
    doc,
  );
  if (!interaction) return doc;
  const prototype = normalizePrototype(doc.prototype, doc);
  if (prototype.interactions.length >= MAX_INTERACTIONS) return doc;
  return {
    ...doc,
    prototype: { ...prototype, interactions: [...prototype.interactions, interaction] },
  };
}

export function updateInteraction(doc, id, patch) {
  if (!doc) return doc;
  const prototype = normalizePrototype(doc.prototype, doc);
  let changed = false;
  const interactions = prototype.interactions.map((interaction) => {
    if (interaction.id !== id) return interaction;
    const next = normalizeInteraction({ ...interaction, ...patch }, doc);
    if (!next) return interaction;
    changed = true;
    return next;
  });
  return changed ? { ...doc, prototype: { ...prototype, interactions } } : doc;
}

export function removeInteraction(doc, id) {
  if (!doc) return doc;
  const prototype = normalizePrototype(doc.prototype, doc);
  const interactions = prototype.interactions.filter(
    (interaction) => interaction.id !== id,
  );
  if (interactions.length === prototype.interactions.length) return doc;
  return { ...doc, prototype: { ...prototype, interactions } };
}

export function setStartFrame(doc, frameId) {
  if (!doc) return doc;
  const prototype = normalizePrototype(doc.prototype, doc);
  if (prototype.startFrameId === (frameId ?? null)) return doc;
  return {
    ...doc,
    prototype: { ...prototype, ...(frameId ? { startFrameId: frameId } : { startFrameId: undefined }) },
  };
}

/** Frame-relative rect (0..1 in frame space) for a hotspot's clickable area. */
export function hotspotRect(doc, interaction) {
  const byId = new Map((doc?.nodes ?? []).map((node) => [node.id, node]));
  const source = byId.get(interaction?.sourceId);
  if (!source) return null;
  const frame = frameOfNode(doc, source);
  if (!frame || !(frame.width > 0) || !(frame.height > 0)) return null;
  return {
    x: (source.x - frame.x) / frame.width,
    y: (source.y - frame.y) / frame.height,
    width: Math.max(0, source.width) / frame.width,
    height: Math.max(0, source.height) / frame.height,
  };
}

/** Serialised slice for `.voo` persistence; empty object when nothing is set. */
export function serializePrototype(doc) {
  const prototype = normalizePrototype(doc?.prototype, doc);
  if (!prototype.startFrameId && prototype.interactions.length === 0) return {};
  return { prototype };
}

export function deserializePrototype(value) {
  const prototype = normalizePrototype(value?.prototype, null);
  if (!prototype.startFrameId && prototype.interactions.length === 0) return {};
  return { prototype };
}

/** Ids of the frame and every descendant (for the runner's raster). */
export function frameSubtreeIds(doc, frameId) {
  const ids = new Set([frameId]);
  let added = true;
  while (added) {
    added = false;
    for (const node of doc?.nodes ?? []) {
      if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
        ids.add(node.id);
        added = true;
      }
    }
  }
  return [...ids];
}
