// One state scope for documents made entirely of plain solid rectangles.
// Eligibility follows immutable node/array identity, so camera changes do not
// recheck paint properties or allocate per-node closures and render state.
const eligibleNodes = new WeakMap();
const eligibleLists = new WeakMap();

export function isPlainRect(node) {
  if (eligibleNodes.has(node)) return eligibleNodes.get(node);
  let eligible = node.kind === "rect" && !node.parentId && !node.fills && !node.strokes?.length && !node.fillHidden && !node.fillBlendMode && !node.maskBase && !node.clipTo &&
    !node.rotation && !node.shear && !node.flipH && !node.flipV &&
    !node.cornerRadius && !node.strokeWidth && !node.layerBlur && !node.backgroundBlur && !node.noise &&
    (!node.blendMode || node.blendMode === "source-over") &&
    (node.fillOpacity ?? 1) === 1 && typeof node.fill === "string" && /^#[0-9a-f]{6}$/i.test(node.fill);
  for (const key in node.effects) {
    if (node.effects[key]?.enabled) eligible = false;
  }
  eligibleNodes.set(node, eligible);
  return eligible;
}

export function isPlainRectList(nodes) {
  let eligible = eligibleLists.get(nodes);
  if (eligible === undefined) {
    eligible = nodes.every(isPlainRect);
    eligibleLists.set(nodes, eligible);
  }
  return eligible;
}

export function drawPlainRects(ctx, nodes, { visibleSet, hiddenNodeId, paintNodeIds, paintBounds } = {}) {
  if (!isPlainRectList(nodes)) return false;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const node of nodes) {
    if (!node.visible || node.id === hiddenNodeId ||
        (visibleSet && !visibleSet.has(node.id)) ||
        (paintNodeIds && !paintNodeIds.has(node.id))) continue;
    if (paintBounds && (node.x + node.width < paintBounds.x ||
        node.y + node.height < paintBounds.y ||
        node.x > paintBounds.x + paintBounds.width ||
        node.y > paintBounds.y + paintBounds.height)) continue;
    ctx.globalAlpha = node.opacity ?? 1;
    ctx.fillStyle = node.fill;
    ctx.fillRect(node.x, node.y, node.width, node.height);
  }
  ctx.restore();
  return true;
}
