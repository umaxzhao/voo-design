/** Keep connected foreground components actually touched by a scribble. */
export function objectStrokeMask(alpha, width, height, points) {
  const count = width * height;
  if (alpha.length !== count) throw new RangeError("Invalid object matte dimensions");
  const selected = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0,
    tail = 0;
  const enqueue = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (selected[index] || alpha[index] < 128) return;
    selected[index] = 1;
    queue[tail++] = index;
  };
  for (let i = 0; i < points.length; i++) {
    const start = points[Math.max(0, i - 1)],
      end = points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y)));
    for (let step = 0; step <= steps; step++) {
      const x = Math.round(start.x + (end.x - start.x) * step / steps);
      const y = Math.round(start.y + (end.y - start.y) * step / steps);
      enqueue(x, y);
    }
  }
  while (head < tail) {
    const index = queue[head++],
      x = index % width,
      y = Math.floor(index / width);
    enqueue(x - 1, y);
    enqueue(x + 1, y);
    enqueue(x, y - 1);
    enqueue(x, y + 1);
  }
  const result = new Uint8Array(count);
  for (let i = 0; i < count; i++) if (selected[i]) result[i] = alpha[i];
  return result;
}
export async function matteUnderObjectStroke(blob, points) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", {
      willReadFrequently: true
    });
    if (!context) throw new Error("objectSelectionCanvasUnavailable");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    const alpha = new Uint8Array(bitmap.width * bitmap.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels.data[i * 4 + 3];
    const selected = objectStrokeMask(alpha, bitmap.width, bitmap.height, points);
    for (let i = 0; i < selected.length; i++) pixels.data[i * 4 + 3] = selected[i];
    context.putImageData(pixels, 0, 0);
    return canvas.convertToBlob({
      type: "image/png"
    });
  } finally {
    bitmap.close();
  }
}
