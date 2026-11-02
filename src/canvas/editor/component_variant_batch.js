import {
  componentVariants,
  duplicateComponentMaster,
  newComponentId,
  variantGroupOf,
  variantNameOf,
} from "./component_variants.js";

function variantNameFromProperties(properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    throw new TypeError("Properties must be an object of non-empty strings");
  }
  const entries = Object.entries(properties);
  if (!entries.length || entries.some(([key, value]) => !key.trim() || typeof value !== "string" || !value.trim())) {
    throw new TypeError("Properties must contain non-empty string keys and values");
  }
  return entries.map(([key, value]) => `${key.trim()}=${value.trim()}`).join(", ");
}

/** Build as many valid siblings as possible without mutating the host document. */
export function createComponentVariantBatch(host, source, propertySets) {
  if (!Array.isArray(propertySets)) throw new TypeError("Variant property sets must be an array");
  const sourceId = source?.canvasId;
  if (!sourceId || !Array.isArray(source?.nodes)) throw new TypeError("A component document with nodes is required");

  const canonicalSource = componentVariants(host, source).find(document => document.canvasId === sourceId) ?? source;
  const groupId = variantGroupOf(canonicalSource) ?? `variant-group:${newComponentId()}`;
  const sourceName = variantNameOf(canonicalSource) ?? "Default";
  const components = { ...(host.components ?? {}), [sourceId]: { ...canonicalSource, variantGroupId: groupId, variantName: sourceName } };
  const existingNames = new Set(componentVariants(host, canonicalSource).map(variantNameOf).filter(Boolean));
  const namesInBatch = new Set();
  const results = propertySets.map((properties, index) => {
    try {
      const variantName = variantNameFromProperties(properties);
      if (existingNames.has(variantName) || namesInBatch.has(variantName)) throw new Error(`Variant ${variantName} already exists`);
      namesInBatch.add(variantName);
      const componentId = newComponentId();
      const document = duplicateComponentMaster(canonicalSource, { componentId, variantGroupId: groupId, variantName });
      components[componentId] = document;
      return { index, status: "created", componentId, variantName };
    } catch (error) {
      return { index, status: "error", error: error.message };
    }
  });
  return {
    document: { ...host, ...(host.canvasId === sourceId ? components[sourceId] : {}), components },
    groupId,
    results,
  };
}
