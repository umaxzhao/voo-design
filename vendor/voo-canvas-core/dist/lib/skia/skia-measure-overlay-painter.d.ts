import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SkiaFontManager } from "./font-manager.js";
import type { SceneViewport } from "./scene-types.js";
import { type SkiaMeasureOverlayState } from "./skia-measure-overlay.js";
export declare class SkiaMeasureOverlayPainter {
    private readonly canvasKit;
    private readonly fonts;
    private readonly paint;
    constructor(canvasKit: CanvasKitApi, fonts: SkiaFontManager);
    draw(canvas: SkiaCanvas, overlay: SkiaMeasureOverlayState, viewport: SceneViewport): void;
    dispose(): void;
    private drawLabel;
}
//# sourceMappingURL=skia-measure-overlay-painter.d.ts.map