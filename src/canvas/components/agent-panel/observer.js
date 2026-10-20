/**
 * Multi-modal Canvas Observer (P0-7).
 *
 * Provides structured object extraction and visual screenshot observation across
 * three scopes: "viewport", "selection", and "region". Supports high-detail
 * 2x observation for selection and regional targets with local coordinate mapping.
 *
 * Design rules:
 * - Pure module: NO React imports (CLAUDE.md §2).
 * - Bounded observation: supports regional and object-targeted queries to prevent
 *   bloating LLM context with full document trees.
 * - Thumbnail scaling: ensures screenshot longest edge <= 1024.
 * - High-detail regional observation: renders targeted selections/regions up to 2x
 *   detail before capping at 1024, accompanied by { crop, scale } coordinate mapping.
 *
 * @module agent-panel/observer
 */

import { downscaleDataUrl } from "../../editor/command_table/helpers.js";
import {
  normalizeRegion,
  isBoxIntersecting,
  unionBox,
  cropPixelToCanvas,
  canvasToCropPixel,
} from "./observer_geometry.js";
import { computeOutsideRegionHash } from "./observer_hash.js";

export {
  normalizeRegion,
  isBoxIntersecting,
  unionBox,
  cropPixelToCanvas,
  canvasToCropPixel,
  computeOutsideRegionHash,
};

export const MAX_OBSERVER_EDGE = 1024;
export const MAX_DETAIL_SCALE = 2;
export const DEFAULT_TARGET_PADDING = 16;

/**
 * Extracts a clean, structured object summary without unneeded internal noise.
 *
 * @param {Object} node
 * @returns {Object|null}
 */
export function extractObjectSummary(node) {
  if (!node || typeof node !== "object") return null;

  const x = Number(node.x ?? node.position?.x ?? 0);
  const y = Number(node.y ?? node.position?.y ?? 0);
  const width = Math.max(0, Number(node.width ?? node.w ?? 0));
  const height = Math.max(0, Number(node.height ?? node.h ?? 0));

  const properties = {};
  if (node.visible !== undefined) properties.visible = node.visible !== false;
  if (node.text !== undefined) properties.text = node.text;
  if (node.fill !== undefined) properties.fill = node.fill;
  if (node.color !== undefined) properties.color = node.color;
  if (node.backgroundColor !== undefined)
    properties.backgroundColor = node.backgroundColor;
  if (node.opacity !== undefined) properties.opacity = node.opacity;
  if (node.rotation !== undefined) properties.rotation = node.rotation;
  if (node.zIndex !== undefined) properties.zIndex = node.zIndex;
  if (node.role !== undefined) properties.role = node.role;
  if (node.isBackground !== undefined)
    properties.isBackground = node.isBackground;

  if (node.data && typeof node.data === "object") {
    if (node.data.label) properties.label = node.data.label;
    if (node.data.title) properties.title = node.data.title;
    if (node.data.prompt || node.data.aiPrompt) {
      properties.prompt = node.data.prompt || node.data.aiPrompt;
    }
    if (node.data.status) properties.status = node.data.status;
    if (node.data.layoutSkill) properties.layoutSkill = node.data.layoutSkill;
    if (node.data.layoutResolvedDesignSystem) {
      properties.designSystem = node.data.layoutResolvedDesignSystem;
    }
    if (node.data.layoutResolvedArtDirection) {
      properties.artDirection = node.data.layoutResolvedArtDirection;
    }
  }

  return {
    id: String(node.id ?? ""),
    type: String(node.kind || node.type || "unknown"),
    name: String(
      node.name ||
        node.title ||
        node.data?.title ||
        node.data?.label ||
        node.id ||
        "unnamed",
    ),
    box: { x, y, width, height },
    properties,
  };
}

/**
 * Resolves candidate objects from the current canvas or editor environment.
 *
 * @param {Object} context
 * @returns {Array<Object>}
 */
export function resolveCanvasObjects(context) {
  const store = context?.getStore ? context.getStore() : context?.store;
  if (!store) return [];

  if (typeof store.getDocument === "function") {
    const doc = store.getDocument();
    if (doc?.nodes && Array.isArray(doc.nodes)) return doc.nodes;
    if (doc?.layers && Array.isArray(doc.layers)) return doc.layers;
  }

  if (
    store.activeDesignDocument?.nodes &&
    Array.isArray(store.activeDesignDocument.nodes)
  ) {
    return store.activeDesignDocument.nodes;
  }

  const bridges = store.editorBridges || store.bridges;
  if (bridges) {
    for (const key of Object.keys(bridges)) {
      const bridge = bridges[key];
      if (bridge?.engine?.getDocument) {
        const doc = bridge.engine.getDocument();
        if (doc?.nodes && Array.isArray(doc.nodes)) return doc.nodes;
      }
    }
  }

  if (Array.isArray(store.nodes)) {
    return store.nodes;
  }

  return [];
}

/**
 * Scales down an image/dataUrl so its longest edge does not exceed maxEdge.
 *
 * @param {string} dataUrl
 * @param {number} [maxEdge=1024]
 * @param {Function} [downscaleFn] - Injected downscale function
 * @returns {Promise<string>}
 */
export async function ensureThumbnailSize(
  dataUrl,
  maxEdge = MAX_OBSERVER_EDGE,
  downscaleFn = null,
) {
  if (!dataUrl || typeof dataUrl !== "string") return dataUrl;
  if (typeof downscaleFn === "function") {
    return await downscaleFn(dataUrl, maxEdge);
  }
  if (typeof Image !== "undefined" && typeof document !== "undefined") {
    return await downscaleDataUrl(dataUrl, maxEdge);
  }
  return dataUrl;
}

/**
 * Observes canvas state and captures a screenshot according to scope options.
 * Renders targeted selections and regions up to 2x detail (capped at 1024)
 * with { crop, scale } mapping.
 *
 * @param {Object} options
 * @param {"viewport"|"selection"|"region"} [options.scope="viewport"]
 * @param {Object} [options.region]
 * @param {string[]} [options.targetIds]
 * @param {number} [options.padding]
 * @param {Function} [options.captureFn]
 * @param {Function} [options.downscaleFn]
 * @param {Object} context - Tool execution context
 * @returns {Promise<Object>}
 */
export async function observeCanvas(options = {}, context = {}) {
  const scope = options?.scope || "viewport";
  const rawNodes = resolveCanvasObjects(context);
  const allSummaries = rawNodes.map(extractObjectSummary).filter(Boolean);

  let filteredSummaries = [];
  let bounds = { x: 0, y: 0, width: 0, height: 0 };

  if (scope === "selection") {
    const store = context?.getStore ? context.getStore() : context?.store;
    let selectedIds =
      Array.isArray(options.targetIds) && options.targetIds.length > 0
        ? options.targetIds.map(String)
        : [];

    if (selectedIds.length === 0 && store) {
      if (Array.isArray(store.selectedNodeIds)) {
        selectedIds = store.selectedNodeIds.map(String);
      } else if (store.selectedNodeId) {
        selectedIds = [String(store.selectedNodeId)];
      } else if (Array.isArray(store.nodes)) {
        selectedIds = store.nodes
          .filter((n) => n.selected)
          .map((n) => String(n.id));
      }
    }

    const idSet = new Set(selectedIds);
    filteredSummaries = allSummaries.filter((s) => idSet.has(s.id));
    bounds = unionBox(filteredSummaries);
  } else if (scope === "region") {
    const targetRegion = normalizeRegion(options.region);
    bounds = targetRegion;
    filteredSummaries = allSummaries.filter((s) =>
      isBoxIntersecting(s.box, targetRegion),
    );
  } else {
    // scope === "viewport"
    if (Array.isArray(options.targetIds) && options.targetIds.length > 0) {
      const idSet = new Set(options.targetIds.map(String));
      filteredSummaries = allSummaries.filter((s) => idSet.has(s.id));
      bounds = unionBox(filteredSummaries);
    } else {
      filteredSummaries = allSummaries;
      bounds = unionBox(filteredSummaries);
    }
  }

  const isTargeted =
    scope === "selection" ||
    scope === "region" ||
    (Array.isArray(options.targetIds) && options.targetIds.length > 0);

  let crop = null;
  let scale = 1;

  if (isTargeted && (bounds.width > 0 || bounds.height > 0)) {
    const padding = Number(
      options?.padding ?? (scope === "region" ? 0 : DEFAULT_TARGET_PADDING),
    );
    crop = {
      x: bounds.x - padding,
      y: bounds.y - padding,
      width: Math.max(0, bounds.width + padding * 2),
      height: Math.max(0, bounds.height + padding * 2),
    };
    const cropLongest = Math.max(crop.width, crop.height);
    scale =
      cropLongest > 0
        ? Math.min(MAX_DETAIL_SCALE, MAX_OBSERVER_EDGE / cropLongest)
        : 1;
  }

  // ── Capture visual screenshot ──
  let rawScreenshot = null;
  const store = context?.getStore ? context.getStore() : context?.store;

  const captureFn =
    options?.captureFn || context?.captureFn || context?.rasterizeCanvas;
  if (typeof captureFn === "function") {
    try {
      const res = await captureFn({
        scope,
        bounds,
        crop,
        scale,
        objects: filteredSummaries,
        region: crop || bounds,
        maxEdge: MAX_OBSERVER_EDGE,
      });
      if (typeof res === "string") {
        rawScreenshot = res;
      } else if (res && typeof res.dataUrl === "string") {
        rawScreenshot = res.dataUrl;
      }
    } catch {
      // ignore
    }
  }

  if (!rawScreenshot && store && typeof store.runEditorCommand === "function") {
    try {
      if (isTargeted && crop && crop.width > 0 && crop.height > 0) {
        const exported = await store.runEditorCommand({
          tool: "export_canvas_png",
          args: {
            region: crop,
            scale,
            maxEdge: Math.min(
              MAX_OBSERVER_EDGE,
              Math.round(Math.max(crop.width, crop.height) * scale),
            ),
          },
        });
        rawScreenshot = exported?.dataUrl ?? null;
      } else {
        const exported = await store.runEditorCommand({
          tool: "export_canvas_png",
          args: { maxEdge: MAX_OBSERVER_EDGE },
        });
        rawScreenshot = exported?.dataUrl ?? null;
      }
    } catch {
      // Fallback if editor command not supported or fails
    }
  }

  const mock = options?.mockScreenshot || context?.mockScreenshot;
  if (!rawScreenshot && mock) {
    if (typeof mock === "function") {
      rawScreenshot = await mock({
        scope,
        bounds,
        crop,
        scale,
        objects: filteredSummaries,
      });
    } else {
      rawScreenshot = mock;
    }
  }

  let screenshot = null;
  let screenshotError = null;

  if (rawScreenshot) {
    const downscaler = options?.downscaleFn || context?.downscaleFn;
    try {
      screenshot = await ensureThumbnailSize(
        rawScreenshot,
        MAX_OBSERVER_EDGE,
        downscaler,
      );
    } catch (err) {
      screenshot = null;
      screenshotError = err?.message || String(err);
    }
  }

  return {
    scope,
    bounds,
    objects: filteredSummaries,
    screenshot,
    ...(screenshotError ? { screenshotError } : {}),
    count: filteredSummaries.length,
    crop,
    scale,
  };
}
