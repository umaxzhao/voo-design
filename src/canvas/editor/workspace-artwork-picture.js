const QUIET_MS = 160;
const MARGIN = 160;
const MAX_BYTES = 32 * 1024 * 1024;
const MIN_NODES = 500;
const requestFrame = callback => typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : setTimeout(callback, 16);
const cancelFrame = id => typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id);

const sameSurface = (a, b) => a && a.stageWidth === b.stageWidth && a.stageHeight === b.stageHeight &&
  a.viewport.zoom === b.viewport.zoom && a.viewport.panX === b.viewport.panX && a.viewport.panY === b.viewport.panY;

/** One bounded artwork-only picture; exact pixels always return after motion. */
export function createArtworkPicture(canvas, engine) {
  let picture, current, currentStamp, timer = 0, refinementFrame = 0, disposed = false, nodes, ids;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ARTWORK_PICTURE_CONTEXT_UNAVAILABLE");
  const release = () => {
    if (picture) picture.canvas.width = picture.canvas.height = 0;
    picture = null;
    canvas.dataset.artworkWarm = "false";
  };
  const cancel = () => {
    clearTimeout(timer); timer = 0;
    if (refinementFrame) cancelFrame(refinementFrame);
    refinementFrame = 0;
  };
  const stampOf = () => engine.getArtworkStamp?.() ?? null;
  const render = (target, surface) => {
    const next = engine.getDocument().nodes;
    if (nodes !== next) { nodes = next; ids = nodes.map(node => node.id); }
    engine.renderLayerPass(target, ids, surface);
  };
  const schedule = (callback) => {
    cancel();
    timer = setTimeout(() => {
      timer = 0;
      // Let already queued input cancel refinement before a costly exact pass.
      refinementFrame = requestFrame(() => {
        refinementFrame = 0;
        if (!disposed) callback();
      });
    }, QUIET_MS);
  };
  const copy = (margin, surface, stamp) => {
    const dpr = window.devicePixelRatio || 1;
    margin = Math.round(margin * dpr) / dpr;
    const width = Math.round((surface.stageWidth + margin * 2) * dpr);
    const height = Math.round((surface.stageHeight + margin * 2) * dpr);
    if (width * height * 4 > MAX_BYTES) return;
    const bitmap = canvas.ownerDocument.createElement("canvas");
    bitmap.width = width; bitmap.height = height;
    const target = bitmap.getContext("2d");
    if (!target) { bitmap.width = bitmap.height = 0; throw new Error("ARTWORK_PICTURE_CONTEXT_UNAVAILABLE"); }
    try {
      if (margin) render(bitmap, { ...surface, stageWidth: surface.stageWidth + margin * 2,
        stageHeight: surface.stageHeight + margin * 2,
        viewport: { ...surface.viewport, panX: surface.viewport.panX + margin, panY: surface.viewport.panY + margin } });
      // Preserve the authoritative viewport exactly; overscan is only a motion preview.
      target.clearRect(margin * dpr, margin * dpr, canvas.width, canvas.height);
      target.drawImage(canvas, margin * dpr, margin * dpr);
      release();
      picture = { canvas: bitmap, surface, stamp, margin, dpr };
      canvas.dataset.artworkWarm = margin ? "true" : "false";
    } catch (error) { bitmap.width = bitmap.height = 0; throw error; }
  };
  const warm = (surface, stamp) => {
    if (stampOf() !== stamp || !sameSurface(current, surface)) return;
    const dpr = window.devicePixelRatio || 1;
    let margin = MARGIN;
    while (margin > 0 && (surface.stageWidth + margin * 2) * (surface.stageHeight + margin * 2) * dpr ** 2 * 4 > MAX_BYTES) margin = Math.floor(margin / 2);
    if (margin) copy(margin, surface, stamp);
  };
  const preview = (surface, stamp) => {
    if (!picture || picture.stamp !== stamp ||
        picture.surface.stageWidth !== surface.stageWidth || picture.surface.stageHeight !== surface.stageHeight ||
        picture.dpr !== (window.devicePixelRatio || 1)) return false;
    const scale = surface.viewport.zoom / picture.surface.viewport.zoom;
    if (scale < .5 || scale > 2) return false;
    const x = surface.viewport.panX - (picture.surface.viewport.panX + picture.margin) * scale;
    const y = surface.viewport.panY - (picture.surface.viewport.panY + picture.margin) * scale;
    if (x > 0 || y > 0 || x + picture.canvas.width / picture.dpr * scale < surface.stageWidth ||
        y + picture.canvas.height / picture.dpr * scale < surface.stageHeight) return false;
    context.save();
    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.setTransform(scale, 0, 0, scale, x * picture.dpr, y * picture.dpr);
      context.drawImage(picture.canvas, 0, 0);
    } finally { context.restore(); }
    canvas.dataset.artworkState = "preview";
    return true;
  };
  const paint = (surface, forceExact = false) => {
    if (disposed) return;
    const stamp = stampOf();
    const dpr = window.devicePixelRatio || 1;
    if (!forceExact && stamp && stamp === currentStamp && sameSurface(current, surface) &&
        canvas.width === Math.round(surface.stageWidth * dpr) && canvas.height === Math.round(surface.stageHeight * dpr)) return;
    current = surface; currentStamp = stamp;
    cancel();
    if (!forceExact && stamp && preview(surface, stamp)) {
      schedule(() => paint(current, true));
      return;
    }
    render(canvas, surface);
    release();
    canvas.dataset.artworkState = "exact";
    const eligible = stamp && engine.getDocument().nodes.length >= MIN_NODES &&
      canvas.width === Math.round(surface.stageWidth * dpr) && canvas.height === Math.round(surface.stageHeight * dpr) &&
      canvas.width * canvas.height * 4 <= MAX_BYTES;
    if (eligible) {
      copy(0, surface, stamp);
      schedule(() => warm(surface, stamp));
    }
  };
  return {
    paint,
    dispose() {
      disposed = true; cancel(); release();
      delete canvas.dataset.artworkState; delete canvas.dataset.artworkWarm;
    },
  };
}
