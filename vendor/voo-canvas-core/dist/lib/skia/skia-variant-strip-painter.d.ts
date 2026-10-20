import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SkiaFontManager } from "./font-manager.js";
import type { SkiaResourceManager } from "./resource-manager.js";
import type { SceneViewport } from "./scene-types.js";
import { type SkiaVariantStripState } from "./skia-variant-strip.js";
export declare class SkiaVariantStripPainter {
    private readonly canvasKit;
    private readonly resources;
    private readonly fonts;
    private readonly fillPaint;
    private readonly strokePaint;
    constructor(canvasKit: CanvasKitApi, resources: SkiaResourceManager, fonts: SkiaFontManager);
    draw(canvas: SkiaCanvas, strip: SkiaVariantStripState, viewport: SceneViewport): void;
    dispose(): void;
    private drawText;
}
//# sourceMappingURL=skia-variant-strip-painter.d.ts.map