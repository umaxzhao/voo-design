/** Image paints share centred cover/contain and natural-size tiling across node kinds. */
export function imagePaintLayout(node, width, height, mode = "fill") {
  const scale = mode === "tile" ? node.imageTileScale ?? 1 : mode === "fit" ? Math.min(node.width / width, node.height / height) : Math.max(node.width / width, node.height / height);
  return {
    scale,
    x: node.x + (mode === "tile" ? 0 : (node.width - width * scale) / 2),
    y: node.y + (mode === "tile" ? 0 : (node.height - height * scale) / 2),
    width: width * scale,
    height: height * scale
  };
}

/** Invert normalized crop sampling once into a source-pixel placement matrix. */
export function imagePaintMatrix(node, width, height) {
  const sampling = node.imageTransform;
  if (Array.isArray(sampling) && sampling.length === 6 && sampling.every(Number.isFinite)) {
    const [a, b, c, d, e, f] = sampling;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) > 1e-10 && width > 0 && height > 0) {
      return [node.width * d / determinant / width, -node.height * b / determinant / width,
        -node.width * c / determinant / height, node.height * a / determinant / height,
        node.x + node.width * (c * f - d * e) / determinant,
        node.y + node.height * (b * e - a * f) / determinant];
    }
  }
  const layout = imagePaintLayout(node, width, height, node.imageScaleMode);
  return [layout.scale, 0, 0, layout.scale, layout.x, layout.y];
}
export function drawImagePaint(ctx, image, node, original = image) {
  const sourceWidth = original.naturalWidth ?? original.width;
  const sourceHeight = original.naturalHeight ?? original.height;
  const layout = imagePaintLayout(node, sourceWidth, sourceHeight, node.imageScaleMode);
  ctx.save();
  ctx.beginPath();
  ctx.rect(node.x, node.y, node.width, node.height);
  ctx.clip();
  if (node.imageTransform) {
    ctx.transform(...imagePaintMatrix(node, sourceWidth, sourceHeight));
    ctx.drawImage(image, 0, 0, sourceWidth, sourceHeight);
  } else if (node.imageScaleMode === "tile") {
    const pattern = ctx.createPattern(image, "repeat");
    if (pattern) {
      const scale = node.imageTileScale ?? 1;
      pattern.setTransform(new DOMMatrix().translate(node.x, node.y).scale(sourceWidth / image.width * scale, sourceHeight / image.height * scale));
      ctx.fillStyle = pattern;
      ctx.fillRect(node.x, node.y, node.width, node.height);
    }
  } else ctx.drawImage(image, layout.x, layout.y, layout.width, layout.height);
  ctx.restore();
}
