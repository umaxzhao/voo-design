import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SceneViewport } from "./scene-types.js";
import type { SkiaPenDrawOverlayState } from "./skia-pen-draw-overlay.js";
export declare class SkiaPenDrawOverlayPainter {
    private readonly canvasKit;
    private readonly fillPaint;
    private readonly strokePaint;
    constructor(canvasKit: CanvasKitApi);
    draw(canvas: SkiaCanvas, overlay: SkiaPenDrawOverlayState, viewport: SceneViewport): void;
    dispose(): void;
}
//# sourceMappingURL=skia-pen-draw-overlay-painter.d.ts.map