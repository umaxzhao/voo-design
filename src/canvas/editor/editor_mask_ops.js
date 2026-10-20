/**
 * Mask polygon lasso, feathering, inversion, edge refinement, and quick mask.
 * Extracted from editor_mask.js.
 */

import { findNode, NODE_KIND } from "./scene_model.js";
import { toNodeLocal } from "./scene_geometry.js";

/** Inverts the alpha of a canvas in place. */
export function invertInPlace(ctx, width, height) {
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  for (let i = 3; i < data.length; i += 4) data[i] = 255 - data[i];
  ctx.putImageData(image, 0, 0);
}

export function createMaskOps({
  getDoc,
  maskCanvasOf,
  markMaskDirty,
  requestRender,
  notify,
  select,
  queueMaskPersist,
  beginMaskEdit,
}) {
  /**
   * Active lasso selection: { nodeId, points, pending }.
   *
   * Points are document-space pairs collected during the drag; `pending`
   * turns true on pointer-up when the polygon is usable, which is when the
   * floating action bar offers the actual operations.
   */
  let lasso = null;

  function startLasso(id, point) {
    const node = findNode(getDoc(), id);
    if (node?.kind !== NODE_KIND.IMAGE) return false;
    lasso = { nodeId: id, points: [[point.x, point.y]], pending: false };
    select(id);
    notify();
    return true;
  }

  function addLassoPoint(point) {
    if (!lasso || lasso.pending) return;
    lasso.points.push([point.x, point.y]);
    requestRender();
  }

  /** Pointer-up: a polygon with fewer than three points selects nothing. */
  function finishLasso() {
    if (!lasso) return;
    lasso = lasso.points.length >= 3 ? { ...lasso, pending: true } : null;
    requestRender();
    notify();
  }

  function cancelLasso() {
    if (!lasso) return;
    lasso = null;
    requestRender();
    notify();
  }

  /**
   * Applies the pending lasso to the node's matte.
   *
   * `eraseInside` cuts the polygon out of the coverage; `keepInside` cuts
   * everything else — clear the matte, then paint a snapshot of it back
   * through a polygon clip. Both persist through the same path a mask-brush
   * stroke uses, so the operation is a single undo step.
   */
  async function applyLasso(mode) {
    if (!lasso?.pending) return false;
    const { nodeId, points } = lasso;
    const node = findNode(getDoc(), nodeId);
    const canvas = node ? maskCanvasOf(node) : null;
    lasso = null;
    if (!canvas) {
      notify();
      return false;
    }

    const scaleX = canvas.width / node.width;
    const scaleY = canvas.height / node.height;
    const path = new Path2D();
    points.forEach(([x, y], index) => {
      // Same local-frame mapping as the mask brush, so the polygon cuts the
      // shape the user traced even when the node is rotated or sheared.
      const local = toNodeLocal(node, { x, y });
      const maskX = local.x * scaleX;
      const maskY = local.y * scaleY;
      if (index === 0) path.moveTo(maskX, maskY);
      else path.lineTo(maskX, maskY);
    });
    path.closePath();

    const maskCtx = canvas.getContext("2d");
    if (mode === "keepInside") {
      const snapshot = document.createElement("canvas");
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      snapshot.getContext("2d").drawImage(canvas, 0, 0);
      maskCtx.globalCompositeOperation = "destination-out";
      maskCtx.fillRect(0, 0, canvas.width, canvas.height);
      maskCtx.globalCompositeOperation = "source-over";
      maskCtx.save();
      maskCtx.clip(path);
      maskCtx.drawImage(snapshot, 0, 0);
      maskCtx.restore();
    } else {
      maskCtx.save();
      maskCtx.globalCompositeOperation = "destination-out";
      maskCtx.fill(path);
      maskCtx.restore();
    }

    markMaskDirty(nodeId);
    requestRender();
    notify();
    await queueMaskPersist(nodeId);
    return true;
  }

  /**
   * Blurs the live matte in place: redraw it through a `blur()` filter.
   *
   * The feather is baked into the matte pixels rather than stored as a
   * parameter — a parametric feather would double the matte state (pre- and
   * post-blur copies) for no undo benefit, since the finish goes through
   * `markMaskDirty` + `queueMaskPersist` and lands as exactly one history
   * entry, same as a lasso apply. Both render paths read only the matte's
   * alpha, so they pick the blur up automatically (`invalidateMatte` forces
   * the GPU re-upload and drops the CPU composite cache).
   */
  async function featherMask(id, radiusPx) {
    const node = findNode(getDoc(), id);
    const canvas = node ? maskCanvasOf(node) : null;
    const radius = Math.round(Number(radiusPx) || 0);
    if (!canvas || radius <= 0) return false;

    const snapshot = document.createElement("canvas");
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext("2d").drawImage(canvas, 0, 0);

    const maskCtx = canvas.getContext("2d");
    maskCtx.save();
    maskCtx.clearRect(0, 0, canvas.width, canvas.height);
    maskCtx.filter = `blur(${radius}px)`;
    maskCtx.drawImage(snapshot, 0, 0);
    maskCtx.restore();

    markMaskDirty(id);
    requestRender();
    notify();
    await queueMaskPersist(id);
    return true;
  }

  /**
   * Flips the matte's alpha: kept becomes erased and vice versa.
   *
   * A pixel loop instead of a `difference` composite fill — the composite
   * inverts the colour channels too, and while both render paths read only
   * alpha, keeping the matte's colour channels untouched is the clearer
   * one-shot operation. Persists like `featherMask`: one history entry.
   */
  async function invertMask(id) {
    const node = findNode(getDoc(), id);
    const canvas = node ? maskCanvasOf(node) : null;
    if (!canvas) return false;
    invertInPlace(canvas.getContext("2d"), canvas.width, canvas.height);
    markMaskDirty(id);
    requestRender();
    notify();
    await queueMaskPersist(id);
    return true;
  }

  /**
   * Refines the matte's edge in place — the "refine edge" family:
   *
   *  - `smooth`  rounds a jagged silhouette (blur, then a 50% threshold snaps
   *    the soft halo back to a clean edge);
   *  - `expand`  grows the matte by `amount` pixels (morphological dilation —
   *    the matte is OR'd at offsets around a circle of that radius);
   *  - `contract` shrinks it by `amount` (dilation of the inverted matte,
   *    inverted back).
   *
   * All three land as one history entry, like feather and invert.
   */
  async function refineMask(id, op, amount) {
    const node = findNode(getDoc(), id);
    const canvas = node ? maskCanvasOf(node) : null;
    const value = Math.max(1, Math.round(Number(amount) || 0));
    if (!canvas || (op !== "smooth" && op !== "expand" && op !== "contract")) {
      return false;
    }
    const { width, height } = canvas;
    const ctx = canvas.getContext("2d");
    const snapshot = document.createElement("canvas");
    snapshot.width = width;
    snapshot.height = height;
    snapshot.getContext("2d").drawImage(canvas, 0, 0);

    if (op === "smooth") {
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.filter = `blur(${value}px)`;
      ctx.drawImage(snapshot, 0, 0);
      ctx.restore();
      const image = ctx.getImageData(0, 0, width, height);
      const range = Math.max(16, Math.min(64, value * 8));
      const minEdge = Math.max(0, 128 - range);
      const maxEdge = Math.min(255, 128 + range);
      const span = maxEdge - minEdge;
      for (let i = 3; i < image.data.length; i += 4) {
        const a = image.data[i];
        if (a <= minEdge) {
          image.data[i] = 0;
        } else if (a >= maxEdge) {
          image.data[i] = 255;
        } else {
          const t = (a - minEdge) / span;
          image.data[i] = Math.round(t * t * (3 - 2 * t) * 255);
        }
      }
      ctx.putImageData(image, 0, 0);
    } else {
      // Dilation: OR the matte at offsets around a circle of the given
      // radius, so every pixel within that distance of a kept pixel is kept.
      if (op === "contract") invertInPlace(ctx, width, height);
      const source = document.createElement("canvas");
      source.width = width;
      source.height = height;
      source.getContext("2d").drawImage(canvas, 0, 0);
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";
      const steps = Math.max(8, Math.min(32, value * 4));
      for (let i = 0; i < steps; i += 1) {
        const angle = (i / steps) * Math.PI * 2;
        ctx.drawImage(
          source,
          Math.round(Math.cos(angle) * value),
          Math.round(Math.sin(angle) * value),
        );
      }
      ctx.restore();
      if (op === "contract") invertInPlace(ctx, width, height);
    }

    markMaskDirty(id);
    requestRender();
    notify();
    await queueMaskPersist(id);
    return true;
  }

  /**
   * Quick mask: the marquee / lasso / wand selection becomes an editable
   * matte. The contours (document space) are filled into the matte's alpha,
   * then the mask brush arms — Photoshop's quick-mask entry, where the
   * selection is painted directly rather than dragged.
   */
  async function quickMaskFromSelection(id, contours) {
    const node = findNode(getDoc(), id);
    if (!node || node.kind !== NODE_KIND.IMAGE || !contours?.length) {
      return false;
    }
    const canvas = maskCanvasOf(node);
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");
    const scaleX = canvas.width / (node.width || 1);
    const scaleY = canvas.height / (node.height || 1);
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    for (const ring of contours) {
      ring.forEach(([x, y], index) => {
        const px = (x - node.x) * scaleX;
        const py = (y - node.y) * scaleY;
        if (index === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
    markMaskDirty(id);
    requestRender();
    notify();
    await queueMaskPersist(id);
    beginMaskEdit(id);
    return true;
  }

  return {
    getLasso: () => lasso,
    startLasso,
    addLassoPoint,
    finishLasso,
    cancelLasso,
    applyLasso,
    featherMask,
    invertMask,
    refineMask,
    quickMaskFromSelection,
    onNodeRemoved(id) {
      if (lasso?.nodeId === id) lasso = null;
    },
    onDocRestored() {
      lasso = null;
    },
  };
}
