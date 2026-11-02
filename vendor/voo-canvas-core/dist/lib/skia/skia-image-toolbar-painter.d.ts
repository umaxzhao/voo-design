import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SkiaFontManager } from "./font-manager.js";
import type { SceneViewport } from "./scene-types.js";
import { type SkiaImageToolbarState } from "./skia-image-toolbar.js";
export declare class SkiaImageToolbarPainter {
    private readonly canvasKit;
    private readonly fonts;
    private readonly fillPaint;
    private readonly strokePaint;
    constructor(canvasKit: CanvasKitApi, fonts: SkiaFontManager);
    draw(canvas: SkiaCanvas, toolbar: SkiaImageToolbarState, viewport: SceneViewport): void;
    private drawTooltip;
    dispose(): void;
}
//# sourceMappingURL=skia-image-toolbar-painter.d.ts.map