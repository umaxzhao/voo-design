import type { ImageAdjustments } from "./paint-layers.js";
export declare const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments;
export declare function normalizeImageAdjustments(value?: Partial<ImageAdjustments>): ImageAdjustments;
/** Builds the CanvasKit 4x5 color matrix used for live image-fill adjustments. */
export declare function createImageAdjustmentMatrix(input?: Partial<ImageAdjustments>): number[] | null;
//# sourceMappingURL=image-adjustments.d.ts.map