import type { CanvasKitApi, SkiaCanvas, SkiaPaint } from "./canvas-kit-types.js";
import type { SceneImageLayout } from "./image-layout.js";
import type { RasterDocument, RasterStrokePoint, RasterStrokeSelection } from "../raster/raster-document.js";
interface RasterPointMapping {
    sourceX: number;
    sourceY: number;
    sourceWidth: number;
    sourceHeight: number;
    destinationX: number;
    destinationY: number;
    destinationWidth: number;
    destinationHeight: number;
}
export declare function createRasterPointMapping(_document: RasterDocument, layout: SceneImageLayout): RasterPointMapping;
export declare function mapRasterPoint(point: RasterStrokePoint, mapping: RasterPointMapping): {
    x: number;
    y: number;
};
export declare function clipRasterSelection(canvasKit: CanvasKitApi, canvas: SkiaCanvas, document: RasterDocument, layout: SceneImageLayout, selection: RasterStrokeSelection): void;
export declare function drawRasterStrokes(canvasKit: CanvasKitApi, canvas: SkiaCanvas, paint: SkiaPaint, document: RasterDocument, layout: SceneImageLayout): void;
export declare function drawRasterGradients(canvasKit: CanvasKitApi, canvas: SkiaCanvas, paint: SkiaPaint, document: RasterDocument, layout: SceneImageLayout): void;
export {};
//# sourceMappingURL=raster-stroke-painter.d.ts.map