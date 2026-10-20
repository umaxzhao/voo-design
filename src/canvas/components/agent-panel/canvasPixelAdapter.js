/**
 * Canvas Pixel Adapter for Production Rasterization & Verification (P0-7/P0-8).
 *
 * Connects agent tools and verifiers to real rasterization and pixel readback
 * across three distribution targets:
 *   1. Chrome Extension (CANVAS_MODE.EXTENSION / local side-panel or tab)
 *   2. Electron Client (CANVAS_MODE.DESKTOP)
 *   3. Hosted Web (CANVAS_MODE.STANDALONE / FRAME / BRIDGE)
 *
 * Rules:
 *   - Pure module: NO React imports (CLAUDE.md §2).
 *   - Explicit "unavailable" reporting: if an environment or state does not support
 *     pixel extraction (e.g. no editor open, tainted cross-origin canvas), returns
 *     { unavailable: true, reason } rather than silently returning mock or partial data.
 *
 * @module agent-panel/canvasPixelAdapter
 */

import { normalizeRegion } from "./observer.js";
import { resolveTargetEditorBridge } from "../../editor/editor_target_resolver.js";

/**
 * Resolves the active editor engine from store or global test hooks.
 *
 * @param {Object} [store]
 * @param {Object} [options]
 * @returns {Object|null}
 */
export function resolveActiveEngine(store, options = {}) {
  if (store) {
    try {
      const bridge = resolveTargetEditorBridge(store, options);
      if (bridge?.engine) return bridge.engine;
    } catch {
      // ignore
    }
  }
  if (typeof window !== "undefined" && window.__vooEditor) {
    return window.__vooEditor;
  }
  return null;
}

/**
 * Reads canvas pixels (ImageData or RGBA buffer) from the active engine or DOM stage.
 *
 * @param {Object} [region] - Target region to sample (document coordinates)
 * @param {Object} [store] - Workflow store
 * @param {Object} [options] - Target options
 * @returns {ImageData|{ width: number, height: number, data: Uint8ClampedArray }|{ unavailable: true, reason: string }}
 */
export function getCanvasPixels(region, store, options = {}) {
  const norm = region ? normalizeRegion(region) : null;
  const engine = resolveActiveEngine(store, options);

  // 1. Preferred route: engine.exportPngCanvas() returns an unclipped HTMLCanvasElement
  if (engine && typeof engine.exportPngCanvas === "function") {
    try {
      const canvas = engine.exportPngCanvas(1);
      if (canvas && typeof canvas.getContext === "function") {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          if (norm && norm.width > 0 && norm.height > 0) {
            const rx = Math.max(0, Math.floor(norm.x));
            const ry = Math.max(0, Math.floor(norm.y));
            const rw = Math.min(canvas.width - rx, Math.ceil(norm.width));
            const rh = Math.min(canvas.height - ry, Math.ceil(norm.height));
            if (rw > 0 && rh > 0) {
              return ctx.getImageData(rx, ry, rw, rh);
            }
          }
          return ctx.getImageData(0, 0, canvas.width, canvas.height);
        }
      }
    } catch (err) {
      return {
        unavailable: true,
        reason: `ENGINE_PIXEL_READ_FAILED: ${err?.message || err}`,
      };
    }
  }

  // 2. Direct store hook if provided
  if (typeof store?.getCanvasPixels === "function") {
    try {
      const res = store.getCanvasPixels(region);
      if (res) return res;
    } catch (err) {
      return {
        unavailable: true,
        reason: `STORE_PIXEL_READ_FAILED: ${err?.message || err}`,
      };
    }
  }

  // 3. Fallback: DOM stage canvas element (e.g. while editor stage is active in DOM)
  if (typeof document !== "undefined") {
    try {
      const stageCanvas =
        document.querySelector('[data-testid="editor-pages"] canvas') ||
        document.querySelector("canvas.stage-canvas");

      if (stageCanvas && typeof stageCanvas.getContext === "function") {
        const ctx = stageCanvas.getContext("2d");
        if (ctx) {
          if (norm && norm.width > 0 && norm.height > 0) {
            const rx = Math.max(0, Math.floor(norm.x));
            const ry = Math.max(0, Math.floor(norm.y));
            const rw = Math.min(stageCanvas.width - rx, Math.ceil(norm.width));
            const rh = Math.min(stageCanvas.height - ry, Math.ceil(norm.height));
            if (rw > 0 && rh > 0) {
              return ctx.getImageData(rx, ry, rw, rh);
            }
          }
          return ctx.getImageData(0, 0, stageCanvas.width, stageCanvas.height);
        }
      }
    } catch (err) {
      // Tainted canvas or security error
      return {
        unavailable: true,
        reason: `CANVAS_DOM_TAINTED: ${err?.message || err}`,
      };
    }
  }

  return {
    unavailable: true,
    reason: "NO_ACTIVE_CANVAS: No open image editor or rasterizable canvas available in current environment.",
  };
}

/**
 * Rasterizes canvas content to a PNG data URL according to the requested scope.
 *
 * @param {Object} [options]
 * @param {"viewport"|"selection"|"region"} [options.scope="viewport"]
 * @param {Object} [options.bounds]
 * @param {Object} [options.region]
 * @param {string} [options.nodeId]
 * @param {string[]} [options.targetIds]
 * @param {number} [options.maxEdge=1024]
 * @param {Object} [store]
 * @returns {Promise<string|{ dataUrl: string, width?: number, height?: number }|{ unavailable: true, reason: string }>}
 */
export async function rasterizeCanvas(options = {}, store = null) {
  const scope = options?.scope || "viewport";
  const maxEdge = Number(options?.maxEdge || 1024);
  const region = options?.region || options?.bounds || null;
  const engine = resolveActiveEngine(store);

  // 1. If engine is directly accessible:
  if (engine) {
    try {
      if (scope === "region" && region && region.width > 0 && region.height > 0) {
        if (typeof engine.exportRectPng === "function") {
          const rectDataUrl = engine.exportRectPng(region);
          if (rectDataUrl) return { dataUrl: rectDataUrl, region };
        }
      } else if (scope === "selection") {
        const targetId = options.nodeId || (options.targetIds && options.targetIds[0]) || engine.getSelectedId?.();
        if (targetId && typeof engine.exportNodePng === "function") {
          const nodeDataUrl = engine.exportNodePng(targetId);
          if (nodeDataUrl) return { dataUrl: nodeDataUrl, nodeId: targetId };
        }
      }

      if (typeof engine.exportPng === "function") {
        const dataUrl = engine.exportPng();
        if (dataUrl) return { dataUrl };
      }
    } catch {
      // Fall through to command execution route
    }
  }

  // 2. Via store.runEditorCommand (standard bridge route across Extension, Electron, Standalone)
  if (store && typeof store.runEditorCommand === "function") {
    try {
      if (scope === "region" && region && region.width > 0 && region.height > 0) {
        const exported = await store.runEditorCommand({
          tool: "export_canvas_png",
          args: { maxEdge, region },
        });
        if (exported?.dataUrl) return exported;
      } else if (scope === "selection") {
        const targetId = options.nodeId || (options.targetIds && options.targetIds[0]);
        if (targetId) {
          const exported = await store.runEditorCommand({
            tool: "export_node_png",
            args: { nodeId: targetId, maxEdge },
          });
          if (exported?.dataUrl) return exported;
        }
      }

      const exported = await store.runEditorCommand({
        tool: "export_canvas_png",
        args: { maxEdge },
      });
      if (exported?.dataUrl) return exported;
    } catch {
      // Editor command failed or not open
    }
  }

  // 3. Fallback to DOM canvas dataURL if in browser
  if (typeof document !== "undefined") {
    try {
      const stageCanvas =
        document.querySelector('[data-testid="editor-pages"] canvas') ||
        document.querySelector("canvas.stage-canvas");

      if (stageCanvas && typeof stageCanvas.toDataURL === "function") {
        const dataUrl = stageCanvas.toDataURL("image/png");
        if (dataUrl) return { dataUrl };
      }
    } catch {
      // ignore
    }
  }

  return {
    unavailable: true,
    reason: "RASTERIZE_UNAVAILABLE: No active editor or rasterizable surface available.",
  };
}

/**
 * Creates a bound rasterizer and pixel reader for a tool execution context.
 *
 * @param {Object} store
 * @param {Object} [options]
 * @returns {{ rasterizeCanvas: Function, getCanvasPixels: Function }}
 */
export function createCanvasPixelAdapter(store, options = {}) {
  return {
    rasterizeCanvas: (opts) => rasterizeCanvas({ ...options, ...opts }, store),
    getCanvasPixels: (region) => getCanvasPixels(region, store, options),
  };
}
