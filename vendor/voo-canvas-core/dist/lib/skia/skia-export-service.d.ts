import type { CanvasKitApi } from "./canvas-kit-types.js";
import type { SceneExportOptions, SceneSnapshot } from "./scene-types.js";
import type { SkiaScenePainter } from "./skia-scene-painter.js";
export declare class SkiaExportService {
    private readonly canvasKit;
    private readonly painter;
    constructor(canvasKit: CanvasKitApi, painter: SkiaScenePainter);
    export(snapshot: SceneSnapshot, options: SceneExportOptions): Uint8Array;
    private renderRaster;
    private resolveImageFormat;
}
//# sourceMappingURL=skia-export-service.d.ts.map