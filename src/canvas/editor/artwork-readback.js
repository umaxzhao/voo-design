/** Reuse a separate artwork surface so eyedroppers never sample stage chrome. */
export function createArtworkReadback(getEngine) {
  let canvas = null;
  return () => {
    const engine = getEngine();
    engine?.prepareCanvasReadback?.();
    // Free-canvas engines already provide a chrome-free measurement surface.
    if (!engine || engine.getDocument().isCanvasRoot) return undefined;
    canvas ??= document.createElement("canvas");
    engine.renderArtwork(canvas);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Artwork sampling requires a Canvas2D context");
    return context;
  };
}
