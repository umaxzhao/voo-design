// Screen-to-document and document-to-screen coordinate transforms for stage chrome.

export function docToScreenRect(rect, viewport) {
  return {
    x: rect.x * viewport.zoom + viewport.panX,
    y: rect.y * viewport.zoom + viewport.panY,
    width: rect.width * viewport.zoom,
    height: rect.height * viewport.zoom,
  };
}

export function docToScreenPoint(point, viewport) {
  // Support both object {x, y} and array [x, y] point formats.
  const px = Array.isArray(point) ? point[0] : point.x;
  const py = Array.isArray(point) ? point[1] : point.y;
  return {
    x: px * viewport.zoom + viewport.panX,
    y: py * viewport.zoom + viewport.panY,
  };
}
