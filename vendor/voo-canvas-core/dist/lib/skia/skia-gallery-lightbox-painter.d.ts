import type { CanvasKitApi, SkiaCanvas } from "./canvas-kit-types.js";
import type { SkiaFontManager } from "./font-manager.js";
import type { SkiaResourceManager } from "./resource-manager.js";
import type { SceneViewport } from "./scene-types.js";
import { type SkiaGalleryLightboxState } from "./skia-gallery-lightbox.js";
import type { SkiaVideoPlaybackState } from "./skia-video-playback.js";
export declare class SkiaGalleryLightboxPainter {
    private readonly canvasKit;
    private readonly resources;
    private readonly fonts;
    private readonly fillPaint;
    private readonly videoPainter;
    constructor(canvasKit: CanvasKitApi, resources: SkiaResourceManager, fonts: SkiaFontManager);
    draw(canvas: SkiaCanvas, lightbox: SkiaGalleryLightboxState, viewport: SceneViewport, videoPlayback?: SkiaVideoPlaybackState | null): void;
    dispose(): void;
    private drawButton;
}
//# sourceMappingURL=skia-gallery-lightbox-painter.d.ts.map