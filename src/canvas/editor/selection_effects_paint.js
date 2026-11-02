import { resolveBucketSelection } from "./paint-bucket-selection.js";
/**
 * Painting, stroking, gradient, and path-to-selection effects for active selections.
 */

import {
  createRectNode,
  effectivePage,
  findNode,
  NODE_KIND,
} from "./scene_model.js";
import { drawImageNode } from "./scene_renderer.js";
import { blurMask, contoursToMask } from "./pixel_selection.js";
import { penContourRing } from "./editor_pen.js";
import { contourBounds } from "./mask_contour.js";
import * as ops from "./doc_ops.js";
import { BAKED_BITMAP_DEFORMATION_PATCH } from "./editor_deformation_patch.js";
import {
  isPristineGradientStops,
} from "./gradient_tool_state.js";
import { formatGradient } from "../color_picker/gradient_fill.js";

/** Hex + 0-100 opacity → the CSS colour CanvasGradient.addColorStop wants. */
function stopCssColor(stop) {
  const hex = /^#[0-9a-fA-F]{6}/.test(stop?.color ?? "") ? stop.color : "#ffffff";
  const opacity = Math.max(0, Math.min(100, Number(stop?.opacity ?? 100))) / 100;
  if (opacity >= 1) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * The type-specific gradient anchors shared by the drag path (tool press →
 * release, doc-space) and the panel path (whole layer box, pixel space).
 * Doc points are mapped into pixel space here, so both paths emit one shape:
 * `{ p0, p1, center, radius }` per gradient type.
 */
export function gradientGeometry(
  type,
  startDocPt,
  endDocPt,
  box,
  node,
  scaleX,
  scaleY,
) {
  const toPixel = (point) => ({
    x: (point?.x - node.x) * scaleX,
    y: (point?.y - node.y) * scaleY,
  });
  const p0 = toPixel(startDocPt);
  const p1 = endDocPt ? toPixel(endDocPt) : p0;
  if (type === "radial") {
    const center = p0;
    const radius = Math.max(1, Math.hypot(p1.x - center.x, p1.y - center.y));
    return { p0, p1, center, radius };
  }
  if (type === "angular") {
    return {
      p0,
      p1,
      center: { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 },
      radius: Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y)),
    };
  }
  return { p0, p1, center: p0, radius: Math.max(1, Math.hypot(p1.x - p0.x, p1.y - p0.y)) };
}

/**
 * The panel path: a gradient line across the layer's pixel-space box from the
 * tool angle (CSS semantics — 0deg points up, 90deg points right) and, for
 * radial/angular, the box centre.
 */
export function angleGeometry(type, angle, box) {
  const center = { x: box.width / 2, y: box.height / 2 };
  if (type === "radial") {
    return {
      center,
      radius: Math.max(1, Math.hypot(center.x, center.y)),
    };
  }
  if (type === "angular") {
    return { center };
  }
  const radians = (Math.max(0, Math.min(359, Number(angle) || 0)) * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const scale = Math.hypot(center.x, center.y) + 1;
  return {
    p0: { x: center.x - dx * scale, y: center.y - dy * scale },
    p1: { x: center.x + dx * scale, y: center.y + dy * scale },
  };
}

/** Builds the CanvasGradient for the tool's type/stops; null when unsupported. */
export function buildCanvasGradient(ctx, type, angle, geometry, stops) {
  let grad = null;
  try {
    if (type === "radial" && geometry.center && geometry.radius) {
      grad = ctx.createRadialGradient(
        geometry.center.x,
        geometry.center.y,
        0,
        geometry.center.x,
        geometry.center.y,
        geometry.radius,
      );
    } else if (type === "angular" && ctx.createConicGradient) {
      const radians =
        ((Number.isFinite(Number(angle)) ? Number(angle) : 0) * Math.PI) / 180;
      grad = ctx.createConicGradient(
        radians,
        geometry.center?.x ?? 0,
        geometry.center?.y ?? 0,
      );
    }
    if (!grad) {
      const p0 = geometry.p0 ?? { x: 0, y: 0 };
      const p1 = geometry.p1 ?? { x: 0, y: 0 };
      if (p0.x === p1.x && p0.y === p1.y) return null;
      grad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    }
  } catch {
    return null;
  }
  for (const stop of stops ?? []) {
    grad.addColorStop(Math.max(0, Math.min(1, (stop.position ?? 0) / 100)), stopCssColor(stop));
  }
  return grad;
}

/** HEX → rgba() so a canvas fill honours the tool opacity (other strings pass through). */
export function colourWithOpacity(colour, opacity) {
  const alpha = Math.max(0, Math.min(1, Number(opacity)));
  if (alpha >= 1) return colour;
  const match = /^#([0-9a-f]{6})$/i.exec(String(colour ?? ""));
  if (!match) return colour;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Scale a gradient stop list by the tool opacity (0..1). */
export function scaleGradientStops(stops, opacity) {
  const factor = Math.max(0, Math.min(1, Number(opacity)));
  if (!Array.isArray(stops)) return stops;
  return stops.map((stop) => ({
    ...stop,
    opacity: Math.round((stop.opacity ?? 100) * factor),
  }));
}

export function createSelectionPaintEffects({
  getDoc,
  cache,
  maskTools,
  getColor,
  getBackgroundColor,
  selection,
  select,
  getPixelSelection,
  setPixelSelection,
  replaceNodeBitmap,
  syncAnts,
  requestRender,
  notify,
  commitPaintBucket,
  commitSelectionEffect,
  getGradientToolState = null,
  getWandComposite = null,
  getFillOpacity = null,
  getGradientOpacity = null,
}) {
  /**
   * Strokes the selection's outline onto the layer with the current colour
   * (Photoshop's Edit → Stroke): a band of `width` doc px along the rings.
   */
  async function strokeSelection(width = 4) {
    const doc = getDoc();
    const current = getPixelSelection();
    if (!current?.nodeId || !current.contours?.length) return false;
    const node = findNode(doc, current.nodeId);
    if (!node || node.kind !== NODE_KIND.IMAGE) return false;
    const bitmap = cache.get(node);
    if (!bitmap) return false;
    const bWidth = bitmap.naturalWidth ?? bitmap.width;
    const bHeight = bitmap.naturalHeight ?? bitmap.height;
    const scaleX = bWidth / (node.width || bWidth);
    const scaleY = bHeight / (node.height || bHeight);

    const canvas = document.createElement("canvas");
    canvas.width = bWidth;
    canvas.height = bHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    ctx.strokeStyle = getColor();
    ctx.lineWidth = Math.max(1, width * scaleX);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const ring of current.contours) {
      ring.forEach(([x, y], index) => {
        const pixelX = (x - node.x) * scaleX;
        const pixelY = (y - node.y) * scaleY;
        if (index === 0) ctx.moveTo(pixelX, pixelY);
        else ctx.lineTo(pixelX, pixelY);
      });
      ctx.closePath();
    }
    ctx.stroke();

    await replaceNodeBitmap(current.nodeId, canvas.toDataURL("image/png"), {
      patch: null,
    });
    requestRender();
    notify();
    return true;
  }

  /** A full-frame solid/gradient fill layer when the tool runs with nothing selected. */
  function createFillLayer(fill, name) {
    const doc = getDoc();
    const page = effectivePage(doc);
    const node = {
      ...createRectNode({
        x: page.x,
        y: page.y,
        width: page.width,
        height: page.height,
        fill,
      }),
      name,
    };
    commitSelectionEffect(ops.addNode(doc, node));
    select?.(node.id);
    requestRender();
    notify();
    return true;
  }

  /** CSS gradient string for a layer fill from the tool/drag inputs. */
  function gradientFillString(type, angle, stops) {
    return formatGradient(type, `${Math.round(angle)}deg`, stops);
  }

  /** CSS angle for a drag vector: 0deg points up, 90deg points right. */
  function dragAngle(start, end) {
    return ((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI + 90 + 360) % 360;
  }

  /**
   * Fills the active selection (or layer) with the specified colour (Photoshop's Edit → Fill).
   */
  async function fillSelection(fillColor = getColor(), options = {}) {
    const opacity = Math.max(
      0,
      Math.min(1, Number(options.opacity ?? getFillOpacity?.() ?? 1)),
    );
    const doc = getDoc();
    let current = getPixelSelection();
    const selectedId = selection.getId();
    let node = current?.nodeId
      ? findNode(doc, current.nodeId)
      : selectedId
        ? findNode(doc, selectedId)
        : null;

    if (!node) return createFillLayer(fillColor, "Fill");

    if (node.locked || node.lockImagePixels) return false;

    // If it's a vector / shape node: fill its vector color
    if (node.kind !== NODE_KIND.IMAGE) {
      if ("fill" in node) {
        commitSelectionEffect(
          ops.updateNode(doc, node.id, { fill: fillColor, fillOpacity: opacity }),
        );
        requestRender();
        notify();
        return true;
      }
      if ("stroke" in node) {
        commitSelectionEffect(ops.updateNode(doc, node.id, { stroke: fillColor }));
        requestRender();
        notify();
        return true;
      }
      return false;
    }

    const bitmap = cache.get(node);
    if (!bitmap) return false;
    // Bucket tolerance: when the click came from the Fill tool and no pixel
    // selection exists yet, derive the contiguous region from the clicked
    // pixel before filling it. Without a point (panel fill / shortcut) this
    // keeps the historical whole-layer behaviour.
    if ((!current?.contours?.length) && options.point && options.tolerance != null) {
      const bucket = resolveBucketSelection({ bitmap, node, ...options, getComposite: getWandComposite });
      // An out-of-bounds/empty bucket must never fall through to whole-layer fill.
      if (!bucket) return false;
      current = bucket;
    }
    const bWidth = bitmap.naturalWidth ?? bitmap.width;
    const bHeight = bitmap.naturalHeight ?? bitmap.height;
    const scaleX = bWidth / (node.width || bWidth);
    const scaleY = bHeight / (node.height || bHeight);

    const canvas = document.createElement("canvas");
    canvas.width = bWidth;
    canvas.height = bHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    // A deform worth baking in is one that exists; a node's `adjustments`
    // field is ALWAYS a non-null default object, so counting the object
    // itself would call every plain image deformed.
    const hasDeform =
      (node.warpMesh && Array.isArray(node.warpMesh.points)) ||
      (node.perspectiveCorners && node.perspectiveCorners.length === 4) ||
      (node.perspectiveQuad && node.perspectiveQuad.length === 4);

    if (hasDeform) {
      ctx.save();
      ctx.scale(scaleX, scaleY);
      ctx.translate(-node.x, -node.y);
      drawImageNode(
        ctx,
        node,
        bitmap,
        maskTools.maskSourceOf(node),
        null,
        true,
      );
      ctx.restore();
    } else {
      ctx.drawImage(bitmap, 0, 0);
    }

    if (current?.contours?.length) {
      const alphaMap =
        current.feather > 0
          ? blurMask(
              contoursToMask(current.contours, node, bWidth, bHeight),
              bWidth,
              bHeight,
              current.feather,
            )
          : null;

      if (alphaMap) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = 1;
        tempCanvas.height = 1;
        const tCtx = tempCanvas.getContext("2d");
        tCtx.fillStyle = colourWithOpacity(fillColor, opacity);
        tCtx.fillRect(0, 0, 1, 1);
        const [fr, fg, fb, fa] = tCtx.getImageData(0, 0, 1, 1).data;

        const image = ctx.getImageData(0, 0, bWidth, bHeight);
        for (let i = 0; i < alphaMap.length; i += 1) {
          const a = alphaMap[i] * (fa / 255);
          if (a <= 0) continue;
          const idx = i * 4;
          const origA = image.data[idx + 3] / 255;
          const outA = a + origA * (1 - a);
          if (outA > 0) {
            image.data[idx] = Math.round(
              (fr * a + image.data[idx] * origA * (1 - a)) / outA,
            );
            image.data[idx + 1] = Math.round(
              (fg * a + image.data[idx + 1] * origA * (1 - a)) / outA,
            );
            image.data[idx + 2] = Math.round(
              (fb * a + image.data[idx + 2] * origA * (1 - a)) / outA,
            );
            image.data[idx + 3] = Math.round(outA * 255);
          }
        }
        ctx.putImageData(image, 0, 0);
      } else {
        ctx.fillStyle = colourWithOpacity(fillColor, opacity);
        ctx.beginPath();
        for (const ring of current.contours) {
          ring.forEach(([x, y], index) => {
            const pixelX = (x - node.x) * scaleX;
            const pixelY = (y - node.y) * scaleY;
            if (index === 0) ctx.moveTo(pixelX, pixelY);
            else ctx.lineTo(pixelX, pixelY);
          });
          ctx.closePath();
        }
        ctx.fill();
      }
    } else {
      ctx.fillStyle = colourWithOpacity(fillColor, opacity);
      ctx.fillRect(0, 0, bWidth, bHeight);
    }

    // One user action is one history entry: when a deform was baked into the
    // new pixels, its cleanup rides the bitmap swap's own commit (patch)
    // instead of a second setDoc that undoes to a visually identical state.
    await commitPaintBucket(() =>
      replaceNodeBitmap(node.id, canvas.toDataURL("image/png"), {
        patch: hasDeform ? BAKED_BITMAP_DEFORMATION_PATCH : null,
      }),
    );

    requestRender();
    notify();
    return true;
  }

  /**
   * Applies a gradient to the active selection or image layer. Pass a drag
   * vector (tool press → release) or omit it to paint the Gradient tool's
   * panel state over the layer's bounds; either way the stops/type/angle come
   * from the gradient tool state, with an untouched default stop list seeded
   * from the drag's foreground/background colours.
   */
  async function applyGradientSelection(
    startDocPt,
    endDocPt,
    startColor = getColor(),
    endColor = getBackgroundColor(),
    {
      toolType = null,
      toolAngle = null,
      toolStops = null,
    } = {},
  ) {
    const state =
      typeof getGradientToolState === "function" ? getGradientToolState() : null;
    const type = toolType ?? state?.type ?? "linear";
    const angle = toolAngle ?? state?.angle ?? 135;
    let stops = toolStops ?? state?.stops ?? null;
    if (!stops?.length || isPristineGradientStops(stops)) {
      stops = [
        { color: startColor, opacity: 100, position: 0 },
        { color: endColor ?? "#ffffff", opacity: 100, position: 100 },
      ];
    }
    const gradientOpacity = getGradientOpacity?.() ?? 1;
    const scaledStops = scaleGradientStops(stops, gradientOpacity);
    const doc = getDoc();
    const current = getPixelSelection();
    const selectedId = selection.getId();
    const node = current?.nodeId
      ? findNode(doc, current.nodeId)
      : selectedId
        ? findNode(doc, selectedId)
        : null;
    const fillAngle = type === "linear" && endDocPt
      ? dragAngle(startDocPt, endDocPt)
      : angle;
    if (!node) {
      return createFillLayer(gradientFillString(type, fillAngle, scaledStops), "Gradient");
    }
    if (node.kind !== NODE_KIND.IMAGE) {
      if (!("fill" in node) || node.locked || node.lockImagePixels) return false;
      commitSelectionEffect(ops.updateNode(doc, node.id, { fill: gradientFillString(type, fillAngle, scaledStops) }));
      requestRender();
      notify();
      return true;
    }
    return paintNodeGradient({
      type,
      angle,
      stops: scaledStops,
      buildGeometry: ({ box, node, scaleX, scaleY }) =>
        gradientGeometry(type, startDocPt, endDocPt, box, node, scaleX, scaleY),
    });
  }

  /**
   * The Gradient tool panel's "apply": paints the current stop list over the
   * selected layer (or the whole layer when there is no pixel selection),
   * using angle/type instead of a drag vector.
   */
  async function applyGradientTool() {
    const state =
      typeof getGradientToolState === "function" ? getGradientToolState() : null;
    if (!state?.stops?.length) return false;
    const scaledStops = scaleGradientStops(state.stops, getGradientOpacity?.() ?? 1);
    const fill = gradientFillString(state.type, state.angle, scaledStops);
    const doc = getDoc();
    const selectedId = selection.getId();
    const node = selectedId ? findNode(doc, selectedId) : null;
    if (!node) return createFillLayer(fill, "Gradient");
    if (node.kind !== NODE_KIND.IMAGE) {
      if (!("fill" in node) || node.locked || node.lockImagePixels) return false;
      commitSelectionEffect(ops.updateNode(doc, node.id, { fill }));
      requestRender();
      notify();
      return true;
    }
    return paintNodeGradient({
      type: state.type,
      angle: state.angle,
      stops: scaledStops,
      buildGeometry: ({ box }) => angleGeometry(state.type, state.angle, box),
    });
  }

  /**
   * Paints one gradient onto the resolved image layer's pixels and commits the
   * bitmap swap. `buildGeometry({ box })` returns the type-specific anchor
   * points in pixel space (see gradientGeometry/angleGeometry).
   */
  async function paintNodeGradient({ type, angle, stops, buildGeometry }) {
    const doc = getDoc();
    const current = getPixelSelection();
    const selectedId = selection.getId();
    let node = current?.nodeId
      ? findNode(doc, current.nodeId)
      : selectedId
        ? findNode(doc, selectedId)
        : null;

    if (!node && doc.nodes?.length) {
      node =
        doc.nodes.find((n) => n.kind === NODE_KIND.IMAGE) ||
        doc.nodes[doc.nodes.length - 1];
    }

    if (!node || node.locked || node.lockImagePixels) return false;
    if (node.kind !== NODE_KIND.IMAGE) return false;

    const bitmap = cache.get(node);
    if (!bitmap) return false;
    const bWidth = bitmap.naturalWidth ?? bitmap.width;
    const bHeight = bitmap.naturalHeight ?? bitmap.height;
    const scaleX = bWidth / (node.width || bWidth);
    const scaleY = bHeight / (node.height || bHeight);

    const canvas = document.createElement("canvas");
    canvas.width = bWidth;
    canvas.height = bHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    ctx.drawImage(bitmap, 0, 0);

    const geometry = buildGeometry({
      box: { x: 0, y: 0, width: bWidth, height: bHeight },
      node,
      scaleX,
      scaleY,
    });
    const grad = buildCanvasGradient(ctx, type, angle, geometry, stops);
    if (!grad) return false;

    if (current?.contours?.length) {
      ctx.save();
      ctx.beginPath();
      for (const ring of current.contours) {
        ring.forEach(([x, y], index) => {
          const pixelX = (x - node.x) * scaleX;
          const pixelY = (y - node.y) * scaleY;
          if (index === 0) ctx.moveTo(pixelX, pixelY);
          else ctx.lineTo(pixelX, pixelY);
        });
        ctx.closePath();
      }
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, bWidth, bHeight);
      ctx.restore();
    } else {
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, bWidth, bHeight);
    }

    await replaceNodeBitmap(node.id, canvas.toDataURL("image/png"), {
      patch: null,
    });
    requestRender();
    notify();
    return true;
  }

  /**
   * Converts the selected pen path into a pixel selection (Photoshop's Load
   * Path as Selection, minus the dialog): the outline is sampled into a
   * document-space ring and installed on the image node underneath. The pen
   * path itself is left in place.
   */
  function pathToSelection() {
    const doc = getDoc();
    const id = selection.getId();
    const node = id ? findNode(doc, id) : null;
    if (!node || node.kind !== NODE_KIND.PATH || node.pen !== true)
      return false;
    const ring = penContourRing(node);
    if (ring.length < 3) return false;
    // The host image is the one under the path's centre: a selection must
    // belong to a layer whose pixels it can cut from.
    const centre = contourBounds([ring]);
    const host = ops.imageNodeUnder(doc, {
      x: centre.x + centre.width / 2,
      y: centre.y + centre.height / 2,
    });
    if (!host) return false;
    setPixelSelection({
      nodeId: host.id,
      contours: [ring],
      bounds: centre,
    });
    syncAnts();
    requestRender();
    notify();
    return true;
  }

  return {
    strokeSelection,
    fillSelection,
    applyGradientSelection,
    pathToSelection,
  };
}
