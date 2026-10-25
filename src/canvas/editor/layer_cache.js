/**
 * Offscreen layer cache for the on-screen stage.
 *
 * Shadows, glows, layer blur and the inner layer styles are the slowest
 * things the 2D stage paints, and a pan or a drag of some other layer repaints
 * every one of them on each frame although none has changed. A cacheable node
 * is painted once into a device-pixel surface and later frames blit that
 * surface instead.
 *
 * Fidelity rules:
 * - Only self-contained nodes are cached: source-over, no backdrop reads, no
 *   clipping chain, nothing whose pixels depend on what lies under it.
 * - A surface is keyed by the node object (documents are immutable, so an
 *   edit is a new object) and by the device scale (zoom × dpr).
 * - A blit at the same sub-pixel phase it was built at is pixel-exact and is
 *   used at any time. A different phase rounds to the nearest device pixel,
 *   which is only allowed while the view is moving; the settle frame then
 *   rebuilds at the resting phase.
 * - Surfaces are built only for nodes that were unchanged on the previous
 *   frame at an unchanged scale, so a zoom gesture or the layer being dragged
 *   never pays for a build it cannot reuse.
 */

import { NODE_KIND } from "./scene_model.js";
import { nodeAABB } from "./scene_geometry_bounds.js";
import {
  nodeScreenEffectPad,
  nodeWorldEffectPad,
} from "./viewport_culling.js";

const MAX_SURFACE_SIDE = 4096;
const PHASE_EPSILON = 1e-3;
// Miter joins reach up to miterLimit / 2 stroke widths past the outline.
const PATH_MITER_PAD = 4;

// Text is left out: glyphs of a fixed-size box may overflow its bounds, and
// a surface sized from the box would crop them.
const CACHEABLE_KINDS = new Set([
  NODE_KIND.RECT,
  NODE_KIND.ELLIPSE,
  NODE_KIND.PATH,
]);

const EXPENSIVE_EFFECTS = [
  "shadow",
  "glow",
  "innerShadow",
  "innerGlow",
  "satin",
  "bevel",
  "stroke",
];

let viewInteracting = false;

/** Marks the start of a viewport gesture: off-phase surfaces may be reused. */
export function beginLayerCacheInteraction() {
  viewInteracting = true;
}

/** Marks the view as settled: only pixel-exact surfaces are reused. */
export function endLayerCacheInteraction() {
  viewInteracting = false;
}

function hasExpensivePaint(node) {
  const effects = node.effects;
  if (effects && !Array.isArray(effects)) {
    for (const key of EXPENSIVE_EFFECTS) {
      if (effects[key]?.enabled) return true;
    }
  }
  if (node.layerBlur > 0) return true;
  return node.noise?.opacity > 0;
}

/**
 * True when the node's pixels depend only on the node itself and are costly
 * enough to be worth a surface.
 */
export function isLayerCacheable(node) {
  if (!node || !node.visible) return false;
  if (!CACHEABLE_KINDS.has(node.kind)) return false;
  if ((node.blendMode ?? "source-over") !== "source-over") return false;
  if (node.backgroundBlur > 0 || node.effects?.glass?.enabled || node.clipTo || node.maskBase) return false;
  return hasExpensivePaint(node);
}

function isWhole(value) {
  return Math.abs(value - Math.round(value)) < PHASE_EPSILON;
}

function scaleKeyOf(scale) {
  return Math.round(scale * 1e4) / 1e4;
}

function defaultCreateSurface(width, height) {
  if (typeof OffscreenCanvas === "function") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function releaseSurface(surface) {
  if (!surface) return;
  // Zero-sized backing stores hand their memory back without waiting for GC.
  try {
    surface.width = 0;
    surface.height = 0;
  } catch {
    // Transferred or detached surfaces cannot be resized; GC reclaims them.
  }
}

/**
 * @param {{
 *   maxEntries?: number,
 *   maxBytes?: number,
 *   maxBuildsPerFrame?: number,
 *   createSurface?: (width: number, height: number) => any,
 * }} [options]
 */
export function createLayerCache({
  maxEntries = 64,
  maxBytes = 64 * 1024 * 1024,
  maxBuildsPerFrame = 8,
  createSurface = defaultCreateSurface,
} = {}) {
  // Map order is the LRU order: the first entry is the least recently used.
  const entries = new Map();
  let bytes = 0;
  let frame = null;
  let lastScaleKey = null;
  let stableScale = false;
  let prevSeen = new Map();
  let currentSeen = new Map();
  let builds = 0;
  const counters = { hits: 0, misses: 0, builds: 0, evictions: 0 };

  function drop(id) {
    const entry = entries.get(id);
    if (!entry) return;
    entries.delete(id);
    bytes -= entry.bytes;
    releaseSurface(entry.surface);
  }

  function evict() {
    while (entries.size > 0 && (entries.size > maxEntries || bytes > maxBytes)) {
      const oldest = entries.keys().next().value;
      drop(oldest);
      counters.evictions += 1;
    }
  }

  function store(id, entry) {
    drop(id);
    entries.set(id, entry);
    bytes += entry.bytes;
    evict();
  }

  function touch(id, entry) {
    entries.delete(id);
    entries.set(id, entry);
  }

  function blit(ctx, surface, x, y) {
    ctx.save();
    // The page clip survives the reset: clip regions live in device space.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    ctx.drawImage(surface, x, y);
    ctx.restore();
  }

  /**
   * Reads the stage transform the node loop paints under. Must be called once
   * per frame, after the world transform is set and before `paint`.
   */
  function beginFrame(ctx) {
    prevSeen = currentSeen;
    currentSeen = new Map();
    builds = 0;
    const m = typeof ctx?.getTransform === "function" ? ctx.getTransform() : null;
    if (
      !m ||
      !(m.a > 0) ||
      Math.abs(m.b) > 1e-9 ||
      Math.abs(m.c) > 1e-9 ||
      Math.abs(m.a - m.d) > 1e-9
    ) {
      frame = null;
      lastScaleKey = null;
      return;
    }
    const scaleKey = scaleKeyOf(m.a);
    stableScale = scaleKey === lastScaleKey;
    lastScaleKey = scaleKey;
    frame = { scale: m.a, scaleKey, e: m.e, f: m.f };
  }

  /**
   * Paints `node` from its surface, building the surface first when the node
   * is stable. Returns false when the caller must paint the node itself.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} node
   * @param {(target: CanvasRenderingContext2D) => void} paintNode paints the
   *   node in world space onto `target`
   */
  function paint(ctx, node, paintNode) {
    if (!frame || !isLayerCacheable(node)) return false;
    const id = String(node.id);
    currentSeen.set(id, node);

    const entry = entries.get(id);
    if (entry && entry.node !== node) drop(id);
    else if (entry && entry.scaleKey === frame.scaleKey) {
      const x = entry.offsetX + frame.e;
      const y = entry.offsetY + frame.f;
      if (viewInteracting || (isWhole(x) && isWhole(y))) {
        touch(id, entry);
        blit(ctx, entry.surface, Math.round(x), Math.round(y));
        counters.hits += 1;
        return true;
      }
    }

    if (!stableScale || prevSeen.get(id) !== node || builds >= maxBuildsPerFrame) {
      counters.misses += 1;
      return false;
    }

    const scale = frame.scale;
    const box = nodeAABB(node);
    const miter =
      node.kind === NODE_KIND.PATH && node.stroke
        ? (Number(node.strokeWidth) || 0) * PATH_MITER_PAD
        : 0;
    const pad = nodeWorldEffectPad(node) + miter + nodeScreenEffectPad(node) / scale;
    const left = Math.floor((box.x - pad) * scale + frame.e) - 1;
    const top = Math.floor((box.y - pad) * scale + frame.f) - 1;
    const right = Math.ceil((box.x + box.width + pad) * scale + frame.e) + 1;
    const bottom = Math.ceil((box.y + box.height + pad) * scale + frame.f) + 1;
    const width = right - left;
    const height = bottom - top;
    const size = width * height * 4;
    if (
      !Number.isFinite(size) ||
      width <= 0 ||
      height <= 0 ||
      width > MAX_SURFACE_SIDE ||
      height > MAX_SURFACE_SIDE ||
      size > maxBytes / 4
    ) {
      counters.misses += 1;
      return false;
    }

    const surface = createSurface(width, height);
    const surfaceCtx = surface?.getContext?.("2d");
    if (!surfaceCtx) {
      counters.misses += 1;
      return false;
    }
    surfaceCtx.setTransform(scale, 0, 0, scale, frame.e - left, frame.f - top);
    paintNode(surfaceCtx);

    builds += 1;
    counters.builds += 1;
    store(id, {
      node,
      scaleKey: frame.scaleKey,
      surface,
      bytes: size,
      offsetX: left - frame.e,
      offsetY: top - frame.f,
    });
    blit(ctx, surface, left, top);
    return true;
  }

  /** The cached surface for `node` at this zoom and dpr, or null. */
  function get(node, zoom, dpr = 1) {
    const entry = node ? entries.get(String(node.id)) : null;
    if (!entry || entry.node !== node) return null;
    if (entry.scaleKey !== scaleKeyOf(zoom * dpr)) return null;
    touch(String(node.id), entry);
    return entry.surface;
  }

  /**
   * Stores a surface painted by the caller. `offsetX/offsetY` are the device
   * position of its top-left corner relative to the pan origin.
   */
  function set(node, surface, zoom, dpr = 1, { offsetX = 0, offsetY = 0 } = {}) {
    if (!node || !surface) return;
    store(String(node.id), {
      node,
      scaleKey: scaleKeyOf(zoom * dpr),
      surface,
      bytes: (surface.width || 0) * (surface.height || 0) * 4,
      offsetX,
      offsetY,
    });
  }

  function invalidate(nodeId) {
    if (nodeId == null) {
      clear();
      return;
    }
    drop(String(nodeId));
  }

  function clear() {
    for (const id of [...entries.keys()]) drop(id);
    bytes = 0;
  }

  function dispose() {
    clear();
    frame = null;
    prevSeen = new Map();
    currentSeen = new Map();
  }

  return {
    beginFrame,
    paint,
    get,
    set,
    invalidate,
    clear,
    dispose,
    stats: () => ({ entries: entries.size, bytes, ...counters }),
  };
}
