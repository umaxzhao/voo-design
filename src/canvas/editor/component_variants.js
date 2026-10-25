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

export function matchVariantProperties(variants, properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;
  return variants.find(document => {
    const candidate = parseVariantName(document.variantName);
    return candidate && Object.entries(properties).every(([key, value]) => candidate[key] === value);
  }) ?? null;
}

export function createVariantMatrix(host, source, axes) {
  const entries = Object.entries(axes ?? {});
  if (!entries.length || entries.some(([, values]) => !Array.isArray(values) || !values.length || values.some(value => typeof value !== "string" || !value.trim()))) {
    throw new TypeError("Variant axes must contain non-empty arrays of strings");
  }
  const seenKeys = new Set();
  const names = entries.map(([rawKey, values]) => {
    const key = rawKey.trim();
    if (!key.trim()) throw new TypeError("Variant axis names must not be empty");
    if (seenKeys.has(key)) throw new TypeError(`Duplicate variant axis ${key}`);
    seenKeys.add(key);
    return [key, [...new Set(values.map(value => value.trim()))]];
  });
  let combinations = [{}];
  for (const [key, values] of names) {
    combinations = combinations.flatMap(combination => values.map(value => ({ ...combination, [key]: value })));
  }
  const variantNames = combinations.map(combination => Object.entries(combination).map(([key, value]) => `${key}=${value}`).join(", "));
  const existing = componentVariants(host, source);
  const groupId = variantGroupOf(source) ?? `variant-group:${newComponentId()}`;
  if (existing.some(document => variantGroupOf(document) === groupId && variantNames.includes(variantNameOf(document)))) {
    throw new Error("Variant matrix contains an existing variant");
  }
  const sourceId = source.canvasId;
  const canonicalSource = { ...source, variantGroupId: groupId, variantName: variantNames[0] };
  const components = { ...(host.components ?? {}), [sourceId]: canonicalSource };
  const created = [];
  for (const variantName of variantNames.slice(1)) {
    const componentId = newComponentId();
    const document = duplicateComponentMaster(source, { componentId, variantGroupId: groupId, variantName });
    components[componentId] = document;
    created.push({ componentId, variantName });
  }
  return { document: { ...host, ...(host.canvasId === sourceId ? canonicalSource : {}), components }, groupId, created, variantNames };
}


/**
 * Adds axes to an existing variant set without rebuilding it: every variant
 * gets the new keys (first value), then the missing combinations are created.
 * Existing variants keep their canvas ids, so instances stay intact.
 */
export function extendVariantProperties(host, source, axes) {
  const entries = Object.entries(axes ?? {});
  if (!entries.length || entries.some(([, values]) => !Array.isArray(values) || !values.length || values.some(value => typeof value !== "string" || !value.trim()))) {
    throw new TypeError("Variant axes must contain non-empty arrays of strings");
  }
  const seenKeys = new Set();
  const names = entries.map(([rawKey, values]) => {
    const key = rawKey.trim();
    if (!key) throw new TypeError("Variant axis names must not be empty");
    if (seenKeys.has(key)) throw new TypeError(`Duplicate variant axis ${key}`);
    seenKeys.add(key);
    return [key, [...new Set(values.map(value => value.trim()))]];
  });
  let next = host;
  let canonical = componentVariants(next, source).find(doc => doc.canvasId === source.canvasId) ?? source;
  if (!variantGroupOf(canonical)) {
    const groupId = `variant-group:${newComponentId()}`;
    canonical = { ...canonical, variantGroupId: groupId };
    if (next.canvasId === canonical.canvasId) next = { ...next, ...canonical };
    else next = { ...next, components: { ...(next.components ?? {}), [canonical.canvasId]: canonical } };
  }
  if (!variantNameOf(canonical)) {
    canonical = { ...canonical, variantName: names.map(([key, values]) => `${key}=${values[0]}`).join(", ") };
    if (next.canvasId === canonical.canvasId) next = { ...next, ...canonical };
    else next = { ...next, components: { ...(next.components ?? {}), [canonical.canvasId]: canonical } };
  }
  // Fill in the new keys on every existing variant so names stay rectangular.
  const variants = componentVariants(next, canonical);
  const renamed = {};
  for (const variant of variants) {
    const parsed = parseVariantName(variant.variantName) ?? {};
    const filled = { ...parsed };
    for (const [key, values] of names) if (!(key in filled)) filled[key] = values[0];
    const name = Object.entries(filled).map(([key, value]) => `${key}=${value}`).join(", ");
    if (name !== variant.variantName) renamed[variant.canvasId] = { ...variant, variantName: name };
  }
  if (Object.keys(renamed).length) {
    const components = { ...(next.components ?? {}) };
    for (const [id, doc] of Object.entries(renamed)) {
      components[id] = doc;
      if (next.canvasId === id) next = { ...next, ...doc };
    }
    next = { ...next, components };
    canonical = componentVariants(next, { ...canonical, ...(renamed[canonical.canvasId] ?? {}) }).find(doc => doc.canvasId === canonical.canvasId) ?? canonical;
  }
  // Create the combinations that do not exist yet.
  const combinations = names.reduce((list, [key, values]) => list.flatMap(combination => values.map(value => ({ ...combination, [key]: value }))), [{}]);
  const namesOf = () => new Set(componentVariants(next, canonical).map(doc => variantNameOf(doc)));
  const created = [];
  for (const combination of combinations) {
    const variantName = Object.entries(combination).map(([key, value]) => `${key}=${value}`).join(", ");
    if (namesOf().has(variantName)) continue;
    const componentId = newComponentId();
    next = createVariantDocument(next, canonical, variantName, componentId);
    created.push({ componentId, variantName });
  }
  return { document: next, created };
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
