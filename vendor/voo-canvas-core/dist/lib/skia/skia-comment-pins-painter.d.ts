import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SkiaFontManager } from "./font-manager.js";
import type { SceneViewport } from "./scene-types.js";
import type { SkiaCommentPinsState } from "./skia-comment-pins.js";
export declare class SkiaCommentPinsPainter {
    private readonly canvasKit;
    private readonly fonts;
    private readonly fillPaint;
    private readonly strokePaint;
    constructor(canvasKit: CanvasKitApi, fonts: SkiaFontManager);
    draw(canvas: SkiaCanvas, state: SkiaCommentPinsState, viewport: SceneViewport): void;
    dispose(): void;
}
//# sourceMappingURL=skia-comment-pins-painter.d.ts.map