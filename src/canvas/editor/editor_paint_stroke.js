/** Continuous stroke lifecycle: arming, interpolating, stamping, and finishing. */

import { findNode } from "./scene_model.js";
import { toNodeLocal } from "./scene_geometry.js";
import { stampQuadraticSegment } from "./scene_renderer.js";
import {
  resolvePressureOpacity,
  resolvePressureSize,
} from "./brush_pressure.js";
import {
  midOf,
  normalizeStrokeOptions,
  resolvePaintTarget,
  RETOUCH_MODES,
  stampSpacing,
  strokeCoverage,
} from "./editor_paint_target.js";
import {
  dabRect,
  expandPaintLayer,
  findPaintLayer,
  isPaintOpaqueAt,
  materialisePaintLayer,
  trimPaintLayer,
} from "./editor_paint_layer.js";
import { stamp } from "./editor_paint_stamps.js";

export function createPaintStroke({
  getDoc,
  setDoc,
  select,
  selection,
  setDraftRender = () => {},
  requestRender,
  paintCanvases,
  paintCanvasOf,
  releaseBitmap,
  markPaintDirty,
  queuePaintPersist,
  getPixelSelection = () => null,
}) {
  /** Active stroke: { nodeId, mode, size, hardness, color, last, pending, carried }. */
  let paintEdit = null;

  const layerContext = {
    getDoc,
    setDoc,
    select,
    paintCanvases,
    releaseBitmap,
    markPaintDirty,
    queuePaintPersist,
  };

  /**
   * Arms a stroke on a node: `paint` dabs colour onto it, `erase` rubs pixels
   * away. Width, hardness and colour are captured now so changing the tool
   * options mid-drag cannot bend a stroke already in flight.
   *
   * A brush stroke may arm with `nodeId` null. It paints on whatever raster
   * layer is selected — a paint layer or a plain picture alike (Photoshop's
   * model: the brush works on the current layer, so painting never spawns a
   * fresh layer above the layer the user is looking at). With nothing
   * paintable selected it targets the topmost paint layer, and on a fresh
   * document that layer materialises around the first dab (see
   * materialisePaintLayer). An explicit id that no longer exists — and an
   * eraser with no target at all — refuses to arm.
   */
  function beginPaintStroke(nodeId, options) {
    const {
      mode,
      size,
      hardness,
      color,
      blendMode = "normal",
    } = options;
    const normalized = normalizeStrokeOptions(options);
    let resolvedId = nodeId ?? null;
    // Draft mode: the stroke's frames repaint at dpr 1; the release restores
    // full resolution for the final frame.
    setDraftRender(true);
    if (resolvedId === null && (mode === "paint" || RETOUCH_MODES.has(mode))) {
      const primaryId = selection.getId();
      const primary = primaryId ? findNode(getDoc(), primaryId) : null;
      // The selected layer is the brush target — paint layer or plain image
      // (paintCanvasOf gives a plain image the same live canvas it gives a
      // paint layer, so the stroke and its persist work unchanged).
      resolvedId = resolvePaintTarget(
        primary,
        findPaintLayer(getDoc())?.id ?? null,
      );
    }
    if (resolvedId === null && mode !== "paint") return false;
    if (resolvedId !== null && !findNode(getDoc(), resolvedId)) return false;
    // A fully locked layer, or one with its image pixels locked, refuses any
    // stroke: Photoshop's "lock all" and "lock image pixels" stop the brush,
    // eraser and healing before the first dab. Locking transparency is the
    // softer sibling — it is honoured per stamp (see stampLocked).
    //
    // An explicit locked target is refused outright — never silently re-routed
    // to a fallback layer. The null-target path (brush on the selected raster
    // layer) already excludes locked layers via resolvePaintTarget, so nothing
    // legitimate is lost.
    if (resolvedId !== null) {
      const target = findNode(getDoc(), resolvedId);
      if (target && (target.locked || target.lockImagePixels)) {
        return false;
      }
    }
    paintEdit = {
      nodeId: resolvedId,
      mode,
      size,
      hardness,
      color,
      opacity: normalized.opacity,
      blendMode,
      flow: normalized.flow,
      // Brush tip shape: roundness squashes the dab into an ellipse, angle
      // rotates it (Photoshop's Brush Tip Shape panel).
      roundness: normalized.roundness,
      angle: normalized.angle,
      // Per-mode effect force — each an INDEPENDENT field (never a reuse of
      // opacity or flow), captured at stroke start so mid-drag option changes
      // cannot bend the stroke already in flight.
      strength: normalized.strength,
      exposure: normalized.exposure,
      tonalRange: normalized.tonalRange,
      protectLuminosity: normalized.protectLuminosity,
      saturating: normalized.saturating,
      pressureSize: normalized.pressureSize,
      pressureOpacity: normalized.pressureOpacity,
      last: null,
      pending: null,
      pendingDiameter: 0,
      // The smoothed path's working state, in doc space: `ctrl` is the most
      // recent input point (the next curve's control), `mid` the midpoint it
      // shares with its predecessor (the next curve's start), and `carried`
      // the stamp-pitch remainder crossing from the last segment.
      ctrl: null,
      mid: null,
      carried: 0,
      lastDiameter: 0,
      retouchLast: null,
      retouchOrigin: null,
      retouchSnapshot: null,
      targetNode: null,
      paintCtx: null,
    };
    return true;
  }

  /**
   * Paints from the stroke's previous point to `point` (doc space), walking
   * the segment at stamp spacing so fast drags stay continuous. The first
   * call holds the point — it may be a single-click dot (painted at full
   * alpha on pointer-up) or the start of a stroke; the second call releases
   * it as the stroke's first coverage-normalised stamp.
   *
   * Held points are kept in doc space and mapped per call: a brush stroke can
   * grow the paint layer mid-drag (see expandPaintLayer), which re-bases the
   * canvas, and a canvas-space remnant from before the growth would stamp at
   * the wrong texel.
   */
  function paintStrokeTo(point, pressure = 0.5) {
    if (!paintEdit) return;
    // Pen pressure, when the toggle is on, modulates the dab size; a mouse
    // (pressure 0) and a toggled-off tablet both read as the full brush size.
    const diameterDoc = resolvePressureSize(
      paintEdit.size,
      pressure,
      paintEdit.pressureSize,
    );
    // Pressure-driven opacity: only when the toggle is on. A mouse keeps the
    // stable brush opacity.
    paintEdit.stampOpacity = resolvePressureOpacity(
      paintEdit.opacity,
      pressure,
      paintEdit.pressureOpacity,
    );
    let node = paintEdit.nodeId ? findNode(getDoc(), paintEdit.nodeId) : null;
    if (!node && paintEdit.mode === "paint") {
      node = materialisePaintLayer(layerContext, dabRect(point, diameterDoc));
      if (!node) return;
      paintEdit.nodeId = node.id;
    }
    if (!node) return;
    // The layer the user is painting stays as it was picked: a stroke must
    // not yank the selection onto the paint target (the brush works on the
    // current layer, whatever that is). The one exception is materialising a
    // brand-new paint layer, which selects itself on creation.
    // A brush dab that reaches past the layer's box grows the layer to fit.
    if ((paintEdit.mode === "paint" || paintEdit.mode === "smudge") && node.paint === true) {
      const oldNode = node;
      const oldSnapshot = paintEdit.retouchSnapshot;
      node = expandPaintLayer(layerContext, node, dabRect(point, diameterDoc), paintEdit.mode === "smudge");
      if (!node) return;
      if (oldSnapshot && node !== oldNode) {
        const rebased = document.createElement("canvas");
        rebased.width = node.width;
        rebased.height = node.height;
        rebased.getContext("2d").putImageData(oldSnapshot, oldNode.x - node.x, oldNode.y - node.y);
        paintEdit.retouchSnapshot = rebased.getContext("2d").getImageData(0, 0, rebased.width, rebased.height);
      }
    }
    const canvas = paintCanvasOf(node);
    if (!canvas) return;
    paintEdit.targetNode = node;
    paintEdit.paintCtx = canvas.getContext("2d");

    // Doc points go through the node's local frame first, so a stroke on a
    // rotated, sheared or scaled node hits the texels it visually covers.
    const scaleX = canvas.width / node.width;
    const scaleY = canvas.height / node.height;
    const scale = (scaleX + scaleY) / 2;
    const toCanvas = (docPoint) => {
      const local = toNodeLocal(node, docPoint);
      return { x: local.x * scaleX, y: local.y * scaleY };
    };
    const diameter = Math.max(1, diameterDoc * scale);

    if (!paintEdit.last && !paintEdit.pending) {
      // First call: hold the dab; nothing is painted yet.
      paintEdit.pending = point;
      paintEdit.pendingDiameter = diameterDoc;
      return;
    }

    const coverage = strokeCoverage(diameter, paintEdit.hardness);
    const spacing = stampSpacing(diameter / 2);

    if (paintEdit.pending) {
      // Second call: it is a stroke, not a dot — release the held point as
      // the first stamp, then draw the straight lead-in from it to the
      // midpoint with the new point. The midpoint becomes the next curve's
      // start and the new point its control.
      const held = toCanvas(paintEdit.pending);
      const heldDiameter = Math.max(1, paintEdit.pendingDiameter * scale);
      const heldCoverage = strokeCoverage(heldDiameter, paintEdit.hardness);
      const heldSpacing = stampSpacing(heldDiameter / 2);
      stamp(canvas, held.x, held.y, heldDiameter, heldCoverage, paintEdit, getPixelSelection);
      const leadEnd = midOf(paintEdit.pending, point);
      stampQuadraticSegment(
        paintEdit.pending,
        midOf(paintEdit.pending, leadEnd),
        leadEnd,
        heldSpacing,
        0,
        (x, y) => {
          const c = toCanvas({ x, y });
          stamp(canvas, c.x, c.y, heldDiameter, heldCoverage, paintEdit, getPixelSelection);
        },
      );
      paintEdit.ctrl = point;
      paintEdit.mid = leadEnd;
      paintEdit.last = point;
      paintEdit.lastDiameter = diameterDoc;
      paintEdit.pending = null;
      markPaintDirty(node.id);
      requestRender();
      return;
    }

    // A duplicate move event paints nothing and must not dirty the canvas.
    if (
      paintEdit.ctrl &&
      point.x === paintEdit.ctrl.x &&
      point.y === paintEdit.ctrl.y
    ) {
      return;
    }

    // One curve per new point: from the remembered midpoint, bending around
    // the previous point as the control, to the midpoint with the new one.
    // The same construction the final render uses, so what the user sees
    // while dragging is exactly the curve that comes back on the next frame.
    const end = midOf(paintEdit.ctrl, point);
    paintEdit.carried = stampQuadraticSegment(
      paintEdit.mid,
      paintEdit.ctrl,
      end,
      spacing,
      paintEdit.carried,
      (x, y) => {
        const c = toCanvas({ x, y });
        stamp(canvas, c.x, c.y, diameter, coverage, paintEdit, getPixelSelection);
      },
    );
    paintEdit.ctrl = point;
    paintEdit.mid = end;
    paintEdit.last = point;
    paintEdit.lastDiameter = diameterDoc;
    markPaintDirty(node.id);
    requestRender();
  }

  /** Pointer-up: the stroke's pixels are final; persist one history entry. */
  function finishPaintStroke() {
    if (!paintEdit) return Promise.resolve();
    const { nodeId, mode } = paintEdit;
    // A single dab that never moved is a dot: paint it at full alpha now.
    if (paintEdit.pending && nodeId) {
      const node = findNode(getDoc(), nodeId);
      const canvas = node ? paintCanvasOf(node) : null;
      if (canvas) {
        const scaleX = canvas.width / node.width;
        const scaleY = canvas.height / node.height;
        const scale = (scaleX + scaleY) / 2;
        const local = toNodeLocal(node, paintEdit.pending);
        stamp(
          canvas,
          local.x * scaleX,
          local.y * scaleY,
          Math.max(1, paintEdit.pendingDiameter * scale),
          1,
          paintEdit,
          getPixelSelection,
        );
        markPaintDirty(nodeId);
        requestRender();
      }
    } else if (paintEdit.ctrl && nodeId) {
      // A dragged stroke: close the smoothed path with its straight tail —
      // from the last midpoint to the final point — then the end cap. The
      // live preview already drew everything up to the last midpoint, so the
      // tail is the only piece left unpainted.
      const node = findNode(getDoc(), nodeId);
      const canvas = node ? paintCanvasOf(node) : null;
      if (canvas) {
        const scaleX = canvas.width / node.width;
        const scaleY = canvas.height / node.height;
        const scale = (scaleX + scaleY) / 2;
        const toCanvas = (docPoint) => {
          const local = toNodeLocal(node, docPoint);
          return { x: local.x * scaleX, y: local.y * scaleY };
        };
        const diameter = Math.max(1, paintEdit.lastDiameter * scale);
        const coverage = strokeCoverage(diameter, paintEdit.hardness);
        const spacing = stampSpacing(diameter / 2);
        stampQuadraticSegment(
          paintEdit.mid,
          midOf(paintEdit.mid, paintEdit.ctrl),
          paintEdit.ctrl,
          spacing,
          paintEdit.carried,
          (x, y) => {
            const c = toCanvas({ x, y });
            stamp(canvas, c.x, c.y, diameter, coverage, paintEdit, getPixelSelection);
          },
        );
        const end = toCanvas(paintEdit.ctrl);
        stamp(canvas, end.x, end.y, diameter, coverage, paintEdit, getPixelSelection);
        markPaintDirty(nodeId);
        requestRender();
      }
    }
    // Rubbing pixels away shrinks a dedicated paint layer to what is left; a
    // plain picture keeps its box — its bounds are the artwork, not a scratch
    // region, so erasing never collapses it (Photoshop keeps layer bounds).
    if (mode === "erase" && nodeId) {
      const erased = findNode(getDoc(), nodeId);
      if (erased?.paint === true) trimPaintLayer(layerContext, nodeId);
    }
    paintEdit = null;
    // Full resolution again: the frame after release repaints at dpr 2.
    setDraftRender(false);
    return nodeId ? queuePaintPersist(nodeId) : Promise.resolve();
  }

  return {
    beginPaintStroke,
    paintStrokeTo,
    finishPaintStroke,
    isPaintOpaqueAt: (node, point) => isPaintOpaqueAt(paintCanvasOf, node, point),
    getPaintEdit: () => paintEdit,
    resetPaintEdit: () => {
      paintEdit = null;
    },
    clearPaintEditIfNode: (id) => {
      if (paintEdit?.nodeId === id) paintEdit = null;
    },
  };
}
