// Multi-tier bitmap and vector-fill image node rendering with warp mesh support.

import { applyAdjustments, applyMatte } from "./cpu_adjustments.js";
import {
  renderWarpMesh,
  subdividePerspectiveQuad,
  subdivideBicubicWarpPatch,
} from "./mesh_transform.js";
import {
  resolveRasterLevelFromPyramid,
  sourceAtRasterLevel,
} from "./raster_level.js";
import { readNodeTransform } from "./scene_state_contract.js";
import { croppedImageSource, drawImageCrop } from "./image_layer_crop.js";
import {
  fillRoundRect,
  isImagePaint,
  resolvePaintStyle,
  roundRectPath,
  strokeRoundRect,
} from "./render_basic_shapes.js";
import { resolveCornerRadii } from "./scene_model_core.js";
import {
  cachedSubdivision,
  perspectiveCornersInDoc,
  warpMeshPointsInDoc,
  warpOutputScale,
} from "./render_warp_geometry.js";

/**
 * How many pixels the GPU should actually produce for a node.
 *
 * A preview only ever needs the pixels the screen will show, which is what
 * makes a zoomed-out 4K picture cheap; an export needs the bitmap at its
 * natural size. Both feed the same shader, so the colours match either way.
 */
function targetPixelSize(node, bitmap, rasterLevel) {
  const naturalWidth = bitmap.naturalWidth ?? bitmap.width;
  const naturalHeight = bitmap.naturalHeight ?? bitmap.height;
  if (rasterLevel.fullResolution) {
    return { width: naturalWidth, height: naturalHeight };
  }
  const crop = node?.crop;
  const hasCrop =
    crop &&
    Number.isFinite(crop.width) &&
    crop.width > 0 &&
    Number.isFinite(crop.height) &&
    crop.height > 0;

  if (hasCrop && node.width > 0) {
    const scale = (rasterLevel.displayScale * naturalWidth) / crop.width;
    return {
      width: Math.max(
        1,
        Math.min(naturalWidth, Math.ceil(naturalWidth * scale)),
      ),
      height: Math.max(
        1,
        Math.min(naturalHeight, Math.ceil(naturalHeight * scale)),
      ),
    };
  }

  const scale = rasterLevel.displayScale;
  const outputScale =
    node.width > 0 ? (scale * naturalWidth) / node.width : scale;
  return {
    width: Math.max(1, Math.min(naturalWidth, Math.ceil(naturalWidth * scale))),
    height: Math.max(
      1,
      Math.min(naturalHeight, Math.ceil(node.height * outputScale)),
    ),
  };
}

export function drawImageNode(
  ctx,
  node,
  bitmap,
  matte,
  gpu,
  bypassAdjustments,
  renderState = null,
) {
  const radii = resolveCornerRadii(node.cornerRadius, node.width, node.height);
  const hasRadius =
    radii.tl > 0 || radii.tr > 0 || radii.br > 0 || radii.bl > 0;
  const fillAlpha = node.fillOpacity ?? 1;
  const strokeAlpha = node.strokeOpacity ?? 1;

  // On an image node the fill types are alternatives, not layers: the image
  // fill *is* the bitmap, while a solid or gradient fill replaces it. Painting
  // a vector fill behind the picture would make the fill switch invisible —
  // the picture always wins on top — which is exactly what the fill picker's
  // type tabs promise to switch.
  const vectorFill =
    node.fill &&
    node.fill !== "transparent" &&
    !isImagePaint(node.fill) &&
    fillAlpha > 0 &&
    node.fillHidden !== true;

  if (vectorFill) {
    ctx.fillStyle = resolvePaintStyle(
      ctx,
      node.fill,
      node.x,
      node.y,
      node.width,
      node.height,
      fillAlpha,
    );
    fillRoundRect(ctx, node.x, node.y, node.width, node.height, radii);
    if (
      node.stroke &&
      node.stroke !== "transparent" &&
      node.strokeWidth > 0 &&
      strokeAlpha > 0 &&
      node.strokeHidden !== true
    ) {
      ctx.strokeStyle = resolvePaintStyle(
        ctx,
        node.stroke,
        node.x,
        node.y,
        node.width,
        node.height,
        strokeAlpha,
      );
      ctx.lineWidth = node.strokeWidth;
      const strokeRadii = radii.isUniform
        ? Math.max(0, radii.uniformRadius - node.strokeWidth / 2)
        : {
            tl: Math.max(0, radii.tl - node.strokeWidth / 2),
            tr: Math.max(0, radii.tr - node.strokeWidth / 2),
            br: Math.max(0, radii.br - node.strokeWidth / 2),
            bl: Math.max(0, radii.bl - node.strokeWidth / 2),
          };
      strokeRoundRect(
        ctx,
        node.x + node.strokeWidth / 2,
        node.y + node.strokeWidth / 2,
        Math.max(0, node.width - node.strokeWidth),
        Math.max(0, node.height - node.strokeWidth),
        strokeRadii,
      );
    }
    return;
  }

  if (!bitmap) return;

  const fullResolution = Boolean(gpu?.fullResolution);
  const rasterLevel = resolveRasterLevelFromPyramid({
    source: bitmap,
    nodeWidth: node.width,
    viewport: gpu?.viewport,
    dpr: gpu?.dpr,
    fullResolution,
  });
  const effectiveBitmap = rasterLevel.source;
  const effectiveMatte = matte ? sourceAtRasterLevel(matte, rasterLevel) : null;

  const clipSelection =
    node.id != null &&
    renderState?.selectionTransform?.nodeId === node.id &&
    renderState.selectionTransform.sourceContours?.length > 0;

  if (clipSelection) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(node.x - 50, node.y - 50, node.width + 100, node.height + 100);
    for (const ring of renderState.selectionTransform.sourceContours) {
      ring.forEach(([x, y], idx) => {
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.clip("evenodd");
  }

  // Hold-to-compare swaps in identity adjustments: both render paths hit
  // their identity early-out and return the source untouched, and since the
  // real signature never enters the caches, comparing pollutes nothing.
  const adjustments = bypassAdjustments ? null : node.adjustments;

  if (hasRadius) {
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, node.x, node.y, node.width, node.height, radii);
    ctx.clip();
  }

  if (gpu?.renderer) {
    const size = targetPixelSize(node, effectiveBitmap, rasterLevel);
    const rendered = gpu.renderer.render({
      source: effectiveBitmap,
      matte: effectiveMatte,
      adjustments,
      width: size.width,
      height: size.height,
    });
    // A failed frame falls back to the CPU path — at the very target size
    // the GPU pass was asked for, so the fallback is not the expensive one.
    const imgToDraw =
      rendered ||
      applyAdjustments(
        effectiveMatte
          ? applyMatte(effectiveBitmap, effectiveMatte)
          : effectiveBitmap,
        adjustments,
        {
          targetWidth: size.width,
          targetHeight: size.height,
        },
      );
    const transform = readNodeTransform(node, { ignoreIdentity: true });
    if (
      transform.kind === "warp" &&
      transform.mesh &&
      Array.isArray(transform.mesh.points)
    ) {
      const imageForNode = croppedImageSource(imgToDraw, node, bitmap);
      if (
        transform.mesh.type === "bicubic" ||
        (transform.mesh.cols === 3 &&
          transform.mesh.rows === 3 &&
          transform.mesh.points.length === 16 &&
          transform.mesh.isCurve !== false)
      ) {
        const divs = Math.min(
          48,
          Math.max(12, Math.round(12 * warpOutputScale(ctx))),
        );
        const mesh = cachedSubdivision("bicubic", node, ctx, () =>
          subdivideBicubicWarpPatch(warpMeshPointsInDoc(node), divs),
        );
        renderWarpMesh(
          ctx,
          imageForNode,
          node.width,
          node.height,
          mesh,
          divs,
          divs,
        );
      } else {
        const cols = transform.mesh.cols || 3;
        const rows = transform.mesh.rows || 3;
        renderWarpMesh(
          ctx,
          imageForNode,
          node.width,
          node.height,
          warpMeshPointsInDoc(node),
          cols,
          rows,
          transform.mesh.activeCells,
        );
      }
    } else if (
      transform.kind === "perspective" &&
      transform.corners &&
      transform.corners.length === 4
    ) {
      const imageForNode = croppedImageSource(imgToDraw, node, bitmap);
      const mesh = cachedSubdivision("perspective", node, ctx, () =>
        subdividePerspectiveQuad(perspectiveCornersInDoc(node), 6),
      );
      renderWarpMesh(ctx, imageForNode, node.width, node.height, mesh, 6, 6);
    } else {
      drawImageCrop(ctx, imgToDraw, node, bitmap);
    }
  } else {
    const source = effectiveMatte
      ? applyMatte(effectiveBitmap, effectiveMatte)
      : effectiveBitmap;
    const target = gpu
      ? targetPixelSize(node, effectiveBitmap, rasterLevel)
      : null;
    const adjusted = applyAdjustments(
      source,
      adjustments,
      target
        ? { targetWidth: target.width, targetHeight: target.height }
        : null,
    );
    const transform = readNodeTransform(node, { ignoreIdentity: true });
    if (
      transform.kind === "warp" &&
      transform.mesh &&
      Array.isArray(transform.mesh.points)
    ) {
      const imageForNode = croppedImageSource(adjusted, node, bitmap);
      if (
        transform.mesh.type === "bicubic" ||
        (transform.mesh.cols === 3 &&
          transform.mesh.rows === 3 &&
          transform.mesh.points.length === 16 &&
          transform.mesh.isCurve !== false)
      ) {
        const divs = Math.min(
          48,
          Math.max(12, Math.round(12 * warpOutputScale(ctx))),
        );
        const mesh = cachedSubdivision("bicubic", node, ctx, () =>
          subdivideBicubicWarpPatch(warpMeshPointsInDoc(node), divs),
        );
        renderWarpMesh(
          ctx,
          imageForNode,
          node.width,
          node.height,
          mesh,
          divs,
          divs,
        );
      } else {
        const cols = transform.mesh.cols || 3;
        const rows = transform.mesh.rows || 3;
        renderWarpMesh(
          ctx,
          imageForNode,
          node.width,
          node.height,
          warpMeshPointsInDoc(node),
          cols,
          rows,
          transform.mesh.activeCells,
        );
      }
    } else if (
      transform.kind === "perspective" &&
      transform.corners &&
      transform.corners.length === 4
    ) {
      const imageForNode = croppedImageSource(adjusted, node, bitmap);
      const mesh = cachedSubdivision("perspective", node, ctx, () =>
        subdividePerspectiveQuad(perspectiveCornersInDoc(node), 6),
      );
      renderWarpMesh(ctx, imageForNode, node.width, node.height, mesh, 6, 6);
    } else {
      drawImageCrop(ctx, adjusted, node, bitmap);
    }
  }

  if (hasRadius) {
    ctx.restore();
  }

  if (clipSelection) {
    ctx.restore();
  }

  if (
    node.stroke &&
    node.stroke !== "transparent" &&
    node.strokeWidth > 0 &&
    strokeAlpha > 0 &&
    node.strokeHidden !== true
  ) {
    ctx.strokeStyle = resolvePaintStyle(
      ctx,
      node.stroke,
      node.x,
      node.y,
      node.width,
      node.height,
      strokeAlpha,
    );
    ctx.lineWidth = node.strokeWidth;
    if (hasRadius) {
      const strokeRadii = radii.isUniform
        ? Math.max(0, radii.uniformRadius - node.strokeWidth / 2)
        : {
            tl: Math.max(0, radii.tl - node.strokeWidth / 2),
            tr: Math.max(0, radii.tr - node.strokeWidth / 2),
            br: Math.max(0, radii.br - node.strokeWidth / 2),
            bl: Math.max(0, radii.bl - node.strokeWidth / 2),
          };
      strokeRoundRect(
        ctx,
        node.x + node.strokeWidth / 2,
        node.y + node.strokeWidth / 2,
        Math.max(0, node.width - node.strokeWidth),
        Math.max(0, node.height - node.strokeWidth),
        strokeRadii,
      );
    } else {
      ctx.strokeRect(
        node.x + node.strokeWidth / 2,
        node.y + node.strokeWidth / 2,
        Math.max(0, node.width - node.strokeWidth),
        Math.max(0, node.height - node.strokeWidth),
      );
    }
  }
}
