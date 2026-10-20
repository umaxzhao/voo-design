import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SceneViewport } from "./scene-types.js";
import type { SkiaAgentCursor } from "./skia-agent-cursor.js";
export declare class SkiaAgentCursorPainter {
    private readonly canvasKit;
    private readonly fillPaint;
    private readonly strokePaint;
    private readonly pulsePaint;
    private readonly cursorPath;
    constructor(canvasKit: CanvasKitApi);
    draw(canvas: SkiaCanvas, cursor: SkiaAgentCursor, viewport: SceneViewport, timestampMs: number): void;
    dispose(): void;
}
//# sourceMappingURL=skia-agent-cursor-painter.d.ts.map