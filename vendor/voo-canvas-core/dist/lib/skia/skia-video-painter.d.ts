import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SkiaResourceManager } from "./resource-manager.js";
import type { SceneNode, SceneViewport } from "./scene-types.js";
import { type SkiaVideoPlaybackState } from "./skia-video-playback.js";
export declare class SkiaVideoPainter {
    private readonly canvasKit;
    private readonly resources;
    private readonly fillPaint;
    private readonly strokePaint;
    constructor(canvasKit: CanvasKitApi, resources: SkiaResourceManager);
    private configurePaints;
    drawNode(canvas: SkiaCanvas, node: SceneNode, playback: SkiaVideoPlaybackState | null): void;
    drawLightbox(canvas: SkiaCanvas, viewport: SceneViewport, playback: SkiaVideoPlaybackState): void;
    dispose(): void;
    private drawControls;
    private drawPlayGlyph;
}
//# sourceMappingURL=skia-video-painter.d.ts.map