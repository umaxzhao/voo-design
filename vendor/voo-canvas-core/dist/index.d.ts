/**
 * The package's front door.
 *
 * Named rather than wildcard, so what the package promises is visible in one
 * file and a consumer is not reaching into paths that may move. Anything not
 * listed here is still importable by subpath while the API settles.
 */
export { loadCanvasKit, resetCanvasKitForTests, setCanvasKitAssetUrls, } from "./lib/skia/canvas-kit-loader.js";
export type { CanvasKitAssetUrls } from "./lib/skia/canvas-kit-loader.js";
export { SkiaRenderer, collectSceneImageUrls } from "./lib/skia/skia-renderer.js";
export type { SceneBounds, SceneDepth, SceneElement, SceneFill, SceneFrame, SceneGradient, SceneNode, SceneNodeShape, ScenePoint, SceneSnapshot, SceneStroke, SceneViewport, } from "./lib/skia/scene-types.js";
export type { RasterDocument } from "./lib/raster/raster-document.js";
export { elementWorldBounds } from "./lib/skia/scene-geometry.js";
export * as rotateGeometry from "./lib/skia/rotate-geometry.js";
export { isContained, measureBetween, measurePadding } from "./lib/skia/measure-distance.js";
export type { MeasureRect, MeasureResult } from "./lib/skia/measure-distance.js";
export * as booleanOps from "./lib/boolean-ops.js";
export * as penPath from "./lib/pen-path.js";
export * as polygonOps from "./lib/polygon-ops.js";
export * as strokeStyle from "./lib/stroke-style.js";
export * as align from "./lib/align.js";
export type { AlignType, AlignableItem, AlignResult, DistributeAxis, } from "./lib/align.js";
//# sourceMappingURL=index.d.ts.map