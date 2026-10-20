function layerSignature(node) {
  return JSON.stringify([
    node.kind,
    node.x,
    node.y,
    node.width,
    node.height,
    node.text,
    node.fill,
    node.stroke,
    node.opacity,
  ]);
}

/** Follow the last visible layer changed by a successfully parsed stream. */
export function streamingCursorTarget(doc, previousSignatures = []) {
  const nodes = doc.nodes ?? [];
  const signatures = nodes.map(layerSignature);
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (signatures[index] === previousSignatures[index]) continue;
    if (node.kind === "group") continue;
    if (
      ![node.x, node.y, node.width, node.height].every(Number.isFinite) ||
      node.width <= 0 ||
      node.height <= 0
    ) {
      continue;
    }
    const x =
      node.kind === "text"
        ? node.x + node.width * 0.85
        : node.x + node.width / 2;
    const y = node.y + Math.min(node.height / 2, 32);
    return {
      signatures,
      target: {
        x: Math.max(0, Math.min(doc.width, x)),
        y: Math.max(0, Math.min(doc.height, y)),
      },
    };
  }
  return { signatures, target: null };
}

/** Map document coordinates through an object-contain canvas into its wrapper. */
export function streamingCursorScreenPoint({ target, doc, canvas, wrapper }) {
  const scale = Math.min(canvas.width / doc.width, canvas.height / doc.height);
  return {
    x:
      canvas.left -
      wrapper.left +
      (canvas.width - doc.width * scale) / 2 +
      target.x * scale,
    y:
      canvas.top -
      wrapper.top +
      (canvas.height - doc.height * scale) / 2 +
      target.y * scale,
  };
}
