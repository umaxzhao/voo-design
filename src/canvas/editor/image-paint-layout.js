/** Image paints share centred cover/contain and natural-size tiling across node kinds. */
export function imagePaintLayout(node, width, height, mode = "fill") {
  const scale = mode === "tile" ? 1 : mode === "fit" ? Math.min(node.width / width, node.height / height) : Math.max(node.width / width, node.height / height);
  return {
    scale,
    x: node.x + (mode === "tile" ? 0 : (node.width - width * scale) / 2),
    y: node.y + (mode === "tile" ? 0 : (node.height - height * scale) / 2),
    width: width * scale,
    height: height * scale
  };
}
export function drawImagePaint(ctx, image, node, original = image) {
  const sourceWidth = original.naturalWidth ?? original.width;
  const sourceHeight = original.naturalHeight ?? original.height;
  const layout = imagePaintLayout(node, sourceWidth, sourceHeight, node.imageScaleMode);
  ctx.save();
  ctx.beginPath();
  ctx.rect(node.x, node.y, node.width, node.height);
  ctx.clip();
  if (node.imageScaleMode === "tile") {
    const pattern = ctx.createPattern(image, "repeat");
    if (pattern) {
      pattern.setTransform(new DOMMatrix().translate(node.x, node.y).scale(sourceWidth / image.width, sourceHeight / image.height));
      ctx.fillStyle = pattern;
      ctx.fillRect(node.x, node.y, node.width, node.height);
    }
  } else ctx.drawImage(image, layout.x, layout.y, layout.width, layout.height);
  ctx.restore();
}
