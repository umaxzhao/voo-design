/** Brush stamping operations across composite modes, PSD blends, and transparency locks. */

import { softBrushSprite } from "./scene_renderer.js";
import { blendPixel, isCustomBlendMode } from "./blend_math.js";
import {
  BRUSH_COMPOSITE,
  lockedStampPixel,
  RETOUCH_MODES,
} from "./editor_paint_target.js";
import { stampRetouch } from "./editor_paint_retouch.js";

/**
 * Clamps a freshly stamped dab's alpha to the stroke's opacity, the cap a
 * low-flow stroke may not exceed no matter how often it overlaps itself.
 */
export function clampStampAlpha(
  canvas,
  x,
  y,
  diameter,
  opacity,
) {
  const pixels = Math.max(1, Math.round(diameter));
  const left = Math.floor(x - diameter / 2);
  const top = Math.floor(y - diameter / 2);
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const w = Math.min(canvas.width, left + pixels) - sx;
  const h = Math.min(canvas.height, top + pixels) - sy;
  if (w <= 0 || h <= 0) return;
  const paintCtx = canvas.getContext("2d");
  const imageData = paintCtx.getImageData(sx, sy, w, h);
  const cap = Math.round(opacity * 255);
  const { data } = imageData;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > cap) data[i] = cap;
  }
  paintCtx.putImageData(imageData, sx, sy);
}

/**
 * A dab for one of the per-pixel blend modes: the sprite is composited into
 * a temporary canvas, then every non-transparent sprite texel is blended
 * over the paint layer's existing pixel with `blendPixel` — the identical
 * W3C compositing formulas `blend_math.js` uses for layer compositing, so a
 * multiply stroke and a multiply layer agree. Only the dab's bounding box
 * is read and written, clamped to the canvas.
 */
export function stampCustom(canvas, x, y, diameter, coverage, paintEdit) {
  const pixels = Math.max(1, Math.round(diameter));
  // The tip shape transforms the sprite the same way the GCO path does:
  // the ellipse's rotated bounding box sizes the temp canvas and the
  // destination region, so squashed/angled dabs blend in correctly.
  const roundness = paintEdit.roundness ?? 1;
  const angleDeg = paintEdit.angle ?? 0;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const tipW = Math.max(
    1,
    Math.ceil(pixels * cos + pixels * roundness * sin),
  );
  const tipH = Math.max(
    1,
    Math.ceil(pixels * sin + pixels * roundness * cos),
  );
  const left = Math.floor(x - tipW / 2);
  const top = Math.floor(y - tipH / 2);
  const right = Math.min(canvas.width, left + tipW);
  const bottom = Math.min(canvas.height, top + tipH);
  if (
    right <= 0 ||
    bottom <= 0 ||
    left >= canvas.width ||
    top >= canvas.height
  )
    return;
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const w = right - sx;
  const h = bottom - sy;
  if (w <= 0 || h <= 0) return;

  const temp = document.createElement("canvas");
  temp.width = tipW;
  temp.height = tipH;
  const tempCtx = temp.getContext("2d");
  tempCtx.translate(tipW / 2, tipH / 2);
  if (angleDeg) tempCtx.rotate(rad);
  tempCtx.drawImage(
    softBrushSprite(paintEdit.color, diameter, paintEdit.hardness, coverage),
    -pixels / 2,
    -pixels / 2,
    pixels,
    pixels * roundness,
  );
  const srcData = tempCtx.getImageData(0, 0, tipW, tipH);

  const paintCtx = canvas.getContext("2d");
  const dstData = paintCtx.getImageData(sx, sy, w, h);
  const out = dstData.data;
  const offX = sx - left;
  const offY = sy - top;
  const t = paintEdit.opacity;
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      const srcIdx = ((row + offY) * tipW + (col + offX)) * 4;
      const sa = srcData.data[srcIdx + 3] / 255;
      if (sa <= 0) continue;
      const dstIdx = (row * w + col) * 4;
      const dst = {
        r: out[dstIdx] / 255,
        g: out[dstIdx + 1] / 255,
        b: out[dstIdx + 2] / 255,
        a: out[dstIdx + 3] / 255,
      };
      // Opacity lands after the blend, Photoshop-style: the blended result
      // is mixed toward the backdrop by (1 - opacity).
      const blended = blendPixel(
        paintEdit.blendMode,
        dst,
        {
          r: srcData.data[srcIdx] / 255,
          g: srcData.data[srcIdx + 1] / 255,
          b: srcData.data[srcIdx + 2] / 255,
          a: sa,
        },
        sx + col,
        sy + row,
      );
      out[dstIdx] = (blended.r * t + dst.r * (1 - t)) * 255;
      out[dstIdx + 1] = (blended.g * t + dst.g * (1 - t)) * 255;
      out[dstIdx + 2] = (blended.b * t + dst.b * (1 - t)) * 255;
      out[dstIdx + 3] = (blended.a * t + dst.a * (1 - t)) * 255;
    }
  }
  paintCtx.putImageData(dstData, sx, sy);
}

/**
 * A dab on a transparency-locked layer: the sprite is composited into a
 * temp canvas, then every texel the sprite covers is colour-mixed into the
 * existing pixel while its alpha stays exactly as it was. Transparent
 * pixels are left alone — that is the point of the lock.
 */
export function stampLocked(canvas, x, y, diameter, coverage, paintEdit) {
  const pixels = Math.max(1, Math.round(diameter));
  const left = Math.floor(x - diameter / 2);
  const top = Math.floor(y - diameter / 2);
  const right = Math.min(canvas.width, left + pixels);
  const bottom = Math.min(canvas.height, top + pixels);
  if (
    right <= 0 ||
    bottom <= 0 ||
    left >= canvas.width ||
    top >= canvas.height
  )
    return;
  const sx = Math.max(0, left);
  const sy = Math.max(0, top);
  const w = right - sx;
  const h = bottom - sy;
  if (w <= 0 || h <= 0) return;

  const temp = document.createElement("canvas");
  temp.width = pixels;
  temp.height = pixels;
  const tempCtx = temp.getContext("2d");
  tempCtx.drawImage(
    softBrushSprite(paintEdit.color, diameter, paintEdit.hardness, coverage),
    0,
    0,
    pixels,
    pixels,
  );
  const srcData = tempCtx.getImageData(0, 0, pixels, pixels);

  const paintCtx = canvas.getContext("2d");
  const dstData = paintCtx.getImageData(sx, sy, w, h);
  const out = dstData.data;
  const offX = sx - left;
  const offY = sy - top;
  const mix = (paintEdit.flow ?? 1) < 1 ? paintEdit.flow : paintEdit.opacity;
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      const srcIdx = ((row + offY) * pixels + (col + offX)) * 4;
      const sa = srcData.data[srcIdx + 3] / 255;
      if (sa <= 0) continue;
      const dstIdx = (row * w + col) * 4;
      const next = lockedStampPixel(
        [out[dstIdx], out[dstIdx + 1], out[dstIdx + 2], out[dstIdx + 3]],
        [
          srcData.data[srcIdx],
          srcData.data[srcIdx + 1],
          srcData.data[srcIdx + 2],
          255,
        ],
        sa * mix,
      );
      out[dstIdx] = next[0];
      out[dstIdx + 1] = next[1];
      out[dstIdx + 2] = next[2];
      out[dstIdx + 3] = next[3];
    }
  }
  paintCtx.putImageData(dstData, sx, sy);
}

/** Stamps one dab centred at (x, y) in canvas pixels, alpha-scaled by coverage. */
export function stamp(canvas, x, y, diameter, coverage = 1, paintEdit, getPixelSelection) {
  if (RETOUCH_MODES.has(paintEdit.mode)) {
    stampRetouch(canvas, x, y, diameter, coverage, paintEdit);
    return;
  }
  // A layer with locked transparency (Photoshop's "lock transparent
  // pixels") only takes paint over existing content: the dab's colour
  // mixes in while the shape's alpha stays frozen.
  if (paintEdit.mode === "paint") {
    const target = paintEdit.targetNode;
    if (target?.lockTransparency) {
      stampLocked(canvas, x, y, diameter, coverage, paintEdit);
      return;
    }
  }
  // The PSD-style modes have no canvas composite operation; blend per pixel
  // with the same maths the layer renderer uses (see blend_math.js).
  if (paintEdit.mode === "paint" && isCustomBlendMode(paintEdit.blendMode)) {
    stampCustom(canvas, x, y, diameter, coverage, paintEdit);
    return;
  }
  const flow = paintEdit.flow ?? 1;
  // Flow is Photoshop's per-stamp deposition rate: below 1 the sprite is
  // drawn at full alpha and the overlap of successive stamps builds the
  // stroke up (1-(1-flow)^n), so a light pass over the same spot darkens
  // gradually instead of saturating instantly. The coverage-normalised
  // sprite — which cancels that accumulation — is only used at flow 1.
  const sprite = softBrushSprite(
    paintEdit.mode === "erase" ? "#ffffff" : paintEdit.color,
    diameter,
    paintEdit.hardness,
    flow < 1 ? 1 : coverage,
  );
  const paintCtx = paintEdit.paintCtx ?? canvas.getContext("2d");
  paintEdit.paintCtx = paintCtx;
  paintCtx.save();
  const sel = getPixelSelection?.();
  const targetNode = paintEdit.targetNode;
  if (
    sel?.contours?.length &&
    targetNode &&
    (!sel.nodeId || sel.nodeId === targetNode.id)
  ) {
    const scaleX = canvas.width / (targetNode.width || canvas.width);
    const scaleY = canvas.height / (targetNode.height || canvas.height);
    paintCtx.beginPath();
    let hasValidRings = false;
    for (const ring of sel.contours) {
      if (Array.isArray(ring) && ring.length >= 3) {
        hasValidRings = true;
        ring.forEach(([rx, ry], idx) => {
          const px = (rx - targetNode.x) * scaleX;
          const py = (ry - targetNode.y) * scaleY;
          if (idx === 0) paintCtx.moveTo(px, py);
          else paintCtx.lineTo(px, py);
        });
        paintCtx.closePath();
      }
    }
    if (hasValidRings) {
      paintCtx.clip();
    }
  }
  paintCtx.globalCompositeOperation =
    paintEdit.mode === "erase"
      ? "destination-out"
      : (BRUSH_COMPOSITE[paintEdit.blendMode] ?? "source-over");
  // Opacity (flow 1) or flow (< 1) decides the dab's alpha ceiling.
  const stampOpacity = paintEdit.stampOpacity ?? paintEdit.opacity;
  paintCtx.globalAlpha = flow < 1 ? flow : stampOpacity;
  // A squashed or rotated tip is a transformed blit of the round sprite:
  // translate to the dab centre, rotate, then draw the ellipse.
  const roundness = paintEdit.roundness ?? 1;
  const angle = paintEdit.angle ?? 0;
  if (roundness < 1 || angle !== 0) {
    paintCtx.translate(x, y);
    if (angle) paintCtx.rotate((angle * Math.PI) / 180);
    paintCtx.drawImage(
      sprite,
      -diameter / 2,
      -diameter / 2,
      diameter,
      diameter * roundness,
    );
  } else {
    paintCtx.drawImage(
      sprite,
      x - diameter / 2,
      y - diameter / 2,
      diameter,
      diameter,
    );
  }
  paintCtx.restore();
  // The opacity slider caps how much paint a low-flow stroke can lay down.
  if (flow < 1 && paintEdit.mode === "paint" && stampOpacity < 1) {
    clampStampAlpha(canvas, x, y, diameter, stampOpacity);
  }
}
