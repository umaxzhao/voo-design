import type { RasterSelectionRegion, RasterStrokeSelection } from "./raster-document.js";
export type RasterSelectionOperation = RasterSelectionRegion["operation"];
export declare function combineRasterSelections(previous: RasterStrokeSelection | null, next: RasterStrokeSelection, operation: RasterSelectionOperation): RasterStrokeSelection;
export declare function getRasterSelectionRegions(selection: RasterStrokeSelection): RasterSelectionRegion[];
//# sourceMappingURL=raster-selection.d.ts.map