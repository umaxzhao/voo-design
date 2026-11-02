/** Shared asset validation, geometry and native node creation. */
export const TOOL_ERROR = Object.freeze({
  NO_EDITOR: "agentNoEditor",
  INVALID_ARGS: "agentInvalidArgs",
  NODE_NOT_FOUND: "agentNodeNotFound",
  NO_IMAGE_MODEL: "agentNoImageModel",
  VECTOR_NEEDS_API_MODEL: "agentVectorNeedsApiModel",
  VECTOR_EMPTY: "agentVectorEmpty",
  IMAGE_SOURCE_REQUIRED: "agentImageSourceRequired",
  STOCK_UNAVAILABLE: "agentStockUnavailable"
});
export const SETTING = Object.freeze({
  IMAGE_PROVIDER_ID: "agent.imageProviderId",
  IMAGE_MODEL_ID: "agent.imageModelId"
});
export function toolError(code, message) {
  return Object.assign(new Error(message ? `${code}: ${message}` : code), {
    code
  });
}
export function requireEditor() {
  const editor = typeof window !== "undefined" ? window.__vooEditor : null;
  if (!editor) throw toolError(TOOL_ERROR.NO_EDITOR);
  return editor;
}

/** Downloads must not apply into a different document after an editor switch. */
export function assetTargetGuard(editor, signal) {
  const activeId = globalThis.window?.__vooStore?.activeDocumentId;
  return () => {
    signal?.throwIfAborted();
    const host = globalThis.window;
    if (host?.__vooEditor && host.__vooEditor !== editor || activeId && activeId !== host?.__vooStore?.activeDocumentId) {
      throw toolError(TOOL_ERROR.INVALID_ARGS, "The target document changed while the asset was loading.");
    }
  };
}
export function invalidArgs(code, message) {
  throw toolError(code, message);
}
export function documentOf(editor) {
  const doc = editor.getDoc?.() ?? editor.getDocument?.() ?? null;
  if (!doc || !Array.isArray(doc.nodes)) invalidArgs(TOOL_ERROR.INVALID_ARGS, "No design document is open.");
  return doc;
}
export function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function nodeOf(editor, layerId) {
  if (typeof layerId !== "string" || !layerId.trim()) return null;
  return documentOf(editor).nodes.find(node => node.id === layerId) ?? null;
}

/** Default placement for generated art: right of every top-level layer. */
export function placementFor(editor, width, height) {
  const doc = documentOf(editor);
  const topLevel = (doc.nodes ?? []).filter(node => !node.parentId);
  let right = 0;
  for (const node of topLevel) {
    const x = finiteOrNull(node.x);
    const w = finiteOrNull(node.width);
    if (x !== null && w !== null) right = Math.max(right, x + w);
  }
  return {
    x: topLevel.length ? Math.round(right + 80) : 0,
    y: 0,
    width,
    height
  };
}

/** Translate/scale an M/L/Z-only path (the tracer's output format). */
export function transformPathData(d, {
  x = 0,
  y = 0,
  scaleX = 1,
  scaleY = 1
} = {}) {
  if (typeof d !== "string" || !d.trim()) return "";
  // The tracer emits absolute M/L/Z only. Z needs no transform, so rewrite each
  // M/L coordinate pair and leave every other character untouched.
  return d.replace(/([ML])\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)[ ,]+(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi, (match, letter, rawX, rawY) => {
    const nextX = Number(rawX) * scaleX + x;
    const nextY = Number(rawY) * scaleY + y;
    return `${letter}${round(nextX)},${round(nextY)}`;
  });
}
function round(value) {
  return Math.round(value * 100) / 100;
}
export function createVectorNodes(editor, nodes, origin) {
  const created = [];
  for (const spec of nodes) {
    if (spec.kind === "rect") {
      const node = editor.addRectAt?.({
        x: origin.x + spec.x,
        y: origin.y + spec.y
      });
      if (!node?.id) continue;
      const patch = {
        width: Math.max(1, spec.width),
        height: Math.max(1, spec.height),
        ...(spec.rx ? {
          cornerRadius: spec.rx
        } : {}),
        ...(spec.fill ? {
          fill: spec.fill
        } : {}),
        ...(spec.stroke ? {
          stroke: spec.stroke
        } : {}),
        ...(spec.strokeWidth ? {
          strokeWidth: spec.strokeWidth
        } : {}),
        ...(spec.name ? {
          name: spec.name
        } : {})
      };
      editor.updateNode?.(node.id, patch);
      created.push(node.id);
      continue;
    }
    if (spec.kind === "path" && spec.d) {
      const result = editor.addPenNode?.({
        svgD: spec.d,
        x: origin.x,
        y: origin.y,
        ...(spec.fill ? {
          fill: spec.fill
        } : {}),
        ...(spec.stroke ? {
          stroke: spec.stroke
        } : {}),
        ...(spec.strokeWidth ? {
          strokeWidth: spec.strokeWidth
        } : {})
      });
      if (result?.nodeId) {
        if (spec.name) editor.updateNode?.(result.nodeId, {
          name: spec.name
        });
        created.push(result.nodeId);
      }
    }
  }
  return created;
}
export function groupNodes(editor, ids, name) {
  if (ids.length < 2) {
    if (ids.length === 1 && name) editor.updateNode?.(ids[0], {
      name
    });
    return ids[0] ?? null;
  }
  editor.selectExactly?.(ids);
  const result = editor.groupSelection?.();
  const groupId = typeof result === "string" ? result : result?.id ?? editor.getSelectedId?.() ?? null;
  if (groupId && name) editor.updateNode?.(groupId, {
    name
  });
  return groupId;
}
