import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SkiaPenEditOverlayState } from "./skia-pen-edit-overlay.js";
import type { SceneViewport } from "./scene-types.js";
export declare class SkiaPenEditOverlayPainter {
    private readonly canvasKit;
    private readonly fillPaint;
    private readonly strokePaint;
    constructor(canvasKit: CanvasKitApi);
    draw(canvas: SkiaCanvas, overlay: SkiaPenEditOverlayState, viewport: SceneViewport): void;
    dispose(): void;
    private drawHandle;
    private drawLine;
}
//# sourceMappingURL=skia-pen-edit-overlay-painter.d.ts.map