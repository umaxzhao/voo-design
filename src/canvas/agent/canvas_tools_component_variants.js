/** Variant tools for component masters and instances. */
import { newComponentId, variantNameOf, variantGroupOf, createVariantDocument, createVariantMatrix, matchVariantProperties, parseVariantName, variantProperties } from "../editor/component_variants.js";
import { createComponentVariantBatch as buildComponentVariantBatch } from "../editor/component_variant_batch.js";
import { invalidArgs, requireEditor, requireId, getDocument, commitDocument, componentEntries, requireComponent } from "./canvas_tools_component_shared.js";
import { requireInstance, swapInstance } from "./canvas_tools_component_instances.js";

export function createComponentVariant(args = {}) {
  const editor = requireEditor();
  const sourceComponentId = requireId(args.sourceComponentId, "sourceComponentId");
  const variantName = requireId(args.variantName, "variantName");
  if (args.name !== undefined && (typeof args.name !== "string" || args.name.trim() === "")) {
    invalidArgs(`Invalid argument "name": expected a non-empty string, got ${JSON.stringify(args.name)}`);
  }

  const source = requireComponent(editor, sourceComponentId);
  let variantGroupId = variantGroupOf(source) ?? `variant-group:${newComponentId()}`;
  const sourceVariantName = variantNameOf(source) ?? "Default";
  const entries = componentEntries(editor, {
    componentId: source.canvasId ?? sourceComponentId,
    document: { ...source, variantGroupId, variantName: sourceVariantName },
  });
  if (
    entries.some(
      (entry) =>
        variantGroupOf(entry.document) === variantGroupId &&
        variantNameOf(entry.document) === variantName,
    )
  ) {
    invalidArgs(`Invalid argument "variantName": ${JSON.stringify(variantName)} already exists in the group`);
  }

  const host = getDocument(editor);
  const componentId = newComponentId();
  const next = createVariantDocument(host, source, variantName, componentId);
  const variant = next.components[componentId];
  variantGroupId = variant.variantGroupId;
  if (args.name) variant.name = args.name;
  commitDocument(editor, next, "AI: Create component variant");
  return {
    ok: true,
    componentId: variant.canvasId,
    sourceComponentId,
    variantGroupId,
    variantName,
    name: variant.name ?? variantName,
  };
}

export function createComponentVariantMatrix(args = {}) {
  const editor = requireEditor();
  const sourceComponentId = requireId(args.sourceComponentId, "sourceComponentId");
  const source = requireComponent(editor, sourceComponentId);
  let result;
  try {
    result = createVariantMatrix(getDocument(editor), source, args.axes);
  } catch (error) {
    invalidArgs(error.message);
  }
  commitDocument(editor, result.document, "AI: Create component variant matrix");
  return { ok: true, sourceComponentId, variantGroupId: result.groupId, variants: [
    { componentId: source.canvasId, variantName: result.variantNames[0] },
    ...result.created,
  ] };
}

export function createComponentVariantsBatch(args = {}) {
  const editor = requireEditor();
  const sourceComponentId = requireId(args.sourceComponentId, "sourceComponentId");
  const source = requireComponent(editor, sourceComponentId);
  const host = getDocument(editor);
  let result;
  try {
    result = buildComponentVariantBatch(host, source, args.variants);
  } catch (error) {
    invalidArgs(error.message);
  }
  if (result.results.some(entry => entry.status === "created")) {
    commitDocument(editor, result.document, "AI: Create component variants batch");
  }
  return { ok: true, sourceComponentId, variantGroupId: result.groupId, results: result.results };
}

export function listInstanceVariantProperties(args = {}) {
  const editor = requireEditor();
  const instanceId = requireId(args.instanceId, "instanceId");
  const instance = requireInstance(editor, instanceId);
  const source = requireComponent(editor, instance.sourceCanvasId);
  const variants = componentEntries(editor, { componentId: source.canvasId, document: source })
    .filter(entry => variantGroupOf(entry.document) === variantGroupOf(source))
    .map(entry => entry.document);
  return {
    ok: true,
    instanceId,
    componentId: source.canvasId,
    properties: parseVariantName(source.variantName) ?? {},
    axes: variantProperties(variants) ?? [],
  };
}

export function listComponentVariants(args = {}) {
  const editor = requireEditor();
  if (args.componentId === undefined && args.variantGroupId === undefined) {
    invalidArgs('Invalid arguments: "componentId" or "variantGroupId" is required');
  }
  const componentId = args.componentId === undefined
    ? null
    : requireId(args.componentId, "componentId");
  const requestedGroupId = args.variantGroupId === undefined
    ? null
    : requireId(args.variantGroupId, "variantGroupId");

  let source = null;
  if (componentId) source = requireComponent(editor, componentId);
  const variantGroupId = requestedGroupId ?? variantGroupOf(source);
  const entries = componentEntries(editor, source ? {
    componentId: source.canvasId ?? componentId,
    document: source,
  } : null);
  const variants = entries
    .filter((entry) =>
      variantGroupId
        ? variantGroupOf(entry.document) === variantGroupId
        : entry.componentId === componentId,
    )
    .map((entry) => ({
      componentId: entry.componentId,
      variantName: variantNameOf(entry.document),
      name: entry.name,
      variantGroupId: variantGroupOf(entry.document),
    }))
    .sort((a, b) => String(a.variantName ?? "").localeCompare(String(b.variantName ?? "")));

  return { ok: true, variantGroupId: variantGroupId ?? null, variants };
}

export function setInstanceVariant(args = {}) {
  const editor = requireEditor();
  const instanceId = requireId(args.instanceId, "instanceId");
  const hasName = typeof args.variantName === "string" && args.variantName.trim() !== "";
  const hasProperties = args.properties && typeof args.properties === "object" && !Array.isArray(args.properties);
  if (hasName === Boolean(hasProperties)) invalidArgs('Invalid arguments: give exactly one of "variantName" or "properties"');
  const variantName = hasName ? args.variantName : null;
  const instance = requireInstance(editor, instanceId);
  const source = requireComponent(editor, instance.sourceCanvasId);
  const variantGroupId = variantGroupOf(source);
  if (!variantGroupId) {
    invalidArgs(`Invalid argument "instanceId": the instance's component has no variants`);
  }

  if (hasName && typeof editor.setInstanceVariant === "function") {
    try {
      const result = editor.setInstanceVariant({ instanceId, variantName });
      const normalized = normalizeInstanceResult(result, instanceId);
      if (normalized) return { ...normalized, variantName, variantGroupId };
    } catch (error) {
      mapEngineError(error, '"instanceId"/"variantName"');
    }
  }

  const entries = componentEntries(editor, {
    componentId: source.canvasId ?? instance.sourceCanvasId,
    document: source,
  });
  const groupVariants = entries.filter(entry => variantGroupOf(entry.document) === variantGroupId);
  const match = hasName ? groupVariants.find(
    (entry) =>
      variantGroupOf(entry.document) === variantGroupId &&
      variantNameOf(entry.document) === variantName,
  ) : groupVariants.find(entry => matchVariantProperties([entry.document], args.properties));
  if (!match) {
    invalidArgs(`Invalid variant selection in group ${JSON.stringify(variantGroupId)}`);
  }
  if (match.componentId === instance.sourceCanvasId) {
    return {
      ok: true,
      instanceId,
      layerId: instanceId,
      componentId: match.componentId,
      previousComponentId: match.componentId,
      variantName: variantNameOf(match.document),
      variantGroupId,
      unchanged: true,
    };
  }
  return {
    ...swapInstance({ instanceId, componentId: match.componentId }),
    variantName: variantNameOf(match.document),
    variantGroupId,
  };
}

