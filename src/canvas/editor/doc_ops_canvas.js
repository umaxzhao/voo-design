import {
  MIN_DOC_SIZE,
  normalizeCornerRadius,
} from "./scene_model_core.js";
import {
  NODE_KIND,
  isRegionNode,
} from "./scene_model.js";
import { nodeAABB, resizeDocument as resizeSize } from "./scene_geometry.js";
import { MAX_CANVAS_SIZE } from "./canvas_presets.js";
import { TOOL } from "./editor_constants.js";
import { getCanvasType } from "./canvas-composition-model.js";
import { commitEditorDocument } from "../undo-action-contracts.js";

/**
 * Appends a node on top of its own plane.
 *
 * Reference regions always float above the artwork, so the array keeps them in
 * a block at the end and a new drawing node slots in underneath. Array order
 * stays paint order, which is what lets hit-testing and layer reordering work
 * off the array alone.
 */
export function setBackgroundColor(doc, color) {
  return { ...doc, backgroundColor: color };
}

/**
 * Crops the document to a rectangle.
 *
 * There is no crop primitive: the rectangle becomes the new page and every
 * node shifts by the same offset, so content keeps its position relative to
 * what the user framed. Anything now fully outside the page is dropped —
 * it can never be seen or selected again.
 */
export function cropDocument(doc, rect) {
  const left = Math.max(0, Math.round(rect.x));
  const top = Math.max(0, Math.round(rect.y));
  const width = Math.round(Math.min(rect.width, doc.width - left));
  const height = Math.round(Math.min(rect.height, doc.height - top));
  if (width < MIN_DOC_SIZE || height < MIN_DOC_SIZE) return doc;

  const nodes = doc.nodes
    .map((node) => ({ ...node, x: node.x - left, y: node.y - top }))
    .filter((node) => {
      // The rotated AABB decides survival: a rotated node whose corners poke
      // inside the frame stays even when its stored box misses, and one whose
      // stored box clips the frame but whose shape misses it is dropped. No
      // transform, no change — the AABB is the stored box.
      const bounds = nodeAABB(node);
      return (
        bounds.x + bounds.width > 0 &&
        bounds.y + bounds.height > 0 &&
        bounds.x < width &&
        bounds.y < height
      );
    });

  return { ...doc, width, height, nodes };
}

/**
 * Resizes the page itself by dragging its edges.
 *
 * Contents keep their offset from the top-left corner, so no node moves; the
 * caller compensates the viewport when the left or top edge is the one being
 * dragged, which pins the opposite edge on screen.
 */
export function resizeDocumentEdges(doc, edges, deltaX, deltaY, options = {}) {
  const size = resizeSize(doc, edges, deltaX, deltaY, MIN_DOC_SIZE, options);
  if (size.width === doc.width && size.height === doc.height) return doc;
  let nodes = doc.nodes;
  if (options.fromCentre) {
    const dx = (size.width - doc.width) / 2;
    const dy = (size.height - doc.height) / 2;
    nodes = doc.nodes.map((node) => ({
      ...node,
      x: node.x + dx,
      y: node.y + dy,
    }));
  }
  return { ...doc, width: size.width, height: size.height, nodes };
}

/**
 * Sets the page to an exact pixel size.
 *
 * Contents can either keep their original dimensions and be centred
 * (default, scaleMode: "none"), or scale proportionally to match the new
 * canvas width (scaleMode: "width") or height (scaleMode: "height").
 */
export function setDocumentSize(doc, width, height, options = {}) {
  const w = Math.max(MIN_DOC_SIZE, Math.min(MAX_CANVAS_SIZE, Math.round(width)));
  const h = Math.max(MIN_DOC_SIZE, Math.min(MAX_CANVAS_SIZE, Math.round(height)));
  const scaleMode = options.scaleMode ?? "none";

  if (scaleMode === "none" || (w === doc.width && h === doc.height)) {
    const dx = (w - doc.width) / 2;
    const dy = (h - doc.height) / 2;
    const nodes = doc.nodes.map((node) => ({
      ...node,
      x: node.x + dx,
      y: node.y + dy,
    }));
    return { ...doc, width: w, height: h, nodes };
  }

  const scale = scaleMode === "width" ? w / doc.width : h / doc.height;
  if (scale <= 0 || !Number.isFinite(scale)) {
    const dx = (w - doc.width) / 2;
    const dy = (h - doc.height) / 2;
    const nodes = doc.nodes.map((node) => ({
      ...node,
      x: node.x + dx,
      y: node.y + dy,
    }));
    return { ...doc, width: w, height: h, nodes };
  }

  // Calculate opposite-axis centring offset
  let dx = 0;
  let dy = 0;
  if (scaleMode === "width") {
    const scaledHeight = doc.height * scale;
    dy = (h - scaledHeight) / 2;
  } else {
    const scaledWidth = doc.width * scale;
    dx = (w - scaledWidth) / 2;
  }

  const nodes = doc.nodes.map((node) => {
    // Regions attached to a host image should not be scaled directly,
    // as their coordinates are host-local and the host itself is scaled.
    if (isRegionNode(node) && node.hostId) {
      return node;
    }

    const x = Math.round(node.x * scale + dx);
    const y = Math.round(node.y * scale + dy);
    const width = Math.max(1, Math.round((node.width ?? 0) * scale));
    const height = Math.max(1, Math.round((node.height ?? 0) * scale));

    const scaled = {
      ...node,
      x,
      y,
      width,
      height,
    };

    if (typeof node.strokeWidth === "number" && node.strokeWidth > 0) {
      scaled.strokeWidth = Math.max(1, Math.round(node.strokeWidth * scale));
    }
    if (typeof node.cornerRadius === "number" && node.cornerRadius > 0) {
      scaled.cornerRadius = Math.round(node.cornerRadius * scale);
    } else if (node.cornerRadius && typeof node.cornerRadius === "object") {
      const radii = normalizeCornerRadius(node.cornerRadius);
      const corners =
        typeof radii === "number"
          ? { tl: radii, tr: radii, br: radii, bl: radii }
          : radii;
      scaled.cornerRadius = normalizeCornerRadius(
        Object.fromEntries(
          Object.entries(corners).map(([corner, radius]) => [
            corner,
            Math.round(radius * scale),
          ]),
        ),
      );
    }
    if (node.kind === NODE_KIND.TEXT || typeof node.text === "string") {
      if (typeof node.fontSize === "number" && node.fontSize > 0) {
        scaled.fontSize = Math.max(6, Math.round(node.fontSize * scale));
      }
      if (typeof node.letterSpacing === "number" && node.letterSpacing !== 0) {
        scaled.letterSpacing = Math.round(node.letterSpacing * scale);
      }
    }
    if (node.shadow && typeof node.shadow === "object") {
      scaled.shadow = {
        ...node.shadow,
        blur: Math.round((node.shadow.blur ?? 0) * scale),
        offsetX: Math.round((node.shadow.offsetX ?? 0) * scale),
        offsetY: Math.round((node.shadow.offsetY ?? 0) * scale),
      };
    }

    return scaled;
  });

  return { ...doc, width: w, height: h, nodes };
}


/**
 * Prompts user confirmation before deleting a canvas frame when it contains
 * unsaved modifications.
 */
export function confirmCanvasDelete({ isDirty, confirmFn, message }) {
  if (!isDirty) return true;
  if (typeof confirmFn !== "function") return true;
  return Boolean(confirmFn(message));
}
