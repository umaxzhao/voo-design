// Text node typography layout, decorations, and warped text rendering.

import { readNodeTransform } from "./scene_state_contract.js";
import { paintImportedText } from "./render-imported-text.js";
import {
  getTextLayout,
  textFont,
  textLineHeight,
} from "./text_metrics.js";
import {
  renderWarpMesh,
  subdividePerspectiveQuad,
  subdivideBicubicWarpPatch,
} from "./mesh_transform.js";
import { resolvePaintStyle } from "./render_basic_shapes.js";
import { paintTextOnPath } from "./text_on_path.js";
import {
  cachedSubdivision,
  perspectiveCornersInDoc,
  textWarpRoute,
  warpMeshPointsInDoc,
  warpOutputScale,
} from "./render_warp_geometry.js";

export function paintTextBody(ctx, node) {
  if (paintImportedText(ctx, node)) return;
  if (node.textPath && (node.textPath.points?.length || node.textPath.anchors?.length)) {
    paintTextOnPath(ctx, node);
    return;
  }
  ctx.font = textFont(node);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const letterSpacing = node.letterSpacing ?? 0;
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${letterSpacing}px`;
  const lineHeight = textLineHeight(node);
  const { lines, widths, baseline, lineOffsets } = getTextLayout(ctx, node);
  // Photoshop's Baseline Shift: the glyphs rise/fall inside the line box
  // while the box itself (hit-testing, resize) stays put.
  const shift = node.baselineShift ?? 0;

  // 直排 (vertical): each line is one column of stacked characters; the
  // first line is the rightmost column, later lines sit to its left. The
  // same wrapped lines the measurer produces — a fixed box wraps here too,
  // or the painted columns and the hit-test box describe different text.
  if (node.direction === "vertical") {
    const charAdvance = node.fontSize + letterSpacing;
    const columnPitch = lineHeight;
    const columns = lines.map((line) => [...line]);

    const shadow = node.shadow?.enabled ? node.shadow : null;
    if (shadow) {
      ctx.shadowColor = shadow.color;
      ctx.shadowBlur = shadow.blur;
      ctx.shadowOffsetX = shadow.offsetX;
      ctx.shadowOffsetY = shadow.offsetY;
    }
    const strokeWidth = node.stroke ? (node.strokeWidth ?? 0) : 0;
    columns.forEach((chars, index) => {
      const colX = node.x + (columns.length - 1 - index) * columnPitch;
      if (node.highlight) {
        const height = Math.max(charAdvance, chars.length * charAdvance);
        ctx.fillStyle = node.highlight;
        ctx.fillRect(colX, node.y, columnPitch, height);
      }
      chars.forEach((ch, ci) => {
        const y = node.y + ci * charAdvance + baseline + shift;
        if (strokeWidth > 0) {
          ctx.strokeStyle = resolvePaintStyle(
            ctx,
            node.stroke,
            node.x,
            node.y,
            node.width,
            node.height,
            node.strokeOpacity ?? 1,
          );
          ctx.lineWidth = strokeWidth;
          ctx.lineJoin = "round";
          ctx.strokeText(ch, colX, y);
        }
        ctx.fillStyle = resolvePaintStyle(
          ctx,
          node.fill,
          node.x,
          node.y,
          node.width,
          node.height,
          node.fillOpacity ?? 1,
        );
        ctx.fillText(ch, colX, y);
      });
    });
    return;
  }

  // Paint the same wrapped lines that measureText uses for hit tests and layout.
  // Alignment shifts each line inside the node box; left is the historical x.
  const align = node.align ?? "left";
  const lineX = widths.map((width) => {
    const spare = node.width - width;
    if (align === "center") return node.x + spare / 2;
    if (align === "right") return node.x + spare;
    return node.x;
  });

  // Paint order: highlight band, then stroke, then fill — a stroke painted
  // after the fill would eat into thin glyphs, and the band must sit behind
  // everything. The highlight gets no shadow; it is backdrop, not glyphs.
  if (node.highlight) {
    ctx.fillStyle = node.highlight;
    lines.forEach((line, index) => {
      ctx.fillRect(
        lineX[index],
        node.y + (lineOffsets?.[index] ?? index * lineHeight),
        widths[index],
        lineHeight,
      );
    });
  }

  const shadow = node.shadow?.enabled ? node.shadow : null;
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }
  const strokeWidth = node.stroke ? (node.strokeWidth ?? 0) : 0;
  lines.forEach((line, index) => {
    const y =
      node.y + (lineOffsets?.[index] ?? index * lineHeight) + baseline + shift;
    if (strokeWidth > 0) {
      ctx.strokeStyle = resolvePaintStyle(
        ctx,
        node.stroke,
        node.x,
        node.y,
        node.width,
        node.height,
        node.strokeOpacity ?? 1,
      );
      ctx.lineWidth = strokeWidth;
      ctx.lineJoin = "round";
      ctx.strokeText(line, lineX[index], y);
    }
    ctx.fillStyle = resolvePaintStyle(
      ctx,
      node.fill,
      node.x,
      node.y,
      node.width,
      node.height,
      node.fillOpacity ?? 1,
    );
    ctx.fillText(line, lineX[index], y);
    // Underline rides the glyph fill, just below the baseline.
    if (node.underline) {
      const thickness = Math.max(1, Math.round(node.fontSize * 0.07));
      ctx.fillRect(lineX[index], y + 3, widths[index], thickness);
    }
  });
}

/**
 * Warped text is painted to an offscreen canvas at the node box size and then
 * pushed through the same mesh machinery as images: the glyphs, highlight
 * band, underline and stroke all deform together, which is what Photoshop's
 * text warp does to the whole layer.
 */
export function drawTextNode(ctx, node) {
  const route = textWarpRoute(node);
  if (!route) {
    paintTextBody(ctx, node);
    return;
  }
  const width = Math.max(1, Math.ceil(node.width));
  const height = Math.max(1, Math.ceil(node.height));
  const off = document.createElement("canvas");
  off.width = width;
  off.height = height;
  const octx = off.getContext("2d");
  if (!octx) return;
  // Paint in node-local space: the body draws in doc coordinates, so shifting
  // by the node's origin lands it at 0,0 — exactly the box the mesh samples.
  octx.translate(-node.x, -node.y);
  paintTextBody(octx, node);

  if (route === "bicubic") {
    const divs = Math.min(
      48,
      Math.max(12, Math.round(12 * warpOutputScale(ctx))),
    );
    const mesh = cachedSubdivision("bicubic", node, ctx, () =>
      subdivideBicubicWarpPatch(warpMeshPointsInDoc(node), divs),
    );
    renderWarpMesh(ctx, off, node.width, node.height, mesh, divs, divs);
  } else if (route === "mesh") {
    const mesh = readNodeTransform(node).mesh;
    const cols = mesh?.cols || 3;
    const rows = mesh?.rows || 3;
    renderWarpMesh(
      ctx,
      off,
      node.width,
      node.height,
      warpMeshPointsInDoc(node),
      cols,
      rows,
    );
  } else {
    const mesh = cachedSubdivision("perspective", node, ctx, () =>
      subdividePerspectiveQuad(perspectiveCornersInDoc(node), 6),
    );
    renderWarpMesh(ctx, off, node.width, node.height, mesh, 6, 6);
  }
}
