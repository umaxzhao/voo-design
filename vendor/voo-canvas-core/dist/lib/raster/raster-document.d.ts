import type { ImageAdjustments } from "../paint-layers.js";
export declare const RASTER_DOCUMENT_VERSION: 1;
export declare const RASTER_ALGORITHM_VERSION: 1;
export type RasterCurveChannel = "rgb" | "red" | "green" | "blue";
export interface RasterSource {
    kind: "asset" | "url";
    assetId?: string;
    url: string;
    width?: number;
    height?: number;
    colorSpace: "srgb";
}
export interface RasterCrop {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface RasterTransform {
    rotation: number;
    flipHorizontal: boolean;
    flipVertical: boolean;
    offsetX: number;
    offsetY: number;
}
export interface RasterCurvePoint {
    x: number;
    y: number;
}
interface RasterAdjustmentBase {
    id: string;
    enabled: boolean;
    opacity: number;
    maskId?: string;
    algorithmVersion: number;
}
export interface RasterBasicAdjustment extends RasterAdjustmentBase {
    type: "basic";
    params: ImageAdjustments;
}
export interface RasterCurvesAdjustment extends RasterAdjustmentBase {
    type: "curves";
    params: {
        channel: RasterCurveChannel;
        points: RasterCurvePoint[];
    };
}
export interface RasterHslAdjustment extends RasterAdjustmentBase {
    type: "hsl";
    params: {
        hue: number;
        saturation: number;
        lightness: number;
        colorize: boolean;
    };
}
export interface RasterLevelsAdjustment extends RasterAdjustmentBase {
    type: "levels";
    params: {
        channel: RasterCurveChannel;
        inputBlack: number;
        inputWhite: number;
        gamma: number;
        outputBlack: number;
        outputWhite: number;
    };
}
export type RasterAdjustment = RasterBasicAdjustment | RasterCurvesAdjustment | RasterHslAdjustment | RasterLevelsAdjustment;
export interface RasterStrokePoint {
    x: number;
    y: number;
    pressure: number;
}
export interface RasterSelectionRegion {
    operation: "replace" | "add" | "subtract" | "intersect";
    kind: "rectangle" | "lasso";
    points: RasterStrokePoint[];
}
export interface RasterStrokeSelection {
    kind: "rectangle" | "lasso" | "composite";
    points: RasterStrokePoint[];
    feather: number;
    regions?: RasterSelectionRegion[];
}
export interface RasterStroke {
    id: string;
    mode: "paint" | "erase" | "mask" | "dodge" | "burn" | "clone" | "heal" | "blur" | "sharpen";
    coordinateSpace: "image" | "document";
    color: string;
    size: number;
    hardness: number;
    opacity: number;
    flow: number;
    points: RasterStrokePoint[];
    sourcePoint?: RasterStrokePoint;
    selection?: RasterStrokeSelection;
}
export interface RasterMaskReference {
    id: string;
    kind: "vector" | "tiles";
    revision: number;
    geometry?: RasterStrokeSelection;
}
export interface RasterGradient {
    id: string;
    start: RasterStrokePoint;
    end: RasterStrokePoint;
    startColor: string;
    endColor: string;
    opacity: number;
}
export interface RasterDocument {
    version: typeof RASTER_DOCUMENT_VERSION;
    revision: number;
    source: RasterSource;
    crop?: RasterCrop;
    transform: RasterTransform;
    adjustments: RasterAdjustment[];
    strokes: RasterStroke[];
    gradients: RasterGradient[];
    layerMask?: RasterMaskReference;
}
export declare function createRasterDocument(source: RasterSource, legacy?: Partial<ImageAdjustments>): RasterDocument;
export declare function normalizeRasterDocument(document: RasterDocument): RasterDocument;
export declare function createBasicAdjustment(id: string, params?: Partial<ImageAdjustments>): RasterBasicAdjustment;
export declare function createCurvesAdjustment(id: string, channel?: RasterCurveChannel): RasterCurvesAdjustment;
export declare function createHslAdjustment(id: string): RasterHslAdjustment;
export declare function createLevelsAdjustment(id: string, channel?: RasterCurveChannel): RasterLevelsAdjustment;
export declare function normalizeCurvePoints(points: readonly RasterCurvePoint[]): RasterCurvePoint[];
export declare function normalizeHslParams(params: RasterHslAdjustment["params"]): RasterHslAdjustment["params"];
export declare function normalizeLevelsParams(params: RasterLevelsAdjustment["params"]): RasterLevelsAdjustment["params"];
export declare function addRasterAdjustment(document: RasterDocument, adjustment: RasterAdjustment): RasterDocument;
export declare function replaceRasterAdjustment(document: RasterDocument, adjustment: RasterAdjustment): RasterDocument;
export declare function removeRasterAdjustment(document: RasterDocument, id: string): RasterDocument;
export declare function moveRasterAdjustment(document: RasterDocument, sourceId: string, targetId: string): RasterDocument;
export declare function appendRasterStroke(document: RasterDocument, stroke: RasterStroke): RasterDocument;
export declare function appendRasterGradient(document: RasterDocument, gradient: RasterGradient): RasterDocument;
export {};
//# sourceMappingURL=raster-document.d.ts.map