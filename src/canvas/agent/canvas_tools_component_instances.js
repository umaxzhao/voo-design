/** Instance override, reset, and swap tools. */
import { switchVariantDocument } from "../editor/component_variants.js";
import { OVERRIDE_FIELDS, clearAllOverrides, overridableNodes, setNodeOverride } from "../editor/instance-overrides.js";
import { wouldCreateCanvasCycle } from "../editor/canvas-instance-graph.js";
import { INSTANCE_LAYOUT_MODES, INSTANCE_PLAYBACK_MODES } from "../editor/canvas-composition-nodes.js";
import { invalidArgs, nodeNotFound, apiMissing, mapEngineError, requireEditor, requireId, requireNode, getDocument, commitDocument, resolveComponentDocument, INSTANCE_NODE_KIND, INSTANCE_RECORD_FIELDS } from "./canvas_tools_component_shared.js";

export function requireInstance(editor, instanceId) {
  const node = requireNode(editor, instanceId);
  if (node.kind !== INSTANCE_NODE_KIND) {
    invalidArgs(`Invalid argument "instanceId": ${JSON.stringify(instanceId)} is not a component instance (expected kind canvasInstance)`);
  }
  return node;
}

function replaceInstanceNode(doc, instanceId, patch) {
  return {
    ...doc,
    nodes: doc.nodes.map((node) =>
      node.id === instanceId ? { ...node, ...patch } : node,
    ),
  };
}

/** Engine-provided instance override/swap methods take precedence, when wired. */
function normalizeInstanceResult(result, instanceId) {
  if (!result) return null;
  if (result === true || typeof result !== "object") {
    return { ok: true, instanceId, layerId: instanceId };
  }
  const id = result.instanceId ?? result.id ?? instanceId;
  return { ok: true, instanceId: id, layerId: id };
}

export function setInstanceOverride(args = {}) {
  const editor = requireEditor();
  const instanceId = requireId(args.instanceId, "instanceId");
  const patch = args.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) invalidArgs(`Invalid argument "patch": expected a plain object, got ${JSON.stringify(patch)}`);
  const keys = Object.keys(patch);
  if (keys.length === 0) invalidArgs(`Invalid argument "patch": expected a non-empty object`);
  const instance = requireInstance(editor, instanceId);

  if (typeof editor.setInstanceOverride === "function") {
    try {
      const result = editor.setInstanceOverride({
        instanceId,
        childId: args.childId ?? null,
        patch,
      });
      const normalized = normalizeInstanceResult(result, instanceId);
      if (normalized) return normalized;
    } catch (error) {
      mapEngineError(error, '"instanceId"/"childId"/"patch"');
    }
  }

  const childId = args.childId === undefined || args.childId === null
    ? null
    : requireId(args.childId, "childId");
  const doc = getDocument(editor);
  let targetChildId = childId;
  let next;

  if (childId || keys.every((key) => OVERRIDE_FIELDS.includes(key))) {
    if (!childId) {
      // A single overridable layer is unambiguous; otherwise the agent must
      // name the component layer the patch belongs to.
      const master = resolveComponentDocument(editor, instance.sourceCanvasId);
      const target = master ? overridableNodes(master) : [];
      if (target.length !== 1) {
        invalidArgs(`Invalid argument "childId": required to override a component layer`);
      }
      targetChildId = target[0].node.id;
    } else {
      const master = resolveComponentDocument(editor, instance.sourceCanvasId);
      if (master && !master.nodes.some((node) => node.id === childId)) {
        nodeNotFound(childId);
      }
    }
    let overrides;
    try {
      overrides = setNodeOverride(instance.instance ?? {}, targetChildId, patch);
    } catch (error) {
      mapEngineError(error, '"childId"/"patch"');
    }
    next = replaceInstanceNode(doc, instanceId, { instance: overrides });
  } else {
    if (!keys.every((key) => INSTANCE_RECORD_FIELDS.includes(key))) {
      invalidArgs(`Invalid argument "patch": expected keys within ${INSTANCE_RECORD_FIELDS.join(", ")}, got ${keys.join(", ")}`);
    }
    for (const key of keys) {
      const value = patch[key];
      if (key === "layoutMode" && !INSTANCE_LAYOUT_MODES.includes(value)) {
        invalidArgs(`Invalid argument "patch.layoutMode": expected one of ${INSTANCE_LAYOUT_MODES.join(", ")}, got ${JSON.stringify(value)}`);
      }
      if (key === "playbackMode" && !INSTANCE_PLAYBACK_MODES.includes(value)) {
        invalidArgs(`Invalid argument "patch.playbackMode": expected one of ${INSTANCE_PLAYBACK_MODES.join(", ")}, got ${JSON.stringify(value)}`);
      }
      if (key === "playbackStart" && !Number.isFinite(value)) invalidArgs(`Invalid argument "patch.playbackStart": expected a finite number, got ${JSON.stringify(value)}`);
      if (key !== "playbackStart" && typeof value !== "string" && value !== null) {
        invalidArgs(`Invalid argument "patch.${key}": expected a string or null, got ${JSON.stringify(value)}`);
      }
    }
    const record = { ...(instance.instance ?? {}), ...patch };
    next = replaceInstanceNode(doc, instanceId, { instance: record });
  }

  commitDocument(editor, next, "AI: Set instance override");
  return {
    ok: true,
    instanceId,
    layerId: instanceId,
    childId: targetChildId,
  };
}

export function resetInstanceOverrides(args = {}) {
  const editor = requireEditor();
  const instanceId = requireId(args.instanceId, "instanceId");
  const instance = requireInstance(editor, instanceId);

  if (typeof editor.resetInstanceOverrides === "function") {
    try {
      const result = editor.resetInstanceOverrides(instanceId);
      const normalized = normalizeInstanceResult(result, instanceId);
      if (normalized) return normalized;
    } catch (error) {
      mapEngineError(error, '"instanceId"');
    }
  }

  const doc = getDocument(editor);
  // Overrides live on the instance record; its view/camera fields are kept.
  const record = clearAllOverrides(instance.instance ?? {});
  const next = {
    ...doc,
    nodes: doc.nodes.map((node) =>
      node.id === instanceId ? { ...node, instance: record } : node,
    ),
  };
  commitDocument(editor, next, "AI: Reset instance overrides");
  return { ok: true, instanceId, layerId: instanceId };
}

export function swapInstance(args = {}) {
  const editor = requireEditor();
  const instanceId = requireId(args.instanceId, "instanceId");
  const componentId = requireId(args.componentId, "componentId");
  const instance = requireInstance(editor, instanceId);

  if (typeof editor.swapInstance === "function") {
    try {
      const result = editor.swapInstance(instanceId, componentId);
      const normalized = normalizeInstanceResult(result, instanceId);
      if (normalized) return { ...normalized, componentId };
    } catch (error) {
      mapEngineError(error, '"instanceId"/"componentId"');
    }
  }

  const doc = getDocument(editor);
  if (instance.sourceCanvasId === componentId) {
    invalidArgs(`Invalid argument "componentId": the instance already uses ${JSON.stringify(componentId)}`);
  }
  const resolveCanvas = (id) => resolveComponentDocument(editor, id);
  if (wouldCreateCanvasCycle(doc.canvasId, componentId, resolveCanvas)) {
    invalidArgs("Swapping to this component would create a canvas cycle");
  }
  const master = resolveComponentDocument(editor, componentId);
  if (!master) {
    apiMissing(`The main component ${componentId} is not available`);
  }

  // Overrides pointed at the old master's layer ids, so they start over;
  // the instance's view/camera fields are kept.
  const next = switchVariantDocument(doc, instanceId, { canvasId: componentId });
  commitDocument(editor, next, "AI: Swap instance");
  return {
    ok: true,
    instanceId,
    layerId: instanceId,
    componentId,
    previousComponentId: instance.sourceCanvasId,
  };
}

/* ------------------------------------------------------------------ */
