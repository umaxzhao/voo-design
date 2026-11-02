import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SkiaFontManager } from "./font-manager.js";
import { type SkiaContextMenuState } from "./skia-context-menu.js";
export declare class SkiaContextMenuPainter {
    private readonly canvasKit;
    private readonly fonts;
    private readonly fillPaint;
    private readonly strokePaint;
    constructor(canvasKit: CanvasKitApi, fonts: SkiaFontManager);
    draw(canvas: SkiaCanvas, menu: SkiaContextMenuState, viewport: {
        width: number;
        height: number;
    }): void;
    dispose(): void;
    private drawLabel;
}
//# sourceMappingURL=skia-context-menu-painter.d.ts.map