import type { CanvasKitApi, SkiaCanvas, SkiaEnumValue } from "./canvas-kit-types.js";
import type { SkiaFontManager } from "./font-manager.js";
import type { SkiaResourceManager } from "./resource-manager.js";
import type { SceneConnection, SceneElement } from "./scene-types.js";
import { type SkiaVideoPlaybackState } from "./skia-video-playback.js";
export declare class SkiaScenePainter {
    private readonly canvasKit;
    private readonly resources;
    private readonly fonts;
    private readonly fillPaint;
    private readonly strokePaint;
    private readonly effectsPaint;
    private readonly blendPaint;
    private readonly maskPaint;
    private readonly videoPainter;
    private videoNodePlaybacks;
    private linearBurnEffect;
    private linearBurnBlender;
    /**
     * Parsed `Path` objects keyed by their SVG string.
     *
     * Every redraw used to re-parse each vector's path and free it again, so a
     * page of 1722 icons paid 1722 SVG parses plus as many WASM allocations per
     * frame — roughly 370ms, which is what made panning and zooming crawl once a
     * lot of content was on screen. Paths are immutable in local coordinates
     * (position, rotation and scale all arrive through the canvas transform), so
     * one parse can serve every frame.
     */
    private readonly pathCache;
    constructor(canvasKit: CanvasKitApi, resources: SkiaResourceManager, fonts: SkiaFontManager);
    setVideoPlaybacks(playbacks: readonly SkiaVideoPlaybackState[]): void;
    private drawAdjustedImage;
    private drawImageForFit;
    drawElement(canvas: SkiaCanvas, element: SceneElement): void;
    clipElement(canvas: SkiaCanvas, element: Exclude<SceneElement, SceneConnection>, operation: SkiaEnumValue): void;
    /**
     * Draws `element` masked by the alpha of `mask`'s image — a per-pixel alpha
     * matte, not a hard geometric clip.
     *
     * `clipElement` clips to the mask element's *geometry* (a soft background
     * cutout would render as a hard rectangle). This instead draws the element
     * into a layer, then multiplies its alpha by the mask image's alpha using a
     * `DstIn` composite, so feathered edges survive. The mask image is stretched
     * to the element's own box (`fill`), which matches a background-removal matte
     * that shares the content bitmap's dimensions.
     *
     * The mask is optional in the sense that a mask whose image has not loaded is
     * skipped (the content still paints), never silently vanishing.
     */
    drawAlphaMaskedElement(canvas: SkiaCanvas, element: Exclude<SceneElement, SceneConnection>, mask: Exclude<SceneElement, SceneConnection>): void;
    private drawTransformedElement;
    private drawElementWithBlendMode;
    private configureLayerBlendPaint;
    private configureEffectBlendPaint;
    private getLinearBurnBlender;
    private drawElementSurface;
    dispose(): void;
    /**
     * Paints the element's own surface plus its inner shadows and stroke.
     *
     * Text strokes are approximated with offset glyph layers, so they go behind
     * the fill to read as an outline instead of covering the glyph interior.
     * Closed vector geometry uses real stroke paints and keeps the standard
     * fill-then-stroke order.
     */
    private drawBaseAndStroke;
    private drawElementWithLayerEffects;
    private drawBackgroundBlur;
    private drawOuterShadows;
    /**
     * The extrusion is the object silhouette repeated along one direction, so it
     * reuses drawEffectGeometry and the offsets from lib/depth-effect — the CSS
     * export walks the same list and the two walls cannot drift apart.
     */
    private drawDepth;
    private drawInnerShadows;
    private hasClosedEffectGeometry;
    private clipEffectGeometry;
    private drawInnerShadowGeometry;
    private drawEffectGeometry;
    private drawSpreadSurface;
    private drawShadowSourceSurface;
    private drawNoise;
    private applyElementTransform;
    private drawNode;
    private drawBox;
    private createEllipsePathData;
    private createEllipseGeometryPathData;
    private createBooleanPath;
    private combineBooleanSources;
    private createBooleanSourcePath;
    private booleanPathOperation;
    private roundedRectPathData;
    private drawBoxGeometry;
    private clipBoxGeometry;
    private drawBoxStroke;
    private drawPaints;
    private drawImageFill;
    private drawStrokeLayers;
    private drawIndependentBoxStroke;
    private drawStroke;
    private drawImageStroke;
    private drawStrokePaintedShape;
    private drawConfiguredStroke;
    private configurePaint;
    private createGradientShader;
    private drawConnection;
    private drawImage;
    private drawEmptyImagePlaceholder;
    /**
     * Divider line, grab handle and Before/After labels for the compare
     * slider. Flat styling (no shadows/glows — AGENTS.md canvas rule): the
     * DOM version's divider box-shadow becomes a dark underlay rect, and the
     * handle's drop shadow becomes a 1px border in the same zinc tone the
     * Skia control chips use.
     */
    private drawCompareChrome;
    /** Small uppercase pill in a top corner, mirroring the DOM slider's labels. */
    private drawCompareLabel;
    private drawText;
    private currentSnapshot;
    private currentViewport;
    setCurrentContext(snapshot: import("./scene-types.js").SceneSnapshot, viewport: import("./scene-types.js").SceneViewport): void;
    private drawFrameTitle;
    private drawCardChrome;
    private drawCardImage;
    private drawGallery;
    private drawVideoPlaceholder;
    private drawArrowheads;
    private drawArrowheadsForStroke;
    private drawArrowhead;
    private createPolygonPath;
    private createLinePath;
    /**
     * A parsed path for `pathData`, reused across frames. Returns null on an
     * unparseable string, exactly like `Path.MakeFromSVGString`.
     *
     * The cache is bounded so a long editing session cannot grow it without
     * limit; the oldest entry is evicted and freed on overflow. Callers must not
     * mutate what they get back — `withCachedPath` is the safe way to draw one.
     */
    private cachedPath;
    /** Draws with a cached path, leaving it in the cache afterwards. */
    private withCachedPath;
    /**
     * Flattened `[x, y, …]` for the dot grid, reusing one buffer across frames.
     * Returns null when the grid would be unreasonably dense, so the caller
     * falls back rather than allocating without bound.
     */
    private gridPoints;
    /**
     * One grid cell baked to an image plus the repeating shader that tiles it.
     * Keyed by the tile's pixel size and dot radius, so it survives panning and
     * is rebuilt only when the zoom or device pixel ratio changes.
     */
    private gridTile;
    private releaseGridTile;
    /**
     * A repeating shader that paints the whole dot grid in one `drawRect`.
     *
     * Handing Skia one point per dot cost 7.3ms per frame on a 2005x1185 canvas
     * at half zoom — 15k antialiased dots, more than the entire artwork — and
     * it grew with the window. Baking a single cell and letting the GPU repeat
     * it makes the cost independent of how many dots are on screen.
     *
     * The local matrix maps the tile to world space anchored at the world
     * origin, so the lattice lines up with `Math.floor(world / step) * step`
     * regardless of where the viewport sits. Returns null when the CanvasKit
     * build lacks the pieces, leaving the caller's batched fallback in place.
     */
    private gridDotShader;
    /**
     * The grid lattice as a flat x/y buffer for a single batched `drawPoints`.
     *
     * `exclude` drops the dots inside a circle so the caller can paint those
     * few individually without giving up the batch for the rest of the screen.
     * Returns null when the lattice is too large to be worth batching.
     */
    private gridPointBuffer;
    private withPath;
    /**
     * The dot grid without a tiled shader, for CanvasKit builds that cannot
     * provide one. Batches into a single `drawPoints` where available and only
     * falls back to a call per dot as a last resort.
     */
    private drawGridDotsWithoutTile;
    drawCanvasBackground(canvas: SkiaCanvas, viewport: import("./scene-types.js").SceneViewport, mode: "dots" | "lines" | "none", pointerPos: import("./scene-types.js").ScenePoint | null): void;
}
//# sourceMappingURL=skia-scene-painter.d.ts.map