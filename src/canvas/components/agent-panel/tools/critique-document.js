// Document resolution and canvas geometry seam.
import { NODE_KIND } from "../../../editor/scene_doc_factory.js";
import { resolveTargetEditorBridge } from "../../../editor/editor_target_resolver.js";

export function getSafeMargin(doc, args, brand = null) {
  const sm =
    args?.safeMargin ?? doc?.safeMargin ?? doc?.safeArea ?? brand?.safeArea;
  if (typeof sm === "number")
    return { top: sm, right: sm, bottom: sm, left: sm };
  if (sm && typeof sm === "object") {
    return {
      top: Number(sm.top ?? 16),
      right: Number(sm.right ?? 16),
      bottom: Number(sm.bottom ?? 16),
      left: Number(sm.left ?? 16),
    };
  }
  return { top: 16, right: 16, bottom: 16, left: 16 };
}

export function isBackgroundNode(node, docWidth, docHeight) {
  if (!node) return false;
  if (node.isBackground === true || node.role === "background") return true;
  if (typeof node.name === "string" && node.name.toLowerCase() === "background")
    return true;
  const x = Number(node.x ?? 0);
  const y = Number(node.y ?? 0);
  const w = Number(node.width ?? node.w ?? 0);
  const h = Number(node.height ?? node.h ?? 0);
  if (
    x === 0 &&
    y === 0 &&
    docWidth > 0 &&
    docHeight > 0 &&
    w === docWidth &&
    h === docHeight
  ) {
    return (
      node.kind === NODE_KIND.RECT ||
      node.kind === NODE_KIND.IMAGE ||
      node.kind === "rect" ||
      node.kind === "image"
    );
  }
  return false;
}

export function resolveDocument(args, context) {
  if (args?.document && typeof args.document === "object") return args.document;
  if (Array.isArray(args?.nodes) || Array.isArray(args?.layers)) {
    return {
      width: args.width ?? args.targetSpecs?.width ?? 1920,
      height: args.height ?? args.targetSpecs?.height ?? 1080,
      nodes: args.nodes ?? args.layers ?? [],
      targetSpecs: args.targetSpecs,
      safeMargin: args.safeMargin,
      backgroundColor: args.backgroundColor,
    };
  }
  const store = context?.getStore?.();
  if (store) {
    if (typeof store.getDocument === "function") {
      const doc = store.getDocument();
      if (doc) return doc;
    }
    try {
      const bridge = resolveTargetEditorBridge(store);
      if (bridge?.engine?.getDocument) {
        const doc = bridge.engine.getDocument();
        if (doc) return doc;
      }
    } catch {
      // Preserve the existing defensive boundary when no editor bridge is available.
    }
    if (store.activeDesignDocument) return store.activeDesignDocument;
  }
  if (typeof context?.getCanvasState === "function") {
    const state = context.getCanvasState();
    if (state?.document) return state.document;
  }
  return null;
}
