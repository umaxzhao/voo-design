import { figmaGuid, figmaColor } from "./figma-value.js";
import { normalizeVariablesV2 } from "../editor/scene_variables.js";

const idOf = (prefix, guid) => `${prefix}:${figmaGuid(guid)}`;

function valueOf(record, type) {
  const value = record?.variableData?.value;
  if (!value) return undefined;
  if (type === "color") {
    const color = figmaColor(value.colorValue);
    if (!color) return undefined;
    return color.opacity >= 100 ? color.hex : `${color.hex}${Math.round(color.opacity * 2.55).toString(16).padStart(2, "0")}`;
  }
  return value[{ number: "numberValue", string: "stringValue", boolean: "booleanValue" }[type]];
}

/** Variable records are document metadata; they must never become artwork. */
export function figmaVariables(message) {
  const changes = message.nodeChanges ?? [];
  const sets = changes.filter(node => node.type === "VARIABLE_SET");
  if (!sets.length) return null;
  const collections = sets.map(node => ({
    id: idOf("figma-collection", node.guid), name: node.name,
    modes: (node.variableSetModes ?? []).map(mode => ({ id: idOf("figma-mode", mode.id), name: mode.name })),
    variables: [],
  }));
  const byKey = new Map(sets.flatMap((node, index) => [
    [figmaGuid(node.guid), collections[index]],
    ...(node.key ? [[node.key, collections[index]]] : []),
  ]));
  for (const node of changes) {
    if (node.type !== "VARIABLE") continue;
    const ref = node.variableSetID;
    const collection = byKey.get(ref?.assetRef?.key ?? figmaGuid(ref?.guid ?? ref));
    const type = { COLOR: "color", FLOAT: "number", NUMBER: "number", STRING: "string", BOOLEAN: "boolean" }[node.variableResolvedType];
    if (!collection || !type) continue;
    const valuesByMode = {};
    for (const entry of node.variableDataValues?.entries ?? []) {
      const value = valueOf(entry, type);
      if (value !== undefined) valuesByMode[idOf("figma-mode", entry.modeID)] = value;
    }
    collection.variables.push({ id: idOf("figma-variable", node.guid), name: node.name, type, valuesByMode });
  }
  return normalizeVariablesV2({ version: 2, collections });
}
