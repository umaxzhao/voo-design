/** Document-scoped color variables and their live layer bindings. */

const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;

export function normalizeColorVariables(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((item) => {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const color = typeof item?.value === "string" ? item.value.trim() : "";
    if (!id || !name || !HEX_COLOR.test(color) || seen.has(id)) return [];
    seen.add(id);
    return [{ id, name, value: color }];
  });
}

export function addColorVariable(doc, variable) {
  const existing = normalizeColorVariables(doc.colorVariables);
  const [valid] = normalizeColorVariables([variable]);
  if (!valid || existing.some((item) => item.id === valid.id)) {
    throw new Error("color-variable-invalid");
  }
  return { ...doc, colorVariables: [...existing, valid] };
}

export function bindColorVariable(doc, nodeId, variableId, target = "fill") {
  const variable = normalizeColorVariables(doc.colorVariables).find(
    (item) => item.id === variableId,
  );
  if (variableId && !variable) throw new Error("color-variable-missing");
  if (!doc.nodes.some((node) => node.id === nodeId)) {
    throw new Error("color-variable-node-missing");
  }
  const isStroke = target === "stroke";
  const propKey = isStroke ? "stroke" : "fill";
  const idKey = isStroke ? "strokeVariableId" : "fillVariableId";
  return {
    ...doc,
    nodes: doc.nodes.map((node) =>
      node.id === nodeId
        ? variable
          ? { ...node, [propKey]: variable.value, [idKey]: variable.id }
          : { ...node, [idKey]: null }
        : node,
    ),
  };
}

export function deleteColorVariable(doc, variableId) {
  const variables = normalizeColorVariables(doc.colorVariables);
  if (!variables.some((item) => item.id === variableId)) {
    throw new Error("color-variable-missing");
  }
  return {
    ...doc,
    colorVariables: variables.filter((item) => item.id !== variableId),
    nodes: doc.nodes.map((node) => {
      let updated = node;
      if (node.fillVariableId === variableId) {
        updated = { ...updated, fillVariableId: null };
      }
      if (node.strokeVariableId === variableId) {
        updated = { ...updated, strokeVariableId: null };
      }
      return updated;
    }),
  };
}

export function updateColorVariable(doc, variableId, patch) {
  const variables = normalizeColorVariables(doc.colorVariables);
  const current = variables.find((item) => item.id === variableId);
  if (!current) throw new Error("color-variable-missing");
  const [next] = normalizeColorVariables([{ ...current, ...patch }]);
  if (!next) throw new Error("color-variable-invalid");
  return {
    ...doc,
    colorVariables: variables.map((item) =>
      item.id === variableId ? next : item,
    ),
    nodes: doc.nodes.map((node) => {
      let updated = node;
      if (node.fillVariableId === variableId) {
        updated = { ...updated, fill: next.value };
      }
      if (node.strokeVariableId === variableId) {
        updated = { ...updated, stroke: next.value };
      }
      return updated;
    }),
  };
}

/** Materialized designs keep their selected system palette editable as tokens. */
export function seedDesignSystemColorVariables(doc, system) {
  const colors = system?.tokens?.primitive?.colors;
  if (!colors || !system.id) return doc;
  const variables = Object.entries(colors).map(([name, value]) => ({
    id: `system:${system.id}:${name}`,
    name,
    value,
  }));
  const firstByColor = new Map();
  for (const variable of variables) {
    const color = variable.value.toLowerCase();
    if (!firstByColor.has(color)) firstByColor.set(color, variable);
  }
  return {
    ...doc,
    colorVariables: variables,
    nodes: doc.nodes.map((node) => {
      const matched = firstByColor.get(String(node.fill ?? "").toLowerCase());
      return matched ? { ...node, fillVariableId: matched.id } : node;
    }),
  };
}
