/**
 * The package's front door.
 *
 * Named rather than wildcard, so what the package promises is visible in one
 * file and a consumer is not reaching into paths that may move. Anything not
 * listed here is still importable by subpath while the API settles.
 */
// Bringing the runtime up and painting a scene.
export { loadCanvasKit, resetCanvasKitForTests, setCanvasKitAssetUrls, } from "./lib/skia/canvas-kit-loader.js";
export { SkiaRenderer, collectSceneImageUrls } from "./lib/skia/skia-renderer.js";
// Geometry the host needs to hit-test and lay out against what is drawn.
export { elementWorldBounds } from "./lib/skia/scene-geometry.js";
export * as rotateGeometry from "./lib/skia/rotate-geometry.js";
export { isContained, measureBetween, measurePadding } from "./lib/skia/measure-distance.js";
// Vector editing: paths, and the set operations over them.
export * as booleanOps from "./lib/boolean-ops.js";
export * as penPath from "./lib/pen-path.js";
export * as polygonOps from "./lib/polygon-ops.js";
export * as strokeStyle from "./lib/stroke-style.js";
// Laying a selection out: aligning to a shared edge, spreading evenly, and
// evening out the gaps between shapes.
export * as align from "./lib/align.js";
//# sourceMappingURL=index.js.map