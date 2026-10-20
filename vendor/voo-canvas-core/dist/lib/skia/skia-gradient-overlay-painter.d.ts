import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SceneViewport } from "./scene-types.js";
import type { SkiaGradientOverlayState } from "./skia-gradient-overlay.js";
export declare class SkiaGradientOverlayPainter {
    private readonly canvasKit;
    private readonly fillPaint;
    private readonly strokePaint;
    constructor(canvasKit: CanvasKitApi);
    draw(canvas: SkiaCanvas, overlay: SkiaGradientOverlayState, viewport: SceneViewport): void;
    dispose(): void;
    private toScreen;
    private drawHandle;
}
//# sourceMappingURL=skia-gradient-overlay-painter.d.ts.map