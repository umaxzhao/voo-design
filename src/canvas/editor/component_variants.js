import { clearAllOverrides } from "./instance-overrides.js";
export function newComponentId() {
  const source = globalThis.crypto;
  if (source?.randomUUID) return source.randomUUID();
  return `component_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function variantNameOf(document) {
  return typeof document?.variantName === "string" && document.variantName.trim()
    ? document.variantName
    : null;
}

export function variantGroupOf(document) {
  return typeof document?.variantGroupId === "string" && document.variantGroupId.trim()
    ? document.variantGroupId
    : null;
}

/**
 * Duplicate a main component document as a sibling variant. Node ids are kept
 * so overrides and layer lookups stay meaningful across variants.
 */
export function duplicateComponentMaster(source, {
  componentId,
  variantGroupId,
  variantName,
  name,
} = {}) {
  if (!source || !Array.isArray(source.nodes)) {
    throw new TypeError("A component document with nodes is required");
  }
  const canvasId = componentId ?? newComponentId();
  return {
    ...source,
    canvasId,
    variantGroupId,
    variantName,
    ...(name ? { name } : {}),
  };
}


/** Canonical document entries always win over resolver snapshots. */
export function componentVariants(host, source) {
  if (!source) return [];
  const entries = { [source.canvasId]: source, ...(source.components ?? {}), ...(host.components ?? {}) };
  if (host.canvasId === source.canvasId) entries[host.canvasId] = host;
  const current = entries[source.canvasId];
  return Object.values(entries).filter(doc => doc?.nodes &&
    (current.variantGroupId ? doc.variantGroupId === current.variantGroupId : doc.canvasId === current.canvasId));
}

export function parseVariantName(name) {
  const pairs = String(name ?? "").split(",").map(part => part.trim());
  const result = {};
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index < 1 || !pair.slice(index + 1).trim()) return null;
    const key = pair.slice(0, index).trim();
    if (Object.hasOwn(result, key)) return null;
    result[key] = pair.slice(index + 1).trim();
  }
  return result;
}

export function variantProperties(variants) {
  const parsed = variants.map(doc => parseVariantName(doc.variantName));
  if (!parsed.length || parsed.some(value => !value)) return null;
  const keys = Object.keys(parsed[0]);
  if (parsed.some(value => Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)))) return null;
  return keys.map(key => ({ key, values: [...new Set(parsed.map(value => value[key]))] }));
}

export function matchVariantProperty(variants, current, key, value) {
  const properties = parseVariantName(current.variantName);
  return variants.find(doc => {
    const candidate = parseVariantName(doc.variantName);
    return candidate?.[key] === value && Object.keys(properties ?? {}).every(other => other === key || candidate[other] === properties[other]);
  });
}

export function createVariantDocument(host, source, variantName, componentId = newComponentId()) {
  const variants = componentVariants(host, source);
  source = variants.find(doc => doc.canvasId === source.canvasId) ?? source;
  if (variants.some(doc => doc.variantName === variantName)) throw new Error("Duplicate variant name");
  const variantGroupId = variantGroupOf(source) ?? `variant-group:${componentId}`;
  const updatedSource = { ...source, variantGroupId, variantName: variantNameOf(source) ?? "Default" };
  const variant = duplicateComponentMaster(source, { componentId, variantGroupId, variantName });
  return { ...host, ...(host.canvasId === source.canvasId ? updatedSource : {}), components: {
    ...host.components, [source.canvasId]: updatedSource, [componentId]: variant,
  } };
}

export function switchVariantDocument(host, instanceId, target) {
  const instance = host.nodes.find(node => node.id === instanceId);
  if (!instance || instance.kind !== "canvasInstance") throw new Error("Missing instance");
  if (instance.sourceCanvasId === target.canvasId) return host;
  return { ...host, nodes: host.nodes.map(node => node.id === instanceId ? {
    ...node, sourceCanvasId: target.canvasId, instance: clearAllOverrides(node.instance ?? {}),
  } : node) };
}
