/**
 * Component typed property definitions and instance binding utilities.
 * Supports:
 *   - "boolean": toggles visibility or a conditional layer
 *   - "text": string property bound to text content
 *   - "instanceSwap": swaps a nested instance's source component
 *   - "variant": discrete variant property axis
 */

export const COMPONENT_PROP_TYPES = Object.freeze({
  BOOLEAN: "boolean",
  TEXT: "text",
  INSTANCE_SWAP: "instanceSwap",
  VARIANT: "variant",
});

/**
 * Normalizes a component's componentPropertyDefinitions map.
 */
export function normalizeComponentPropertyDefinitions(defs) {
  if (!defs || typeof defs !== "object" || Array.isArray(defs)) return {};
  const clean = {};
  for (const [key, prop] of Object.entries(defs)) {
    if (!prop || typeof prop !== "object") continue;
    const type = Object.values(COMPONENT_PROP_TYPES).includes(prop.type)
      ? prop.type
      : COMPONENT_PROP_TYPES.TEXT;
    clean[key] = {
      type,
      defaultValue: prop.defaultValue,
      ...(prop.preferredValues ? { preferredValues: [...prop.preferredValues] } : {}),
    };
  }
  return clean;
}

/**
 * Sets or updates a component property definition on a master component document.
 */
export function setComponentPropertyDefinition(componentDoc, name, {
  type = COMPONENT_PROP_TYPES.TEXT,
  defaultValue = "",
  preferredValues = null,
} = {}) {
  if (!componentDoc) throw new TypeError("componentDoc is required");
  const key = String(name ?? "").trim();
  if (!key) throw new TypeError("Property name cannot be empty");

  const existing = normalizeComponentPropertyDefinitions(
    componentDoc.componentPropertyDefinitions,
  );
  const next = {
    ...existing,
    [key]: {
      type,
      defaultValue,
      ...(preferredValues && Array.isArray(preferredValues)
        ? { preferredValues }
        : {}),
    },
  };
  return {
    ...componentDoc,
    componentPropertyDefinitions: next,
  };
}

/**
 * Removes a component property definition from a master component.
 */
export function removeComponentPropertyDefinition(componentDoc, name) {
  if (!componentDoc) return componentDoc;
  const key = String(name ?? "").trim();
  const existing = normalizeComponentPropertyDefinitions(
    componentDoc.componentPropertyDefinitions,
  );
  if (!existing[key]) return componentDoc;
  const next = { ...existing };
  delete next[key];
  return {
    ...componentDoc,
    componentPropertyDefinitions: next,
  };
}

/**
 * Resolves an instance's effective property values combining component definitions
 * with instance-level `componentProperties` overrides.
 */
export function resolveInstanceComponentProperties(instanceNode, componentDoc) {
  const defs = normalizeComponentPropertyDefinitions(
    componentDoc?.componentPropertyDefinitions,
  );
  const overrides = instanceNode?.componentProperties ?? {};
  const result = {};
  for (const [key, def] of Object.entries(defs)) {
    result[key] = {
      type: def.type,
      value: overrides[key] !== undefined ? overrides[key] : def.defaultValue,
      defaultValue: def.defaultValue,
      preferredValues: def.preferredValues ?? null,
    };
  }
  return result;
}

/**
 * Patches an instance with a new property value.
 */
export function setInstanceComponentProperty(instanceNode, key, value) {
  if (!instanceNode || instanceNode.kind !== "canvasInstance") {
    throw new TypeError("A canvasInstance node is required");
  }
  const current = instanceNode.componentProperties ?? {};
  return {
    ...instanceNode,
    componentProperties: {
      ...current,
      [key]: value,
    },
  };
}
