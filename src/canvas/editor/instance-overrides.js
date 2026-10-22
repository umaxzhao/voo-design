/**
 * Per-instance overrides of a main component's layers (Figma's component
 * properties): the same component can carry different copy, colours and
 * visibility in each place it is used, without detaching.
 *
 * Stored on the instance as `overrides.nodes[layerId] = { text?, fill?,
 * visible? }` and applied by `applyInstanceOverrides` wherever the component
 * is drawn or exported. Layers that no longer exist are ignored.
 */


export const OVERRIDE_FIELDS = Object.freeze(["text", "fill", "visible"]);

const FILL_KINDS = new Set(["rect", "ellipse", "path", "text", "boolean"]);
const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;

/** What can be overridden on a layer of this kind. */
export function overrideSupport(node) {
  return {
    text: node.kind === "text",
    fill: FILL_KINDS.has(node.kind),
    visible: true,
  };
}

function validate(field, value) {
  if (value === undefined || value === null) return;
  if (field === "text" && typeof value !== "string")
    throw new TypeError("A text override must be a string");
  if (field === "fill" && !(typeof value === "string" && HEX_COLOR.test(value)))
    throw new TypeError("A fill override must be a hex colour");
  if (field === "visible" && typeof value !== "boolean")
    throw new TypeError("A visibility override must be true or false");
}

function nodeMap(instance) {
  return instance?.overrides?.nodes ?? {};
}

export function getNodeOverride(instance, nodeId) {
  return nodeMap(instance)[nodeId] ?? {};
}

export function hasNodeOverride(instance, nodeId) {
  return Object.keys(getNodeOverride(instance, nodeId)).length > 0;
}

export function hasOverrides(instance) {
  return Object.values(nodeMap(instance)).some(
    (entry) => Object.keys(entry).length > 0,
  );
}

/**
 * Merge fields into one layer's override; `undefined` or `null` removes a
 * field, and a layer with nothing left is dropped.
 */
export function setNodeOverride(instance, nodeId, patch) {
  if (typeof nodeId !== "string" || !nodeId)
    throw new TypeError("A layer id is required");
  for (const [field, value] of Object.entries(patch)) {
    if (!OVERRIDE_FIELDS.includes(field))
      throw new TypeError(`Unknown override field: ${field}`);
    validate(field, value);
  }
  const merged = { ...getNodeOverride(instance, nodeId) };
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete merged[field];
    else merged[field] = value;
  }
  const nodes = { ...nodeMap(instance) };
  if (Object.keys(merged).length > 0) nodes[nodeId] = merged;
  else delete nodes[nodeId];
  return withNodes(instance, nodes);
}

export function clearNodeOverride(instance, nodeId) {
  const nodes = { ...nodeMap(instance) };
  delete nodes[nodeId];
  return withNodes(instance, nodes);
}

export function clearAllOverrides(instance) {
  return withNodes(instance, {});
}

function withNodes(instance, nodes) {
  const overrides = { ...instance?.overrides };
  if (Object.keys(nodes).length > 0) overrides.nodes = nodes;
  else delete overrides.nodes;
  return { ...instance, overrides };
}

/** The component's document as this instance should draw it. */
export function applyInstanceOverrides(sourceDoc, instance) {
  const overrides = nodeMap(instance);
  if (!sourceDoc || Object.keys(overrides).length === 0) return sourceDoc;
  let changed = false;
  const nodes = sourceDoc.nodes.map((node) => {
    const entry = overrides[node.id];
    if (!entry) return node;
    changed = true;
    const result = { ...node, ...entry };
    return result;
  });
  return changed ? { ...sourceDoc, nodes } : sourceDoc;
}

/** The layers of a component that an instance may override, in stacking order. */
export function overridableNodes(sourceDoc) {
  return (sourceDoc?.nodes ?? [])
    .filter((node) => node.kind !== "group")
    .map((node) => ({ node, support: overrideSupport(node) }))
    .filter(({ support }) => support.text || support.fill || support.visible);
}
