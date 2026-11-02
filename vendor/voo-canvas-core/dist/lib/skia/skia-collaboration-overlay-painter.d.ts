import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SkiaFontManager } from "./font-manager.js";
import type { SceneViewport } from "./scene-types.js";
import type { SkiaPeerSelectionState, SkiaRemoteCursorState } from "./skia-collaboration-overlay.js";
export declare class SkiaCollaborationOverlayPainter {
    private readonly canvasKit;
    private readonly fonts;
    private readonly fillPaint;
    private readonly strokePaint;
    private readonly cursorPath;
    constructor(canvasKit: CanvasKitApi, fonts: SkiaFontManager);
    drawSelections(canvas: SkiaCanvas, selections: readonly SkiaPeerSelectionState[], viewport: SceneViewport): void;
    drawCursors(canvas: SkiaCanvas, cursors: readonly SkiaRemoteCursorState[], viewport: SceneViewport, timestampMs: number): void;
    dispose(): void;
    private drawLabel;
}
//# sourceMappingURL=skia-collaboration-overlay-painter.d.ts.map