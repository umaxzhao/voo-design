import { calculateImageLayout } from "./image-layout.js";
import { GALLERY_MAX_THUMBS, layoutGalleryThumbs } from "./gallery-layout.js";
import { COMPARE_HANDLE_RADIUS, compareDividerX } from "./compare-slider.js";
import { resolveDepth } from "../depth-effect.js";
import { withAlpha } from "../color-math.js";
import { roundedPolygonPath } from "../polygon-ops.js";
import { AI_NODE_LAYOUT } from "../ai-node-layout.js";
import { drawNodeControls, estimateControlTextWidth, isAiControlCard, } from "./skia-node-controls.js";
import { createImageAdjustmentMatrix } from "../image-adjustments.js";
import { getNativeTextEditingDisplayText, getNativeTextEditingRenderState, setNativeTextEditingLayout, } from "../skia-native-text-editing.js";
import { SkiaVideoPainter } from "./skia-video-painter.js";
import { isSkiaVideoNode, } from "./skia-video-playback.js";
import { layoutImagePlaceholder } from "./image-placeholder.js";
import { createRasterAdjustmentMatrix } from "../raster/raster-color-matrix.js";
import { clipRasterSelection, drawRasterGradients, drawRasterStrokes, } from "./raster-stroke-painter.js";
import { drawRasterRetouchStrokes } from "./raster-retouch-painter.js";
const CANVAS_KIT_BLEND_MODE_KEYS = {
    darken: "Darken",
    multiply: "Multiply",
    "color-burn": "ColorBurn",
    lighten: "Lighten",
    screen: "Screen",
    "plus-lighter": "Plus",
    "color-dodge": "ColorDodge",
    overlay: "Overlay",
    "soft-light": "SoftLight",
    "hard-light": "HardLight",
    difference: "Difference",
    exclusion: "Exclusion",
    hue: "Hue",
    saturation: "Saturation",
    color: "Color",
    luminosity: "Luminosity",
};
/**
 * Layout width used for auto-width (hug) text so the shaper never wraps it.
 * Deliberately finite and modest — `Number.MAX_SAFE_INTEGER` is far outside
 * the float range Skia's line breaker works in and degrades its arithmetic.
 * No single unwrapped label approaches a million pixels.
 */
const AUTO_WIDTH_LAYOUT_BOUND = 1000000;
const LINEAR_BURN_SKSL = `
half4 main(half4 src, half4 dst) {
  half srcAlpha = src.a;
  half dstAlpha = dst.a;
  half3 srcColor = srcAlpha > 0 ? src.rgb / srcAlpha : half3(0);
  half3 dstColor = dstAlpha > 0 ? dst.rgb / dstAlpha : half3(0);
  half3 blended = max(half3(0), srcColor + dstColor - half3(1));
  half outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
  half3 outColor =
      srcAlpha * (1 - dstAlpha) * srcColor +
      srcAlpha * dstAlpha * blended +
      (1 - srcAlpha) * dstAlpha * dstColor;
  return half4(outColor, outAlpha);
}
`;
function colorWithOpacity(color, opacity) {
    const alpha = Math.max(0, Math.min(1, opacity));
    if (alpha >= 1)
        return color;
    const shortHex = /^#([\da-f])([\da-f])([\da-f])$/i.exec(color);
    const normalized = shortHex
        ? `#${shortHex[1]}${shortHex[1]}${shortHex[2]}${shortHex[2]}${shortHex[3]}${shortHex[3]}`
        : color;
    const hex = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(normalized);
    if (!hex)
        return color;
    const sourceAlpha = hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1;
    const outputAlpha = Math.round(sourceAlpha * alpha * 255)
        .toString(16)
        .padStart(2, "0");
    return `#${hex[1]}${outputAlpha}`;
}
/**
 * Enough for a large design page's distinct vector shapes several times over,
 * while keeping the WASM heap bounded across a long editing session.
 */
/** Shared empty list so the common no-noise element allocates nothing. */
const EMPTY_NOISE_KEYS = [];
/** True when any stroke on the element would put ink on the canvas. */
function strokesPaintAnything(element) {
    const paints = (stroke) => {
        if (stroke.width > 0)
            return true;
        const sides = stroke.sideWidths;
        return Boolean(sides &&
            (sides.top > 0 || sides.right > 0 || sides.bottom > 0 || sides.left > 0));
    };
    if (element.strokes?.length) {
        for (const stroke of element.strokes)
            if (paints(stroke))
                return true;
        return false;
    }
    return element.stroke ? paints(element.stroke) : false;
}
const PATH_CACHE_LIMIT = 8192;
/** Beyond this the grid is denser than the screen can show; skip the batch. */
const GRID_POINT_LIMIT = 400000;
export class SkiaScenePainter {
    constructor(canvasKit, resources, fonts) {
        this.canvasKit = canvasKit;
        this.resources = resources;
        this.fonts = fonts;
        this.videoNodePlaybacks = new Map();
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
        this.pathCache = new Map();
        this.currentSnapshot = null;
        this.currentViewport = null;
        /**
         * Flattened `[x, y, …]` for the dot grid, reusing one buffer across frames.
         * Returns null when the grid would be unreasonably dense, so the caller
         * falls back rather than allocating without bound.
         */
        this.gridPoints = null;
        /**
         * One grid cell baked to an image plus the repeating shader that tiles it.
         * Keyed by the tile's pixel size and dot radius, so it survives panning and
         * is rebuilt only when the zoom or device pixel ratio changes.
         */
        this.gridTile = null;
        this.fillPaint = new canvasKit.Paint();
        this.strokePaint = new canvasKit.Paint();
        this.effectsPaint = new canvasKit.Paint();
        this.blendPaint = new canvasKit.Paint();
        this.maskPaint = new canvasKit.Paint();
        this.videoPainter = new SkiaVideoPainter(canvasKit, resources);
    }
    setVideoPlaybacks(playbacks) {
        this.videoNodePlaybacks = new Map(playbacks.flatMap((playback) => playback.kind === "node" && playback.nodeId
            ? [[playback.nodeId, playback]]
            : []));
    }
    drawAdjustedImage(paint, adjustments, draw, rasterDocument) {
        const matrix = rasterDocument
            ? createRasterAdjustmentMatrix(rasterDocument, adjustments)
            : createImageAdjustmentMatrix(adjustments);
        const colorFilter = matrix && paint.setColorFilter && this.canvasKit.ColorFilter
            ? this.canvasKit.ColorFilter.MakeMatrix(matrix)
            : null;
        if (colorFilter)
            paint.setColorFilter?.(colorFilter);
        try {
            draw();
        }
        finally {
            if (colorFilter)
                paint.setColorFilter?.(null);
            colorFilter?.delete();
        }
    }
    drawImageForFit(canvas, image, paint, fit, layout, targetWidth, targetHeight) {
        const source = [
            layout.source.x,
            layout.source.y,
            layout.source.x + layout.source.width,
            layout.source.y + layout.source.height,
        ];
        if (fit !== "tile") {
            canvas.drawImageRect(image, source, [
                layout.destination.x,
                layout.destination.y,
                layout.destination.x + layout.destination.width,
                layout.destination.y + layout.destination.height,
            ], paint, false);
            return;
        }
        const tileWidth = Math.max(1, image.width());
        const tileHeight = Math.max(1, image.height());
        for (let y = 0; y < targetHeight; y += tileHeight) {
            for (let x = 0; x < targetWidth; x += tileWidth) {
                canvas.drawImageRect(image, source, [x, y, x + tileWidth, y + tileHeight], paint, false);
            }
        }
    }
    drawElement(canvas, element) {
        if (element.kind === "connection") {
            this.drawConnection(canvas, element);
            return;
        }
        // The scene adapter zeroes opacity on AI creator cards from the era when
        // they were rendered by an HTML overlay. Skia paints them now, so restore
        // a visible surface for exactly those cards.
        const target = isAiControlCard(element) && element.opacity < 1
            ? { ...element, opacity: 1 }
            : element;
        canvas.save();
        this.applyElementTransform(canvas, target);
        this.drawElementWithBlendMode(canvas, target);
        canvas.restore();
    }
    clipElement(canvas, element, operation) {
        this.applyElementTransform(canvas, element);
        this.clipEffectGeometry(canvas, element, operation);
        // CanvasKit records the clip in device space. Apply the exact inverse
        // element transform instead of save/restore (restore would also discard
        // the clip), leaving descendants in the surrounding world matrix.
        const { x, y, width, height } = element.bounds;
        canvas.translate(width / 2, height / 2);
        canvas.scale(element.flipX ? -1 : 1, element.flipY ? -1 : 1);
        if (element.rotation)
            canvas.rotate(-element.rotation, 0, 0);
        canvas.translate(-(x + width / 2), -(y + height / 2));
    }
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
    drawAlphaMaskedElement(canvas, element, mask) {
        canvas.save();
        this.applyElementTransform(canvas, element);
        canvas.saveLayer();
        try {
            this.drawElementWithBlendMode(canvas, element);
            const maskImage = this.resources.getImage(mask.imageUrl ?? "");
            if (maskImage) {
                const layout = calculateImageLayout(maskImage.width(), maskImage.height(), element.bounds.width, element.bounds.height, "fill", "center");
                this.maskPaint.setBlendMode(this.canvasKit.BlendMode.DstIn);
                this.drawImageForFit(canvas, maskImage, this.maskPaint, "fill", layout, element.bounds.width, element.bounds.height);
            }
        }
        finally {
            this.maskPaint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
            canvas.restore();
        }
        canvas.restore();
    }
    drawTransformedElement(canvas, element) {
        this.drawBackgroundBlur(canvas, element);
        this.drawOuterShadows(canvas, element);
        this.drawDepth(canvas, element);
        this.drawElementWithLayerEffects(canvas, element);
        if (element.kind === "frame")
            this.drawFrameTitle(canvas, element);
    }
    drawElementWithBlendMode(canvas, element) {
        const blendMode = element.blendMode ?? "pass-through";
        if (blendMode === "pass-through") {
            this.drawTransformedElement(canvas, element);
            return;
        }
        this.configureLayerBlendPaint(blendMode);
        try {
            canvas.saveLayer(this.blendPaint);
            this.drawTransformedElement(canvas, element);
            canvas.restore();
        }
        finally {
            this.blendPaint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
        }
    }
    configureLayerBlendPaint(mode) {
        if (mode === "plus-darker") {
            const blender = this.getLinearBurnBlender();
            if (blender && this.blendPaint.setBlender) {
                this.blendPaint.setBlender(blender);
                return;
            }
            // CanvasKit builds without runtime effects still get a deterministic
            // darkening mode instead of silently falling back to SrcOver.
            this.blendPaint.setBlendMode(this.canvasKit.BlendMode.Modulate);
            return;
        }
        const key = mode === "normal" ? "SrcOver" : CANVAS_KIT_BLEND_MODE_KEYS[mode];
        this.blendPaint.setBlendMode(this.canvasKit.BlendMode[key]);
    }
    configureEffectBlendPaint(mode) {
        if (!mode || mode === "normal")
            return;
        if (mode === "plus-darker") {
            // A filtered shadow paint cannot safely share the layer-level runtime
            // blender because the filter and blender lifetimes differ. Modulate is
            // CanvasKit's deterministic linear-burn fallback used elsewhere too.
            this.effectsPaint.setBlendMode(this.canvasKit.BlendMode.Modulate);
            return;
        }
        this.effectsPaint.setBlendMode(this.canvasKit.BlendMode[CANVAS_KIT_BLEND_MODE_KEYS[mode]]);
    }
    getLinearBurnBlender() {
        if (this.linearBurnBlender !== undefined)
            return this.linearBurnBlender;
        const runtimeEffectFactory = this.canvasKit.RuntimeEffect;
        if (!runtimeEffectFactory) {
            this.linearBurnBlender = null;
            return null;
        }
        this.linearBurnEffect =
            runtimeEffectFactory.MakeForBlender(LINEAR_BURN_SKSL);
        this.linearBurnBlender =
            this.linearBurnEffect?.makeBlender(new Float32Array()) ?? null;
        return this.linearBurnBlender;
    }
    drawElementSurface(canvas, element, mode = "all") {
        if (element.kind === "overlay" && element.overlayType === "port") {
            this.drawPaints((paint) => canvas.drawOval([0, 0, element.bounds.width, element.bounds.height], paint), element, undefined, canvas);
            if (element.isConnected) {
                const cx = element.bounds.width / 2;
                const cy = element.bounds.height / 2;
                const dotRadius = Math.max(1.5, element.bounds.width * 0.25);
                this.fillPaint.setColor(this.canvasKit.parseColorString("#000000"));
                this.fillPaint.setStyle(this.canvasKit.PaintStyle.Fill);
                canvas.drawOval([cx - dotRadius, cy - dotRadius, cx + dotRadius, cy + dotRadius], this.fillPaint);
            }
        }
        else if (element.kind === "overlay" &&
            element.overlayType === "linear-selection") {
            this.withPath(this.createLinePath(element.bounds.width, element.bounds.height), (path) => this.drawPaints((paint) => canvas.drawPath(path, paint), element, undefined, canvas, mode));
        }
        else if (element.kind === "overlay" &&
            element.overlayType === "path-selection") {
            if (element.pathData) {
                this.withCachedPath(element.pathData, (parsedPath) => this.drawPaints((paint) => canvas.drawPath(parsedPath, paint), element, undefined, canvas, mode));
            }
        }
        else if (element.kind === "frame" || element.kind === "overlay") {
            this.drawBox(canvas, element.bounds.width, element.bounds.height, element, mode);
            if (element.kind === "frame" && mode !== "stroke") {
                if (element.imageUrl) {
                    this.drawImage(canvas, element);
                    if (mode === "all")
                        this.drawBoxStroke(canvas, element.bounds.width, element.bounds.height, element);
                }
            }
        }
        else {
            this.drawNode(canvas, element, mode);
        }
    }
    dispose() {
        this.fillPaint.delete();
        this.strokePaint.delete();
        this.effectsPaint.delete();
        this.blendPaint.delete();
        this.videoPainter.dispose();
        this.linearBurnBlender?.delete();
        this.linearBurnEffect?.delete();
        this.releaseGridTile();
        for (const path of this.pathCache.values())
            path.delete();
        this.pathCache.clear();
    }
    /**
     * Paints the element's own surface plus its inner shadows and stroke.
     *
     * Text strokes are approximated with offset glyph layers, so they go behind
     * the fill to read as an outline instead of covering the glyph interior.
     * Closed vector geometry uses real stroke paints and keeps the standard
     * fill-then-stroke order.
     */
    drawBaseAndStroke(canvas, element, hasStroke, textStrokeBehindFill) {
        if (textStrokeBehindFill && hasStroke) {
            this.drawElementSurface(canvas, element, "stroke");
        }
        this.drawElementSurface(canvas, element, "base");
        this.drawInnerShadows(canvas, element);
        if (!textStrokeBehindFill && hasStroke) {
            this.drawElementSurface(canvas, element, "stroke");
        }
    }
    drawElementWithLayerEffects(canvas, element) {
        // Walked without building throwaway arrays: this runs for every element on
        // every frame, and a page of thousands of layers turned the temporary
        // arrays alone into meaningful garbage.
        const hasStroke = strokesPaintAnything(element);
        const blur = element.layerBlur ?? 0;
        const layerCount = element.noise
            ? Math.max(1, Math.min(2, element.noiseLayers ?? 1))
            : 0;
        const noiseKeys = layerCount === 0
            ? EMPTY_NOISE_KEYS
            : Array.from({ length: layerCount }, (_, index) => element.noiseEffectKeys?.[index] ?? `noise-${index}`);
        const textStrokeBehindFill = element.kind === "node" && element.shape === "text";
        // Fast path for the ordinary element: no blur and no noise means the
        // effect-ordering bookkeeping below cannot change anything, and building
        // it anyway costs a Map plus three arrays for every layer on every frame.
        if (blur <= 0 && layerCount === 0) {
            this.drawBaseAndStroke(canvas, element, hasStroke, textStrokeBehindFill);
            return;
        }
        const drawBaseAndStroke = () => {
            this.drawBaseAndStroke(canvas, element, hasStroke, textStrokeBehindFill);
        };
        const orderPositions = new Map(element.effectOrder?.map((key, index) => [key, index]) ?? []);
        const blurPosition = orderPositions.get("layer-blur");
        const noiseAboveBlur = [];
        const noiseBelowBlur = [];
        noiseKeys.forEach((key, index) => {
            const noisePosition = orderPositions.get(key);
            if (blur > 0 &&
                blurPosition !== undefined &&
                noisePosition !== undefined &&
                noisePosition < blurPosition) {
                noiseAboveBlur.push(index);
            }
            else {
                noiseBelowBlur.push(index);
            }
        });
        if (blur <= 0) {
            drawBaseAndStroke();
            noiseBelowBlur.forEach((index) => this.drawNoise(canvas, element, index));
            return;
        }
        const filter = this.canvasKit.ImageFilter.MakeBlur(blur / 2, blur / 2, this.canvasKit.TileMode.Decal, null);
        this.effectsPaint.setImageFilter(filter);
        try {
            canvas.saveLayer(this.effectsPaint);
            drawBaseAndStroke();
            noiseBelowBlur.forEach((index) => this.drawNoise(canvas, element, index));
            canvas.restore();
        }
        finally {
            this.effectsPaint.setImageFilter(null);
            filter.delete();
        }
        noiseAboveBlur.forEach((index) => this.drawNoise(canvas, element, index));
    }
    drawBackgroundBlur(canvas, element) {
        const blur = element.backgroundBlur ?? 0;
        if (blur <= 0 || !this.hasClosedEffectGeometry(element))
            return;
        const filter = this.canvasKit.ImageFilter.MakeBlur(blur / 2, blur / 2, this.canvasKit.TileMode.Decal, null);
        const bounds = [0, 0, element.bounds.width, element.bounds.height];
        canvas.save();
        this.clipEffectGeometry(canvas, element, this.canvasKit.ClipOp.Intersect);
        try {
            canvas.saveLayer(undefined, bounds, filter);
            canvas.restore();
        }
        finally {
            canvas.restore();
            filter.delete();
        }
    }
    drawOuterShadows(canvas, element) {
        // Inspector effect rows are ordered front-to-back: the first row is the
        // visually topmost effect. Canvas compositing is back-to-front, so paint
        // the filtered stack in reverse order to keep row order and canvas order
        // consistent when shadows overlap.
        [...(element.shadows?.filter((shadow) => !shadow.inset) ?? [])]
            .reverse()
            .forEach((shadow) => {
            const filter = this.canvasKit.ImageFilter.MakeDropShadowOnly(shadow.offsetX, shadow.offsetY, shadow.blur / 2, shadow.blur / 2, this.canvasKit.parseColorString(shadow.color), null);
            this.effectsPaint.setImageFilter(filter);
            this.configureEffectBlendPaint(shadow.blendMode);
            try {
                canvas.saveLayer(this.effectsPaint);
                this.drawSpreadSurface(canvas, element, shadow.spread, shadow.showBehindTransparent);
                canvas.restore();
            }
            finally {
                this.effectsPaint.setImageFilter(null);
                if (shadow.blendMode && shadow.blendMode !== "normal") {
                    this.effectsPaint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
                }
                filter.delete();
            }
        });
    }
    /**
     * The extrusion is the object silhouette repeated along one direction, so it
     * reuses drawEffectGeometry and the offsets from lib/depth-effect — the CSS
     * export walks the same list and the two walls cannot drift apart.
     */
    drawDepth(canvas, element) {
        const resolved = resolveDepth(element.depth);
        if (!resolved || !this.hasClosedEffectGeometry(element))
            return;
        const paint = this.effectsPaint;
        const color = withAlpha(resolved.color, Math.round(Math.max(0, Math.min(1, element.opacity)) * 100));
        paint.setAntiAlias(true);
        paint.setStyle(this.canvasKit.PaintStyle.Fill);
        paint.setColor(this.canvasKit.parseColorString(color));
        resolved.layers.forEach((layer) => {
            canvas.save();
            canvas.translate(layer.x, layer.y);
            try {
                this.drawEffectGeometry(canvas, element, paint);
            }
            finally {
                canvas.restore();
            }
        });
    }
    drawInnerShadows(canvas, element) {
        if (!this.hasClosedEffectGeometry(element))
            return;
        [...(element.shadows?.filter((shadow) => shadow.inset) ?? [])]
            .reverse()
            .forEach((shadow) => {
            const filter = this.canvasKit.MaskFilter.MakeBlur(this.canvasKit.BlurStyle.Inner, Math.max(0.01, shadow.blur / 2), false);
            this.configurePaint(this.effectsPaint, shadow.color, element.opacity, false, 0);
            this.effectsPaint.setMaskFilter(filter);
            this.configureEffectBlendPaint(shadow.blendMode);
            canvas.save();
            this.clipEffectGeometry(canvas, element, this.canvasKit.ClipOp.Intersect);
            canvas.translate(shadow.offsetX, shadow.offsetY);
            try {
                this.drawInnerShadowGeometry(canvas, element, shadow.spread, this.effectsPaint);
            }
            finally {
                canvas.restore();
                this.effectsPaint.setMaskFilter(null);
                if (shadow.blendMode && shadow.blendMode !== "normal") {
                    this.effectsPaint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
                }
                filter.delete();
            }
        });
    }
    hasClosedEffectGeometry(element) {
        if (element.kind !== "node")
            return true;
        if (element.shape === "line" || element.shape === "arrow")
            return false;
        if (element.shape === "path")
            return element.pathClosed !== false;
        return true;
    }
    clipEffectGeometry(canvas, element, operation) {
        const { width, height } = element.bounds;
        if (element.kind !== "node") {
            this.clipBoxGeometry(canvas, width, height, element, operation);
            return;
        }
        if (element.shape === "ellipse") {
            canvas.clipRRect(this.canvasKit.RRectXY([0, 0, width, height], width / 2, height / 2), operation, true);
            return;
        }
        if (element.shape === "boolean") {
            const path = this.createBooleanPath(element);
            if (path) {
                this.withPath(path, (booleanPath) => canvas.clipPath(booleanPath, operation, true));
                return;
            }
        }
        if (element.shape === "triangle" || element.shape === "polygon") {
            const sides = element.shape === "triangle"
                ? 3
                : Math.max(3, element.polygonSides ?? 6);
            this.withPath(this.createPolygonPath(width, height, sides, element.cornerRadius ?? 0), (path) => canvas.clipPath(path, operation, true));
            return;
        }
        if (element.shape === "path" && element.pathData) {
            const clipPath = this.cachedPath(element.pathData);
            if (clipPath) {
                canvas.clipPath(clipPath, operation, true);
                return;
            }
        }
        this.clipBoxGeometry(canvas, width, height, element, operation);
    }
    drawInnerShadowGeometry(canvas, element, spread, paint) {
        const { width, height } = element.bounds;
        if (spread === 0 || width <= 0 || height <= 0) {
            this.drawEffectGeometry(canvas, element, paint);
            return;
        }
        // Positive inset spread grows the shadow toward the center, which is
        // equivalent to shrinking the source geometry before applying the Inner
        // mask blur. Negative spread expands that geometry and softens the inset.
        const maxInset = Math.max(0, Math.min(width, height) / 2 - 0.005);
        const inset = Math.min(spread, maxInset);
        const scaledWidth = Math.max(0.01, width - inset * 2);
        const scaledHeight = Math.max(0.01, height - inset * 2);
        canvas.save();
        try {
            canvas.translate(inset, inset);
            canvas.scale(scaledWidth / width, scaledHeight / height);
            this.drawEffectGeometry(canvas, element, paint);
        }
        finally {
            canvas.restore();
        }
    }
    drawEffectGeometry(canvas, element, paint) {
        const { width, height } = element.bounds;
        if (element.kind !== "node") {
            this.drawBoxGeometry(canvas, width, height, element, paint);
            return;
        }
        if (element.shape === "ellipse") {
            canvas.drawOval([0, 0, width, height], paint);
            return;
        }
        if (element.shape === "boolean") {
            const path = this.createBooleanPath(element);
            if (path) {
                this.withPath(path, (booleanPath) => canvas.drawPath(booleanPath, paint));
            }
            return;
        }
        if (element.shape === "triangle" || element.shape === "polygon") {
            const sides = element.shape === "triangle"
                ? 3
                : Math.max(3, element.polygonSides ?? 6);
            this.withPath(this.createPolygonPath(width, height, sides, element.cornerRadius ?? 0), (path) => canvas.drawPath(path, paint));
            return;
        }
        if (element.shape === "path") {
            if (element.pathData) {
                this.withCachedPath(element.pathData, (parsedPath) => canvas.drawPath(parsedPath, paint));
            }
            return;
        }
        // Open linear geometry has no enclosed surface for an inner shadow.
        // Treat arrows exactly like lines so effects never fall back to a
        // rectangular bounds shadow around the path.
        if (element.shape === "line" || element.shape === "arrow")
            return;
        this.drawBoxGeometry(canvas, width, height, element, paint);
    }
    drawSpreadSurface(canvas, element, spread, showBehindTransparent) {
        const { width, height } = element.bounds;
        if (spread === 0 || width <= 0 || height <= 0) {
            this.drawShadowSourceSurface(canvas, element, showBehindTransparent);
            return;
        }
        const scaleX = Math.max(0.01, (width + spread * 2) / width);
        const scaleY = Math.max(0.01, (height + spread * 2) / height);
        canvas.save();
        canvas.translate(-spread, -spread);
        canvas.scale(scaleX, scaleY);
        this.drawShadowSourceSurface(canvas, element, showBehindTransparent);
        canvas.restore();
    }
    drawShadowSourceSurface(canvas, element, showBehindTransparent) {
        if (!showBehindTransparent &&
            (element.kind === "frame" || element.kind === "node") &&
            element.imageUrl) {
            this.drawImage(canvas, element);
            return;
        }
        this.drawElementSurface(canvas, { ...element, noise: false });
    }
    drawNoise(canvas, element, layerIndex) {
        const { width, height } = element.bounds;
        if (width <= 0 || height <= 0)
            return;
        canvas.save();
        canvas.clipRect([0, 0, width, height], this.canvasKit.ClipOp.Intersect, true);
        let seed = Array.from(element.id).reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, (2166136261 + layerIndex * 2654435761) >>> 0);
        const next = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        const mode = element.noiseModes?.[layerIndex] ?? "single";
        const size = Math.max(0, Math.min(100, element.noiseSizes?.[layerIndex] ?? 0.5));
        const density = Math.max(0, Math.min(1, element.noiseDensities?.[layerIndex] ?? 1));
        if (density <= 0) {
            canvas.restore();
            return;
        }
        const count = Math.min(480, Math.max(1, Math.round((width * height) / 96)));
        const dotRadius = Math.max(0.25, Math.min(3, 0.45 + size * 0.025));
        const primaryColor = element.noiseColors?.[layerIndex] ?? "rgba(0, 0, 0, 0.25)";
        const secondaryColor = element.noiseSecondaryColors?.[layerIndex] ?? "rgba(255, 255, 255, 0.25)";
        const noiseOpacity = mode === "multicolor"
            ? Math.max(0, Math.min(1, (element.noiseOpacities?.[layerIndex] ?? 0.25) * density))
            : Math.min(1, density * (mode === "dual" ? 0.7 : 1));
        const blendMode = element.noiseBlendModes?.[layerIndex] ?? "normal";
        const multicolorPalette = [
            "#E55934",
            "#3A86FF",
            "#06A77D",
            "#F0A202",
            "#9B5DE5",
            "#F15BB5",
            "#00BBF9",
        ];
        if (blendMode !== "normal") {
            if (blendMode === "plus-darker") {
                const blender = this.getLinearBurnBlender();
                if (blender && this.fillPaint.setBlender) {
                    this.fillPaint.setBlender(blender);
                }
                else {
                    this.fillPaint.setBlendMode(this.canvasKit.BlendMode.Modulate);
                }
            }
            else {
                this.fillPaint.setBlendMode(this.canvasKit.BlendMode[CANVAS_KIT_BLEND_MODE_KEYS[blendMode]]);
            }
        }
        try {
            for (let index = 0; index < count; index += 1) {
                const color = mode === "single"
                    ? primaryColor
                    : mode === "multicolor"
                        ? multicolorPalette[Math.floor(next() * multicolorPalette.length)]
                        : next() > 0.5
                            ? primaryColor
                            : secondaryColor;
                this.configurePaint(this.fillPaint, color, noiseOpacity, false, 0);
                canvas.drawCircle(next() * width, next() * height, dotRadius, this.fillPaint);
            }
        }
        finally {
            if (blendMode !== "normal") {
                this.fillPaint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
            }
        }
        canvas.restore();
    }
    applyElementTransform(canvas, element) {
        const { x, y, width, height } = element.bounds;
        canvas.translate(x + width / 2, y + height / 2);
        if (element.rotation)
            canvas.rotate(element.rotation, 0, 0);
        canvas.scale(element.flipX ? -1 : 1, element.flipY ? -1 : 1);
        canvas.translate(-width / 2, -height / 2);
    }
    drawNode(canvas, node, mode) {
        const { width, height } = node.bounds;
        if (node.shape === "text") {
            this.drawText(canvas, node, mode);
            return;
        }
        if (node.shape === "ellipse") {
            const ellipsePathData = this.createEllipsePathData(node);
            const ellipsePath = ellipsePathData
                ? this.canvasKit.Path.MakeFromSVGString(ellipsePathData)
                : null;
            if (ellipsePath) {
                this.withPath(ellipsePath, (path) => {
                    path.setFillType?.(node.fillRule === "evenodd"
                        ? this.canvasKit.FillType.EvenOdd
                        : this.canvasKit.FillType.Winding);
                    this.drawPaints((paint) => canvas.drawPath(path, paint), node, (operation, drawStroke) => {
                        canvas.save();
                        canvas.clipPath(path, operation, true);
                        drawStroke();
                        canvas.restore();
                    }, canvas, mode);
                });
            }
            else {
                this.drawPaints((paint) => canvas.drawOval([0, 0, width, height], paint), node, (operation, drawStroke) => {
                    canvas.save();
                    canvas.clipRRect(this.canvasKit.RRectXY([0, 0, width, height], width / 2, height / 2), operation, true);
                    drawStroke();
                    canvas.restore();
                }, canvas, mode);
            }
        }
        else if (node.shape === "boolean") {
            const path = this.createBooleanPath(node);
            if (path) {
                this.withPath(path, (booleanPath) => this.drawPaints((paint) => canvas.drawPath(booleanPath, paint), node, (operation, drawStroke) => {
                    canvas.save();
                    canvas.clipPath(booleanPath, operation, true);
                    drawStroke();
                    canvas.restore();
                }, canvas, mode));
            }
        }
        else if (node.shape === "triangle" || node.shape === "polygon") {
            const sides = node.shape === "triangle" ? 3 : Math.max(3, node.polygonSides ?? 6);
            this.withPath(this.createPolygonPath(width, height, sides, node.cornerRadius ?? 0), (path) => this.drawPaints((paint) => canvas.drawPath(path, paint), node, (operation, drawStroke) => {
                canvas.save();
                canvas.clipPath(path, operation, true);
                drawStroke();
                canvas.restore();
            }, canvas, mode));
        }
        else if (node.shape === "line" || node.shape === "arrow") {
            if (mode !== "base") {
                this.withPath(this.createLinePath(width, height, node.pathData), (path) => this.drawStrokeLayers((paint) => canvas.drawPath(path, paint), node, canvas));
                // Arrow merely supplies a triangle end marker by default; a Line can
                // gain the same endpoint geometry through the inspector.
                this.drawArrowheads(canvas, node);
            }
        }
        else if (node.shape === "path") {
            if (node.pathData) {
                this.withCachedPath(node.pathData, (parsedPath) => {
                    if (node.pathClosed) {
                        this.drawPaints((paint) => canvas.drawPath(parsedPath, paint), node, (operation, drawStroke) => {
                            canvas.save();
                            canvas.clipPath(parsedPath, operation, true);
                            drawStroke();
                            canvas.restore();
                        }, canvas, mode);
                    }
                    else if (mode !== "base") {
                        this.drawStrokeLayers((paint) => canvas.drawPath(parsedPath, paint), node, canvas);
                    }
                }, node.fillRule === "evenodd" ? "evenodd" : "nonzero");
            }
        }
        else {
            this.drawBox(canvas, width, height, node, mode);
        }
        if (mode !== "stroke" && node.nodeType === "image" && !node.imageUrl) {
            this.drawEmptyImagePlaceholder(canvas, node);
            if (mode === "all")
                this.drawBoxStroke(canvas, width, height, node);
        }
        if (mode !== "stroke" && node.imageUrl && node.shape !== "card") {
            this.drawImage(canvas, node);
            if (mode === "all")
                this.drawBoxStroke(canvas, width, height, node);
        }
        if (mode === "stroke")
            return;
        const hasVideo = isSkiaVideoNode(node);
        const isGalleryNode = node.nodeType === "gallery" || node.nodeType === "output";
        const hasGallery = isGalleryNode && Boolean(node.imageUrls?.length);
        if (node.shape === "card") {
            this.drawCardChrome(canvas, node);
            drawNodeControls(this.canvasKit, canvas, this.fonts, node, this.fillPaint);
            if (node.imageUrl && !hasVideo && !isGalleryNode) {
                this.drawCardImage(canvas, node);
            }
            else if (!hasVideo && !isGalleryNode && node.text) {
                this.drawText(canvas, node);
            }
        }
        if (hasVideo)
            this.drawVideoPlaceholder(canvas, node);
        if (isGalleryNode) {
            this.drawGallery(canvas, node);
        }
        if (!hasVideo &&
            !hasGallery &&
            node.shape !== "card" &&
            (node.text ||
                node.subtitle ||
                node.metadata?.length ||
                node.shape === "button")) {
            this.drawText(canvas, node);
        }
    }
    drawBox(canvas, width, height, element, mode) {
        const draw = (paint) => this.drawBoxGeometry(canvas, width, height, element, paint);
        this.drawPaints(draw, element, (operation, drawStroke) => {
            canvas.save();
            this.clipBoxGeometry(canvas, width, height, element, operation);
            drawStroke();
            canvas.restore();
        }, canvas, mode);
        const strokes = element.strokes?.length
            ? element.strokes
            : element.stroke
                ? [element.stroke]
                : [];
        if (mode !== "base" && strokes.some((stroke) => stroke.sideWidths)) {
            this.drawIndependentBoxStroke(canvas, width, height, element);
        }
    }
    createEllipsePathData(node) {
        return this.createEllipseGeometryPathData(node.bounds.width, node.bounds.height, node.ellipseInnerRadius, node.ellipseStartAngle, node.ellipseSweep);
    }
    createEllipseGeometryPathData(width, height, ellipseInnerRadius, ellipseStartAngle, ellipseSweep) {
        const innerRatio = Math.max(0, Math.min(0.99, (ellipseInnerRadius ?? 0) / 100));
        const sweep = Math.max(-360, Math.min(360, ellipseSweep ?? 360));
        if (innerRatio === 0 && Math.abs(sweep) >= 359.999)
            return null;
        const start = ellipseStartAngle ?? 0;
        const centerX = width / 2;
        const centerY = height / 2;
        const radiusX = width / 2;
        const radiusY = height / 2;
        const point = (angle, scale = 1) => {
            const radians = (angle * Math.PI) / 180;
            return [
                centerX + Math.sin(radians) * radiusX * scale,
                centerY - Math.cos(radians) * radiusY * scale,
            ];
        };
        const direction = sweep >= 0 ? 1 : 0;
        const absoluteSweep = Math.abs(sweep);
        const end = start + sweep;
        const outerStart = point(start);
        if (absoluteSweep >= 359.999) {
            const outerMiddle = point(start + (sweep >= 0 ? 180 : -180));
            const outer = `M ${outerStart[0]} ${outerStart[1]} A ${radiusX} ${radiusY} 0 1 ${direction} ${outerMiddle[0]} ${outerMiddle[1]} A ${radiusX} ${radiusY} 0 1 ${direction} ${outerStart[0]} ${outerStart[1]}`;
            if (innerRatio === 0)
                return `${outer} Z`;
            const innerStart = point(start, innerRatio);
            const innerMiddle = point(start + (sweep >= 0 ? 180 : -180), innerRatio);
            const reverseDirection = direction === 1 ? 0 : 1;
            return `${outer} Z M ${innerStart[0]} ${innerStart[1]} A ${radiusX * innerRatio} ${radiusY * innerRatio} 0 1 ${reverseDirection} ${innerMiddle[0]} ${innerMiddle[1]} A ${radiusX * innerRatio} ${radiusY * innerRatio} 0 1 ${reverseDirection} ${innerStart[0]} ${innerStart[1]} Z`;
        }
        const outerEnd = point(end);
        const largeArc = absoluteSweep > 180 ? 1 : 0;
        const outer = `M ${outerStart[0]} ${outerStart[1]} A ${radiusX} ${radiusY} 0 ${largeArc} ${direction} ${outerEnd[0]} ${outerEnd[1]}`;
        if (innerRatio === 0) {
            return `${outer} L ${centerX} ${centerY} Z`;
        }
        const innerEnd = point(end, innerRatio);
        const innerStart = point(start, innerRatio);
        const reverseDirection = direction === 1 ? 0 : 1;
        return `${outer} L ${innerEnd[0]} ${innerEnd[1]} A ${radiusX * innerRatio} ${radiusY * innerRatio} 0 ${largeArc} ${reverseDirection} ${innerStart[0]} ${innerStart[1]} Z`;
    }
    createBooleanPath(node) {
        if (!node.booleanSources?.length || !node.booleanOperation)
            return null;
        return this.combineBooleanSources(node.booleanSources, node.booleanOperation);
    }
    combineBooleanSources(sources, operation) {
        const paths = sources.flatMap((source) => {
            const path = this.createBooleanSourcePath(source);
            return path ? [path] : [];
        });
        if (paths.length === 0)
            return null;
        let combined = paths[0];
        for (let index = 1; index < paths.length; index += 1) {
            const next = paths[index];
            const result = this.canvasKit.Path.MakeFromOp(combined, next, this.booleanPathOperation(operation));
            combined.delete();
            next.delete();
            if (!result) {
                paths.slice(index + 1).forEach((path) => path.delete());
                return null;
            }
            combined = result;
        }
        return combined;
    }
    createBooleanSourcePath(source) {
        const width = Math.max(0.01, source.w);
        const height = Math.max(0.01, source.h ?? 0);
        let localPath = null;
        if (source.type === "boolean" &&
            source.booleanSources?.length &&
            source.booleanOperation) {
            localPath = this.combineBooleanSources(source.booleanSources, source.booleanOperation);
        }
        else if (source.type === "ellipse") {
            const pathData = this.createEllipseGeometryPathData(width, height, source.ellipseInnerRadius, source.ellipseStartAngle, source.ellipseSweep);
            localPath = this.canvasKit.Path.MakeFromSVGString(pathData ??
                `M ${width / 2} 0 A ${width / 2} ${height / 2} 0 1 1 ${width / 2} ${height} A ${width / 2} ${height / 2} 0 1 1 ${width / 2} 0 Z`);
        }
        else if (source.type === "triangle" || source.type === "polygon") {
            localPath = this.createPolygonPath(width, height, source.type === "triangle" ? 3 : Math.max(3, source.polygonCount ?? 6), source.cornerRadius ?? 0);
        }
        else if (source.type === "rect") {
            localPath = this.canvasKit.Path.MakeFromSVGString(this.roundedRectPathData(width, height, source.cornerRadius ?? 0));
        }
        if (!localPath)
            return null;
        const radians = ((source.rotation ?? 0) * Math.PI) / 180;
        const cosine = Math.cos(radians);
        const sine = Math.sin(radians);
        const centerX = width / 2;
        const centerY = height / 2;
        const matrix = [
            cosine,
            -sine,
            source.x + centerX - cosine * centerX + sine * centerY,
            sine,
            cosine,
            source.y + centerY - sine * centerX - cosine * centerY,
        ];
        const builder = new this.canvasKit.PathBuilder();
        const appended = builder.addPath(localPath, matrix);
        localPath.delete();
        if (!appended) {
            builder.delete();
            return null;
        }
        const transformed = builder.detach();
        builder.delete();
        return transformed;
    }
    booleanPathOperation(operation) {
        if (operation === "subtract")
            return this.canvasKit.PathOp.Difference;
        if (operation === "intersect")
            return this.canvasKit.PathOp.Intersect;
        if (operation === "exclude")
            return this.canvasKit.PathOp.XOR;
        return this.canvasKit.PathOp.Union;
    }
    roundedRectPathData(width, height, cornerRadius) {
        const radius = Math.max(0, Math.min(cornerRadius, width / 2, height / 2));
        if (radius === 0)
            return `M 0 0 H ${width} V ${height} H 0 Z`;
        return `M ${radius} 0 H ${width - radius} Q ${width} 0 ${width} ${radius} V ${height - radius} Q ${width} ${height} ${width - radius} ${height} H ${radius} Q 0 ${height} 0 ${height - radius} V ${radius} Q 0 0 ${radius} 0 Z`;
    }
    drawBoxGeometry(canvas, width, height, element, paint) {
        const rect = [0, 0, width, height];
        const radii = element.cornerRadii;
        if (radii) {
            const limit = Math.max(0, Math.min(width, height) / 2);
            const topLeft = Math.min(limit, radii.topLeft);
            const topRight = Math.min(limit, radii.topRight);
            const bottomRight = Math.min(limit, radii.bottomRight);
            const bottomLeft = Math.min(limit, radii.bottomLeft);
            canvas.drawRRect([
                ...rect,
                topLeft,
                topLeft,
                topRight,
                topRight,
                bottomRight,
                bottomRight,
                bottomLeft,
                bottomLeft,
            ], paint);
            return;
        }
        if ((element.cornerRadius ?? 0) > 0) {
            canvas.drawRRect(this.canvasKit.RRectXY(rect, element.cornerRadius ?? 0, element.cornerRadius ?? 0), paint);
            return;
        }
        canvas.drawRect(rect, paint);
    }
    clipBoxGeometry(canvas, width, height, element, operation) {
        const rect = [0, 0, width, height];
        const radii = element.cornerRadii;
        if (radii) {
            const limit = Math.max(0, Math.min(width, height) / 2);
            canvas.clipRRect([
                ...rect,
                Math.min(limit, radii.topLeft),
                Math.min(limit, radii.topLeft),
                Math.min(limit, radii.topRight),
                Math.min(limit, radii.topRight),
                Math.min(limit, radii.bottomRight),
                Math.min(limit, radii.bottomRight),
                Math.min(limit, radii.bottomLeft),
                Math.min(limit, radii.bottomLeft),
            ], operation, true);
            return;
        }
        if ((element.cornerRadius ?? 0) > 0) {
            canvas.clipRRect(this.canvasKit.RRectXY(rect, element.cornerRadius ?? 0, element.cornerRadius ?? 0), operation, true);
            return;
        }
        canvas.clipRect(rect, operation, true);
    }
    drawBoxStroke(canvas, width, height, element) {
        const strokes = element.strokes?.length
            ? element.strokes
            : element.stroke
                ? [element.stroke]
                : [];
        [...strokes].reverse().forEach((stroke) => {
            const strokeElement = { ...element, stroke, strokes: undefined };
            if (stroke.sideWidths) {
                this.drawIndependentBoxStroke(canvas, width, height, strokeElement);
                return;
            }
            this.drawStroke((paint) => this.drawBoxGeometry(canvas, width, height, strokeElement, paint), strokeElement, (operation, drawStroke) => {
                canvas.save();
                this.clipBoxGeometry(canvas, width, height, strokeElement, operation);
                drawStroke();
                canvas.restore();
            }, canvas);
        });
    }
    drawPaints(draw, element, clipStroke, canvas, mode = "all") {
        const fills = element.fills?.length ? element.fills : [element.fill];
        if (mode !== "stroke") {
            [...fills].reverse().forEach((fill) => {
                if (!fill)
                    return;
                if (fill.imageUrl &&
                    (element.kind === "frame" || element.kind === "node") &&
                    fill.imageUrl === element.imageUrl) {
                    return;
                }
                if (fill.imageUrl &&
                    canvas &&
                    clipStroke &&
                    this.drawImageFill(canvas, element, fill, clipStroke)) {
                    return;
                }
                this.configurePaint(this.fillPaint, fill.color, fill.opacity * element.opacity, false, 0);
                const shader = fill.gradient
                    ? this.createGradientShader(fill.gradient, element.bounds.width, element.bounds.height)
                    : null;
                this.fillPaint.setShader(shader);
                try {
                    draw(this.fillPaint);
                }
                finally {
                    this.fillPaint.setShader(null);
                    shader?.delete();
                }
            });
        }
        if (mode === "base")
            return;
        const strokes = element.strokes?.length
            ? element.strokes
            : [element.stroke];
        [...strokes].reverse().forEach((stroke) => {
            if (stroke?.sideWidths)
                return;
            this.drawStroke(draw, { ...element, stroke, strokes: undefined }, clipStroke, canvas);
        });
    }
    drawImageFill(canvas, element, fill, clipFill) {
        if (!fill.imageUrl)
            return false;
        const image = this.resources.getImage(fill.imageUrl);
        if (!image)
            return false;
        const layout = calculateImageLayout(image.width(), image.height(), element.bounds.width, element.bounds.height, fill.imageFit ?? "cover", fill.imagePosition ?? "center");
        this.configurePaint(this.fillPaint, "#FFFFFF", fill.opacity * element.opacity, false, 0);
        clipFill(this.canvasKit.ClipOp.Intersect, () => this.drawAdjustedImage(this.fillPaint, fill.imageAdjustments, () => this.drawImageForFit(canvas, image, this.fillPaint, fill.imageFit, layout, element.bounds.width, element.bounds.height)));
        return true;
    }
    drawStrokeLayers(draw, element, canvas) {
        const strokes = element.strokes?.length
            ? element.strokes
            : element.stroke
                ? [element.stroke]
                : [];
        [...strokes]
            .reverse()
            .forEach((stroke) => this.drawStroke(draw, { ...element, stroke, strokes: undefined }, undefined, canvas));
    }
    drawIndependentBoxStroke(canvas, width, height, element) {
        const strokes = element.strokes?.length
            ? element.strokes
            : element.stroke
                ? [element.stroke]
                : [];
        [...strokes].reverse().forEach((stroke) => {
            if (!stroke.sideWidths)
                return;
            const sides = [
                { width: stroke.sideWidths.top, start: [0, 0], end: [width, 0] },
                {
                    width: stroke.sideWidths.right,
                    start: [width, 0],
                    end: [width, height],
                },
                {
                    width: stroke.sideWidths.bottom,
                    start: [width, height],
                    end: [0, height],
                },
                { width: stroke.sideWidths.left, start: [0, height], end: [0, 0] },
            ];
            sides.forEach((side) => {
                if (side.width <= 0)
                    return;
                this.withPath(new this.canvasKit.PathBuilder()
                    .moveTo(side.start[0], side.start[1])
                    .lineTo(side.end[0], side.end[1])
                    .detach(), (path) => this.drawStroke((paint) => canvas.drawPath(path, paint), {
                    ...element,
                    stroke: {
                        ...stroke,
                        width: side.width,
                        sideWidths: undefined,
                    },
                    strokes: undefined,
                }, (operation, drawStroke) => {
                    canvas.save();
                    this.clipBoxGeometry(canvas, width, height, element, operation);
                    drawStroke();
                    canvas.restore();
                }, canvas));
            });
        });
    }
    drawStroke(draw, element, clipStroke, canvas) {
        if (element.strokes?.length) {
            [...element.strokes]
                .reverse()
                .forEach((stroke) => this.drawStroke(draw, { ...element, stroke, strokes: undefined }, clipStroke, canvas));
            return;
        }
        if (!element.stroke || element.stroke.width <= 0)
            return;
        const align = clipStroke ? (element.stroke.align ?? "outside") : "center";
        if (canvas &&
            element.stroke.imageUrl &&
            this.drawImageStroke(canvas, draw, element, element.stroke, align, clipStroke)) {
            return;
        }
        this.configurePaint(this.strokePaint, element.stroke.color, element.stroke.opacity * element.opacity, true, align === "center" ? element.stroke.width : element.stroke.width * 2);
        const shader = element.stroke.gradient
            ? this.createGradientShader(element.stroke.gradient, element.bounds.width, element.bounds.height)
            : null;
        this.strokePaint.setShader(shader);
        try {
            this.drawConfiguredStroke((paint) => {
                if (align === "center" || !clipStroke) {
                    draw(paint);
                    return;
                }
                clipStroke(align === "inside"
                    ? this.canvasKit.ClipOp.Intersect
                    : this.canvasKit.ClipOp.Difference, () => draw(paint));
            }, element.stroke);
        }
        finally {
            this.strokePaint.setShader(null);
            shader?.delete();
        }
    }
    drawImageStroke(canvas, draw, element, stroke, align, clipStroke) {
        if (!stroke.imageUrl)
            return false;
        const image = this.resources.getImage(stroke.imageUrl);
        if (!image)
            return false;
        const layout = calculateImageLayout(image.width(), image.height(), element.bounds.width, element.bounds.height, stroke.imageFit ?? "cover", stroke.imagePosition ?? "center");
        canvas.saveLayer();
        try {
            this.configurePaint(this.strokePaint, "#FFFFFF", stroke.opacity * element.opacity, true, align === "center" ? stroke.width : stroke.width * 2);
            this.drawConfiguredStroke((paint) => {
                if (align === "center" || !clipStroke) {
                    draw(paint);
                    return;
                }
                clipStroke(align === "inside"
                    ? this.canvasKit.ClipOp.Intersect
                    : this.canvasKit.ClipOp.Difference, () => draw(paint));
            }, stroke);
            this.configurePaint(this.fillPaint, "#FFFFFF", 1, false, 0);
            this.fillPaint.setBlendMode(this.canvasKit.BlendMode.SrcIn);
            this.drawAdjustedImage(this.fillPaint, stroke.imageAdjustments, () => this.drawImageForFit(canvas, image, this.fillPaint, stroke.imageFit, layout, element.bounds.width, element.bounds.height));
        }
        finally {
            this.fillPaint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
            canvas.restore();
        }
        return true;
    }
    drawStrokePaintedShape(canvas, element, draw) {
        const stroke = element.stroke;
        if (!stroke)
            return;
        if (stroke.imageUrl) {
            const image = this.resources.getImage(stroke.imageUrl);
            if (image) {
                const layout = calculateImageLayout(image.width(), image.height(), element.bounds.width, element.bounds.height, stroke.imageFit ?? "cover", stroke.imagePosition ?? "center");
                canvas.saveLayer();
                try {
                    this.configurePaint(this.fillPaint, "#FFFFFF", stroke.opacity * element.opacity, false, 0);
                    draw(this.fillPaint);
                    this.fillPaint.setBlendMode(this.canvasKit.BlendMode.SrcIn);
                    this.drawAdjustedImage(this.fillPaint, stroke.imageAdjustments, () => this.drawImageForFit(canvas, image, this.fillPaint, stroke.imageFit, layout, element.bounds.width, element.bounds.height));
                }
                finally {
                    this.fillPaint.setBlendMode(this.canvasKit.BlendMode.SrcOver);
                    canvas.restore();
                }
                return;
            }
        }
        this.configurePaint(this.fillPaint, stroke.color, stroke.opacity * element.opacity, false, 0);
        const shader = stroke.gradient
            ? this.createGradientShader(stroke.gradient, element.bounds.width, element.bounds.height)
            : null;
        this.fillPaint.setShader(shader);
        try {
            draw(this.fillPaint);
        }
        finally {
            this.fillPaint.setShader(null);
            shader?.delete();
        }
    }
    drawConfiguredStroke(draw, stroke) {
        const pathEffect = stroke.dash?.length
            ? this.canvasKit.PathEffect.MakeDash([...stroke.dash], 0)
            : null;
        this.strokePaint.setPathEffect(pathEffect);
        this.strokePaint.setStrokeCap(this.canvasKit.StrokeCap[stroke.lineCap === "round"
            ? "Round"
            : stroke.lineCap === "square"
                ? "Square"
                : "Butt"]);
        this.strokePaint.setStrokeJoin(this.canvasKit.StrokeJoin[stroke.lineJoin === "round"
            ? "Round"
            : stroke.lineJoin === "bevel"
                ? "Bevel"
                : "Miter"]);
        this.strokePaint.setStrokeMiter(Math.max(1, stroke.miterLimit ?? 4));
        try {
            draw(this.strokePaint);
        }
        finally {
            this.strokePaint.setPathEffect(null);
            pathEffect?.delete();
        }
    }
    configurePaint(paint, color, opacity, stroke, strokeWidth) {
        paint.setAntiAlias(true);
        paint.setColor(this.canvasKit.parseColorString(color));
        paint.setAlphaf(Math.max(0, Math.min(1, opacity)));
        paint.setStyle(stroke
            ? this.canvasKit.PaintStyle.Stroke
            : this.canvasKit.PaintStyle.Fill);
        paint.setStrokeWidth(strokeWidth);
    }
    createGradientShader(gradient, width, height) {
        const colors = gradient.stops.map((stop) => {
            const alpha = Math.round(Math.max(0, Math.min(100, stop.opacity)) * 2.55)
                .toString(16)
                .padStart(2, "0");
            const color = /^#[0-9a-f]{6}$/i.test(stop.color)
                ? `${stop.color}${alpha}`
                : stop.color;
            return this.canvasKit.parseColorString(color);
        });
        const positions = gradient.stops.map((stop) => Math.max(0, Math.min(1, stop.position / 100)));
        const centerX = (gradient.centerX / 100) * width;
        const centerY = (gradient.centerY / 100) * height;
        if (gradient.type === "linear") {
            if (gradient.startX !== undefined &&
                gradient.startY !== undefined &&
                gradient.endX !== undefined &&
                gradient.endY !== undefined) {
                return this.canvasKit.Shader.MakeLinearGradient([(gradient.startX / 100) * width, (gradient.startY / 100) * height], [(gradient.endX / 100) * width, (gradient.endY / 100) * height], colors, positions, this.canvasKit.TileMode.Clamp);
            }
            const radians = (gradient.angle * Math.PI) / 180;
            const directionX = Math.sin(radians);
            const directionY = -Math.cos(radians);
            const radius = Math.abs(directionX) * (width / 2) +
                Math.abs(directionY) * (height / 2);
            return this.canvasKit.Shader.MakeLinearGradient([centerX - directionX * radius, centerY - directionY * radius], [centerX + directionX * radius, centerY + directionY * radius], colors, positions, this.canvasKit.TileMode.Clamp);
        }
        if (gradient.type === "angular") {
            return this.canvasKit.Shader.MakeSweepGradient(centerX, centerY, colors, positions, this.canvasKit.TileMode.Clamp, null, 0, gradient.angle, gradient.angle + 360);
        }
        const radius = Math.max((width * gradient.width) / 100, (height * gradient.height) / 100) / 2;
        return this.canvasKit.Shader.MakeRadialGradient([centerX, centerY], Math.max(1, radius), colors, positions, this.canvasKit.TileMode.Clamp);
    }
    drawConnection(canvas, connection) {
        const builder = new this.canvasKit.PathBuilder();
        builder
            .moveTo(connection.start.x, connection.start.y)
            .cubicTo(connection.controlStart.x, connection.controlStart.y, connection.controlEnd.x, connection.controlEnd.y, connection.end.x, connection.end.y);
        const path = builder.detach();
        builder.delete();
        this.withPath(path, (connectionPath) => {
            this.configurePaint(this.strokePaint, connection.stroke.color, connection.opacity * connection.stroke.opacity, true, connection.stroke.width);
            this.drawConfiguredStroke((paint) => canvas.drawPath(connectionPath, paint), connection.stroke);
        });
    }
    drawImage(canvas, element) {
        if (!element.imageUrl)
            return;
        const image = this.resources.getImage(element.imageUrl);
        if (!image)
            return;
        // Compare slider (image nodes only): the resolved upstream "before"
        // image paints full-bleed underneath and the node's own "after" image is
        // clipped to everything right of the divider — same semantics as the
        // retired DOM compare overlay. Until the before image finishes loading
        // we paint the plain after image; the resource manager invalidates on
        // load and the wipe appears on the next frame.
        const compareBeforeUrl = element.kind === "node" ? element.compareBeforeUrl : undefined;
        const beforeImage = compareBeforeUrl
            ? this.resources.getImage(compareBeforeUrl)
            : null;
        const rasterDocument = element.rasterDocument;
        const baseLayout = calculateImageLayout(image.width(), image.height(), element.bounds.width, element.bounds.height, element.imageFit ?? "cover", element.imagePosition ?? "center");
        const layout = rasterDocument?.crop
            ? {
                source: rasterDocument.crop,
                destination: {
                    x: 0,
                    y: 0,
                    width: element.bounds.width,
                    height: element.bounds.height,
                },
            }
            : baseLayout;
        canvas.save();
        this.clipEffectGeometry(canvas, element, this.canvasKit.ClipOp.Intersect);
        if (rasterDocument) {
            const centerX = element.bounds.width / 2;
            const centerY = element.bounds.height / 2;
            canvas.translate(rasterDocument.transform.offsetX ?? 0, rasterDocument.transform.offsetY ?? 0);
            canvas.translate(centerX, centerY);
            canvas.scale(rasterDocument.transform.flipHorizontal ? -1 : 1, rasterDocument.transform.flipVertical ? -1 : 1);
            canvas.rotate(rasterDocument.transform.rotation, 0, 0);
            canvas.translate(-centerX, -centerY);
            if (rasterDocument.layerMask?.geometry) {
                clipRasterSelection(this.canvasKit, canvas, rasterDocument, layout, rasterDocument.layerMask.geometry);
            }
        }
        if (element.imageFit === "none") {
            const centerX = element.bounds.width / 2;
            const centerY = element.bounds.height / 2;
            canvas.translate(element.imageCropOffsetX ?? 0, element.imageCropOffsetY ?? 0);
            if (element.imageCropRotation) {
                canvas.rotate(element.imageCropRotation, centerX, centerY);
            }
            const cropScale = Math.max(0.01, element.imageCropScale ?? 1);
            canvas.translate(centerX, centerY);
            canvas.scale(cropScale, cropScale);
            canvas.translate(-centerX, -centerY);
        }
        const hasRasterStrokes = Boolean(rasterDocument?.strokes.length);
        if (hasRasterStrokes)
            canvas.saveLayer();
        this.configurePaint(this.fillPaint, "#FFFFFF", element.opacity, false, 0);
        if (beforeImage) {
            const beforeLayout = calculateImageLayout(beforeImage.width(), beforeImage.height(), element.bounds.width, element.bounds.height, element.imageFit ?? "cover", element.imagePosition ?? "center");
            this.drawImageForFit(canvas, beforeImage, this.fillPaint, element.imageFit, beforeLayout, element.bounds.width, element.bounds.height);
            const dividerX = compareDividerX(element.bounds.width, element.kind === "node" ? (element.comparePercent ?? 50) : 50);
            canvas.save();
            canvas.clipRect([dividerX, 0, element.bounds.width, element.bounds.height], this.canvasKit.ClipOp.Intersect, true);
            this.drawAdjustedImage(this.fillPaint, element.imageAdjustments, () => this.drawImageForFit(canvas, image, this.fillPaint, element.imageFit, layout, element.bounds.width, element.bounds.height), rasterDocument);
            canvas.restore();
        }
        else {
            this.drawAdjustedImage(this.fillPaint, element.imageAdjustments, () => this.drawImageForFit(canvas, image, this.fillPaint, element.imageFit, layout, element.bounds.width, element.bounds.height), rasterDocument);
        }
        if (rasterDocument?.gradients?.length) {
            drawRasterGradients(this.canvasKit, canvas, this.fillPaint, rasterDocument, layout);
        }
        if (rasterDocument?.strokes.length) {
            for (const stroke of rasterDocument.strokes) {
                const strokeDocument = { ...rasterDocument, strokes: [stroke] };
                drawRasterRetouchStrokes(this.canvasKit, canvas, image, this.fillPaint, strokeDocument, layout);
                drawRasterStrokes(this.canvasKit, canvas, this.strokePaint, strokeDocument, layout);
            }
        }
        if (hasRasterStrokes)
            canvas.restore();
        canvas.restore();
        if (beforeImage && element.kind === "node") {
            this.drawCompareChrome(canvas, element);
        }
    }
    drawEmptyImagePlaceholder(canvas, node) {
        const layout = layoutImagePlaceholder(node.bounds);
        this.configurePaint(this.fillPaint, "#E5E7EB", node.opacity * 0.72, false, 0);
        canvas.drawRect(layout.background, this.fillPaint);
        const { x, y, width, height, radius, strokeWidth } = layout.icon;
        this.configurePaint(this.strokePaint, "#9CA3AF", node.opacity, true, strokeWidth);
        canvas.drawRRect(this.canvasKit.RRectXY([x, y, x + width, y + height], radius, radius), this.strokePaint);
        canvas.drawCircle(x + width * 0.72, y + height * 0.28, Math.max(1, width * 0.08), this.strokePaint);
        const builder = new this.canvasKit.PathBuilder();
        builder
            .moveTo(x + width * 0.14, y + height * 0.78)
            .lineTo(x + width * 0.4, y + height * 0.48)
            .lineTo(x + width * 0.58, y + height * 0.7)
            .lineTo(x + width * 0.72, y + height * 0.56)
            .lineTo(x + width * 0.86, y + height * 0.78);
        const path = builder.detach();
        builder.delete();
        this.withPath(path, (iconPath) => canvas.drawPath(iconPath, this.strokePaint));
    }
    /**
     * Divider line, grab handle and Before/After labels for the compare
     * slider. Flat styling (no shadows/glows — AGENTS.md canvas rule): the
     * DOM version's divider box-shadow becomes a dark underlay rect, and the
     * handle's drop shadow becomes a 1px border in the same zinc tone the
     * Skia control chips use.
     */
    drawCompareChrome(canvas, node) {
        const { width, height } = node.bounds;
        const dividerX = compareDividerX(width, node.comparePercent ?? 50);
        canvas.save();
        this.clipEffectGeometry(canvas, node, this.canvasKit.ClipOp.Intersect);
        this.configurePaint(this.fillPaint, "#000000", node.opacity * 0.35, false, 0);
        canvas.drawRect([dividerX - 1.5, 0, dividerX + 1.5, height], this.fillPaint);
        this.configurePaint(this.fillPaint, "#FFFFFF", node.opacity, false, 0);
        canvas.drawRect([dividerX - 0.5, 0, dividerX + 0.5, height], this.fillPaint);
        const centerY = height / 2;
        canvas.drawCircle(dividerX, centerY, COMPARE_HANDLE_RADIUS, this.fillPaint);
        this.configurePaint(this.strokePaint, "#E4E4E7", node.opacity, true, 1);
        canvas.drawCircle(dividerX, centerY, COMPARE_HANDLE_RADIUS - 0.5, this.strokePaint);
        // ⇆ as two stroked arrows (top points left, bottom points right) — a
        // text glyph would depend on font coverage the canvas can't guarantee.
        const builder = new this.canvasKit.PathBuilder();
        builder
            .moveTo(dividerX + 4.5, centerY - 3)
            .lineTo(dividerX - 4.5, centerY - 3)
            .lineTo(dividerX - 1.5, centerY - 5.5)
            .moveTo(dividerX - 4.5, centerY - 3)
            .lineTo(dividerX - 1.5, centerY - 0.5)
            .moveTo(dividerX - 4.5, centerY + 3)
            .lineTo(dividerX + 4.5, centerY + 3)
            .lineTo(dividerX + 1.5, centerY + 0.5)
            .moveTo(dividerX + 4.5, centerY + 3)
            .lineTo(dividerX + 1.5, centerY + 5.5);
        const arrows = builder.detach();
        builder.delete();
        this.withPath(arrows, (path) => {
            this.configurePaint(this.strokePaint, "#52525B", node.opacity, true, 1.5);
            canvas.drawPath(path, this.strokePaint);
        });
        this.drawCompareLabel(canvas, node, "BEFORE", 6, "left");
        this.drawCompareLabel(canvas, node, "AFTER", width - 6, "right");
        canvas.restore();
    }
    /** Small uppercase pill in a top corner, mirroring the DOM slider's labels. */
    drawCompareLabel(canvas, node, text, anchorX, align) {
        const fontSize = 9;
        const paddingX = 6;
        const pillHeight = 15;
        const textWidth = estimateControlTextWidth(text, fontSize);
        const pillWidth = Math.ceil(textWidth) + paddingX * 2;
        const pillX = align === "left" ? anchorX : anchorX - pillWidth;
        this.configurePaint(this.fillPaint, "#000000", node.opacity * 0.5, false, 0);
        canvas.drawRRect(this.canvasKit.RRectXY([pillX, 6, pillX + pillWidth, 6 + pillHeight], 3, 3), this.fillPaint);
        const label = this.fonts.createParagraph({
            text,
            color: colorWithOpacity("#FFFFFF", node.opacity),
            fontFamily: "Inter",
            fontSize,
            fontWeight: 800,
            lineHeight: fontSize + 2,
            letterSpacing: 0.5,
            align: "left",
            direction: "ltr",
            maxLines: 1,
        }, Math.max(1, pillWidth - paddingX * 2));
        if (!label)
            return;
        try {
            canvas.drawParagraph(label, pillX + paddingX, 8);
        }
        finally {
            label.delete();
        }
    }
    drawText(canvas, node, mode = "all") {
        if (node.textVisible === false || (node.textOpacity ?? 1) <= 0)
            return;
        const nativeEditing = getNativeTextEditingRenderState(node.id);
        const bodyParts = [
            node.text,
            node.subtitle,
            node.shape === "card" ? undefined : node.metadata?.join(" · "),
        ].filter((value) => Boolean(value?.trim()));
        const fallbackText = node.shape === "text"
            ? (node.text ?? "")
            : node.shape === "button"
                ? node.title
                : "";
        const persistedText = bodyParts.join("\n") || fallbackText;
        const text = nativeEditing
            ? getNativeTextEditingDisplayText(nativeEditing)
            : persistedText;
        const compositionStart = nativeEditing
            ? Math.min(nativeEditing.selectionStart, nativeEditing.selectionEnd)
            : 0;
        if (!text)
            return;
        const fontSize = node.fontSize ?? 14;
        const paragraphSpacing = Math.max(0, node.paragraphSpacing ?? 0);
        const paragraphTexts = nativeEditing
            ? [text]
            : paragraphSpacing > 0 && !node.maxLines
                ? text.split("\n")
                : [text];
        // Auto-width text hugs its glyphs, so it must never wrap — laying it out
        // at `bounds.width` re-flows it as soon as the font we resolve is wider
        // than the one the box was measured against (a Figma import carries the
        // width Figma computed with fonts we may not have, which is what split
        // short labels like "VS" across two lines). Unbounded layout keeps the
        // single line the design intends; the box may overhang, which matches how
        // Figma itself renders a stale auto-width box.
        const paragraphWidth = node.textAutoWidth
            ? AUTO_WIDTH_LAYOUT_BOUND
            : Math.max(1, node.bounds.width -
                (node.shape === "card"
                    ? AI_NODE_LAYOUT.contentInset * 2
                    : node.shape === "button"
                        ? 24
                        : 0));
        const drawParagraphLayer = (color, opacity, offsetX = 0, offsetY = 0) => {
            const paragraphs = paragraphTexts
                .map((paragraphText) => {
                const run = {
                    text: paragraphText || " ",
                    color: colorWithOpacity(color, opacity),
                    fontFamily: node.fontFamily ?? "Inter",
                    fontSize,
                    fontWeight: node.fontWeight ?? 400,
                    italic: node.italic,
                    underline: node.underline,
                    strikethrough: node.strikethrough,
                    lineHeight: node.lineHeight ?? fontSize * 1.5,
                    letterSpacing: node.letterSpacing ?? 0,
                    maxLines: node.maxLines,
                    ellipsis: node.ellipsis,
                    // Alignment is relative to the layout width, so it must collapse
                    // to the leading edge once that width is the synthetic auto-width
                    // bound — otherwise "center" would park the glyphs half a million
                    // pixels away. A hug box is exactly as wide as its text, which
                    // makes every alignment visually identical anyway.
                    align: node.textAutoWidth
                        ? node.textDirection === "rtl"
                            ? "right"
                            : "left"
                        : (node.textAlign ?? "left"),
                    direction: node.textDirection ?? "ltr",
                };
                return this.fonts.createParagraph(run, paragraphWidth);
            })
                .filter((paragraph) => paragraph !== null);
            if (paragraphs.length === 0)
                return;
            const top = node.shape === "card"
                ? AI_NODE_LAYOUT.contentInset + 8
                : node.shape === "button"
                    ? 8
                    : 0;
            const bottom = node.shape === "card"
                ? AI_NODE_LAYOUT.footerHeight + AI_NODE_LAYOUT.contentInset
                : 8;
            const availableHeight = Math.max(0, node.bounds.height - top - bottom);
            const textHeight = paragraphs.reduce((total, paragraph) => total + paragraph.getHeight(), 0) +
                paragraphSpacing * Math.max(0, paragraphs.length - 1);
            const extraSpace = Math.max(0, availableHeight - textHeight);
            const verticalOffset = node.textAlignVertical === "bottom"
                ? extraSpace
                : node.textAlignVertical === "middle"
                    ? extraSpace / 2
                    : 0;
            let paragraphTop = top + verticalOffset;
            const paragraphX = node.shape === "card"
                ? AI_NODE_LAYOUT.contentInset
                : node.shape === "button"
                    ? 12
                    : 0;
            paragraphs.forEach((paragraph, paragraphIndex) => {
                if (nativeEditing && mode !== "stroke" && paragraphIndex === 0) {
                    const selectionStart = Math.min(nativeEditing.selectionStart, nativeEditing.selectionEnd);
                    const selectionEnd = Math.max(nativeEditing.selectionStart, nativeEditing.selectionEnd);
                    const rectsForRange = (start, end) => paragraph
                        .getRectsForRange(start, end, this.canvasKit.RectHeightStyle.Max, this.canvasKit.RectWidthStyle.Tight)
                        .map(({ rect }) => ({
                        left: rect[0] + paragraphX,
                        top: rect[1] + paragraphTop,
                        right: rect[2] + paragraphX,
                        bottom: rect[3] + paragraphTop,
                    }));
                    const glyphRects = Array.from({ length: text.length }, (_, index) => rectsForRange(index, index + 1)[0] ?? null);
                    const caretRects = Array.from({ length: text.length + 1 }, (_, index) => {
                        const current = glyphRects[index];
                        if (current)
                            return { ...current, right: current.left };
                        const previous = glyphRects[index - 1];
                        return previous
                            ? { ...previous, left: previous.right }
                            : {
                                left: paragraphX,
                                right: paragraphX,
                                top: paragraphTop,
                                bottom: paragraphTop + fontSize * (node.lineHeight ?? 1.5),
                            };
                    });
                    const layout = {
                        textLength: text.length,
                        glyphRects,
                        caretRects,
                    };
                    setNativeTextEditingLayout(node.id, layout);
                    rectsForRange(selectionStart, selectionEnd).forEach((rect) => {
                        this.configurePaint(this.fillPaint, "#3B82F6", 0.25, false, 0);
                        canvas.drawRect([rect.left, rect.top, rect.right, rect.bottom], this.fillPaint);
                    });
                    if (nativeEditing.compositionText) {
                        const compositionEnd = compositionStart + nativeEditing.compositionText.length;
                        rectsForRange(compositionStart, compositionEnd).forEach((rect) => {
                            this.configurePaint(this.strokePaint, "#3B82F6", 1, true, 1);
                            canvas.drawRect([rect.left, rect.bottom - 1, rect.right, rect.bottom], this.strokePaint);
                        });
                    }
                    const caretIndex = nativeEditing.isComposing
                        ? compositionStart + nativeEditing.compositionText.length
                        : nativeEditing.selectionEnd;
                    const caret = caretRects[caretIndex];
                    if (nativeEditing.caretVisible && caret) {
                        this.configurePaint(this.fillPaint, "#3B82F6", 1, false, 0);
                        canvas.drawRect([caret.left, caret.top, caret.left + 1, caret.bottom], this.fillPaint);
                    }
                }
                canvas.drawParagraph(paragraph, paragraphX + offsetX, paragraphTop + offsetY);
                paragraphTop += paragraph.getHeight() + paragraphSpacing;
            });
            paragraphs.forEach((paragraph) => paragraph.delete());
        };
        if (mode !== "stroke") {
            drawParagraphLayer(node.textColor ?? "#18181B", node.opacity * (node.textOpacity ?? 1));
        }
        if (mode === "base")
            return;
        const strokes = node.strokes?.length
            ? node.strokes
            : node.stroke
                ? [node.stroke]
                : [];
        [...strokes].reverse().forEach((stroke) => {
            if (stroke.width <= 0)
                return;
            this.configurePaint(this.effectsPaint, "#FFFFFF", stroke.opacity * node.opacity, false, 0);
            const radius = stroke.width / 2;
            const sampleCount = Math.max(8, Math.min(24, Math.ceil(stroke.width * 4)));
            const strokeColor = stroke.gradient?.stops[0]?.color ?? stroke.color;
            canvas.saveLayer(this.effectsPaint);
            try {
                for (let index = 0; index < sampleCount; index += 1) {
                    const angle = (index / sampleCount) * Math.PI * 2;
                    drawParagraphLayer(strokeColor, 1, Math.cos(angle) * radius, Math.sin(angle) * radius);
                }
            }
            finally {
                canvas.restore();
            }
        });
    }
    setCurrentContext(snapshot, viewport) {
        this.currentSnapshot = snapshot;
        this.currentViewport = viewport;
    }
    drawFrameTitle(canvas, frame) {
        const nativeEditing = getNativeTextEditingRenderState(frame.id);
        if (!nativeEditing && !frame.title)
            return;
        // Imported components commonly use nested frames as implementation
        // wrappers. Their layer names are editor metadata, not visible content,
        // so never paint them on the canvas. Inline renaming remains the one
        // explicit exception because it needs a text surface to edit.
        if (!nativeEditing && frame.parentId)
            return;
        const isMainComponent = Boolean(frame.isComponent || frame.isMainComponent);
        const isInstance = Boolean(frame.readOnly);
        const isComponentItem = isMainComponent || isInstance;
        let text = nativeEditing
            ? getNativeTextEditingDisplayText(nativeEditing)
            : frame.title;
        if (isMainComponent && text && !text.startsWith("❖ ")) {
            text = `❖ ${text}`;
        }
        else if (isInstance && text && !text.startsWith("◇ ")) {
            text = `◇ ${text}`;
        }
        const zoom = this.currentViewport?.zoom ?? 1;
        // Scale font size inversely with zoom so frame title stays at constant 12px screen size regardless of canvas zoom
        const unscaledFontSize = 12 / zoom;
        const unscaledLineHeight = 16 / zoom;
        const paragraphX = 0;
        const paragraphTop = -20 / zoom;
        // Title color semantics:
        // - Component frame (Main/Instance): Purple (#9747FF)
        // - Selected frame: Blue (#3B82F6)
        // - Normal frame: Soft Muted Gray (#71717A)
        const isSelected = this.currentSnapshot?.selectedIds?.has(frame.id) ?? false;
        const titleColor = isComponentItem
            ? "#9747FF"
            : isSelected
                ? "#3B82F6"
                : "#71717A";
        const paragraph = this.fonts.createParagraph({
            text: text || " ",
            color: colorWithOpacity(titleColor, frame.opacity),
            fontFamily: "Inter",
            fontSize: unscaledFontSize,
            fontWeight: 600,
            lineHeight: unscaledLineHeight,
            letterSpacing: 0,
            maxLines: 1,
            ellipsis: "…",
            align: "left",
            direction: "ltr",
        }, Math.max(1, frame.bounds.width));
        if (!paragraph)
            return;
        try {
            if (nativeEditing) {
                const selectionStart = Math.min(nativeEditing.selectionStart, nativeEditing.selectionEnd);
                const selectionEnd = Math.max(nativeEditing.selectionStart, nativeEditing.selectionEnd);
                const compositionStart = selectionStart;
                const rectsForRange = (start, end) => paragraph
                    .getRectsForRange(start, end, this.canvasKit.RectHeightStyle.Max, this.canvasKit.RectWidthStyle.Tight)
                    .map((range) => {
                    const rect = range.rect;
                    return {
                        left: paragraphX + rect[0],
                        top: paragraphTop + rect[1],
                        right: paragraphX + rect[2],
                        bottom: paragraphTop + rect[3],
                    };
                });
                const caretRects = Array.from({ length: text.length + 1 }, (_, index) => {
                    const rangeRects = paragraph.getRectsForRange(index, index + 1, this.canvasKit.RectHeightStyle.Max, this.canvasKit.RectWidthStyle.Tight);
                    const rect = rangeRects[0]?.rect;
                    return rect
                        ? {
                            left: paragraphX + rect[0],
                            top: paragraphTop + rect[1],
                            right: paragraphX + rect[0],
                            bottom: paragraphTop + rect[3],
                        }
                        : {
                            left: paragraphX,
                            right: paragraphX,
                            top: paragraphTop,
                            bottom: paragraphTop + unscaledLineHeight,
                        };
                });
                const layout = {
                    textLength: text.length,
                    glyphRects: caretRects,
                    caretRects,
                };
                setNativeTextEditingLayout(frame.id, layout);
                rectsForRange(selectionStart, selectionEnd).forEach((rect) => {
                    this.configurePaint(this.fillPaint, "#3B82F6", 0.25, false, 0);
                    canvas.drawRect([rect.left, rect.top, rect.right, rect.bottom], this.fillPaint);
                });
                if (nativeEditing.compositionText) {
                    const compositionEnd = compositionStart + nativeEditing.compositionText.length;
                    rectsForRange(compositionStart, compositionEnd).forEach((rect) => {
                        this.configurePaint(this.strokePaint, "#3B82F6", 1, true, 1 / zoom);
                        canvas.drawRect([rect.left, rect.bottom - 1 / zoom, rect.right, rect.bottom], this.strokePaint);
                    });
                }
                const caretIndex = nativeEditing.isComposing
                    ? compositionStart + nativeEditing.compositionText.length
                    : nativeEditing.selectionEnd;
                const caret = caretRects[caretIndex];
                if (nativeEditing.caretVisible && caret) {
                    this.configurePaint(this.fillPaint, "#3B82F6", 1, false, 0);
                    canvas.drawRect([caret.left, caret.top, caret.left + 1 / zoom, caret.bottom], this.fillPaint);
                }
            }
            canvas.drawParagraph(paragraph, paragraphX, paragraphTop);
        }
        finally {
            paragraph.delete();
        }
    }
    drawCardChrome(canvas, node) {
        const { cornerRadius } = AI_NODE_LAYOUT;
        const isAiCard = isAiControlCard(node);
        const borderWidth = isAiCard && node.status === "RUNNING" ? 2 : 1;
        const borderColor = !isAiCard
            ? "#E5E7EB"
            : node.status === "RUNNING"
                ? "#10B981"
                : node.status === "FAILED"
                    ? "#EF4444"
                    : "#18181B";
        // 1. Draw subtle elevated drop shadow for AI cards
        if (isAiCard) {
            const shadowFilter = this.canvasKit.ImageFilter?.MakeDropShadowOnly?.(0, 4, 8, 8, this.canvasKit.parseColorString("#0000001F"), // 12% soft black shadow
            null);
            if (shadowFilter) {
                this.effectsPaint.setImageFilter(shadowFilter);
                canvas.drawRRect(this.canvasKit.RRectXY([0, 0, node.bounds.width, node.bounds.height], cornerRadius, cornerRadius), this.effectsPaint);
                this.effectsPaint.setImageFilter(null);
                shadowFilter.delete();
            }
        }
        // 2. Card background fill: solid opaque light gray (#F4F4F5 / zinc-100)
        this.configurePaint(this.fillPaint, "#F4F4F5", node.opacity, false, 0);
        canvas.drawRRect(this.canvasKit.RRectXY([0, 0, node.bounds.width, node.bounds.height], cornerRadius, cornerRadius), this.fillPaint);
        // 3. Card border stroke: solid high-contrast black (#18181B) or state color
        const borderInset = borderWidth / 2;
        this.configurePaint(this.strokePaint, borderColor, node.opacity, true, borderWidth);
        canvas.drawRRect(this.canvasKit.RRectXY([
            borderInset,
            borderInset,
            node.bounds.width - borderInset,
            node.bounds.height - borderInset,
        ], cornerRadius - borderInset, cornerRadius - borderInset), this.strokePaint);
        const zoom = this.currentViewport?.zoom ?? 1;
        const unscaledFontSize = 12 / zoom;
        const unscaledLineHeight = 16 / zoom;
        const isSelected = this.currentSnapshot?.selectedIds?.has(node.id) ?? false;
        const titleColor = isSelected ? "#3B82F6" : "#71717A";
        const title = this.fonts.createParagraph({
            text: node.title || node.nodeType,
            color: colorWithOpacity(titleColor, node.opacity),
            fontFamily: node.fontFamily ?? "Inter",
            fontSize: unscaledFontSize,
            fontWeight: 600,
            lineHeight: unscaledLineHeight,
            letterSpacing: 0,
            maxLines: 1,
            ellipsis: "…",
            align: "left",
            direction: "ltr",
        }, Math.max(1, node.bounds.width));
        if (title) {
            try {
                canvas.drawParagraph(title, 0, -20 / zoom);
            }
            finally {
                title.delete();
            }
        }
    }
    drawCardImage(canvas, node) {
        if (!node.imageUrl)
            return;
        const image = this.resources.getImage(node.imageUrl);
        if (!image)
            return;
        const left = AI_NODE_LAYOUT.contentInset;
        const top = AI_NODE_LAYOUT.contentInset;
        const width = Math.max(1, node.bounds.width - left * 2);
        const height = Math.max(1, node.bounds.height - top * 2 - AI_NODE_LAYOUT.footerHeight);
        const layout = calculateImageLayout(image.width(), image.height(), width, height, node.imageFit ?? "cover", node.imagePosition ?? "center");
        canvas.save();
        canvas.clipRRect(this.canvasKit.RRectXY([left, top, left + width, top + height], 12, 12), this.canvasKit.ClipOp.Intersect, true);
        this.configurePaint(this.fillPaint, "#FFFFFF", node.opacity, false, 0);
        canvas.drawImageRect(image, [
            layout.source.x,
            layout.source.y,
            layout.source.x + layout.source.width,
            layout.source.y + layout.source.height,
        ], [
            left + layout.destination.x,
            top + layout.destination.y,
            left + layout.destination.x + layout.destination.width,
            top + layout.destination.y + layout.destination.height,
        ], this.fillPaint, false);
        canvas.restore();
    }
    drawGallery(canvas, node) {
        const urls = node.imageUrls?.slice(0, GALLERY_MAX_THUMBS) ?? [];
        if (urls.length === 0) {
            const left = AI_NODE_LAYOUT.contentInset;
            const top = AI_NODE_LAYOUT.contentInset;
            const width = Math.max(1, node.bounds.width - left * 2);
            const height = Math.max(1, node.bounds.height - top * 2 - AI_NODE_LAYOUT.footerHeight);
            const paragraph = this.fonts.createParagraph({
                text: "No images generated yet\nConnect generator output to collect results",
                color: colorWithOpacity("#A1A1AA", node.opacity),
                fontFamily: node.fontFamily ?? "Inter",
                fontSize: 13,
                fontWeight: 400,
                lineHeight: 18,
                letterSpacing: 0,
                align: "center",
                direction: "ltr",
            }, width);
            if (paragraph) {
                try {
                    const textHeight = paragraph.getHeight();
                    const paragraphTop = top + Math.max(0, (height - textHeight) / 2);
                    canvas.drawParagraph(paragraph, left, paragraphTop);
                }
                finally {
                    paragraph.delete();
                }
            }
            return;
        }
        // Thumbnail rects come from gallery-layout so pointer hit-testing in
        // SkiaCanvasHost resolves clicks against the exact painted geometry.
        for (const thumb of layoutGalleryThumbs(node.bounds, urls.length)) {
            const image = this.resources.getImage(urls[thumb.index]);
            if (!image)
                continue;
            const { x, y, width, height } = thumb;
            const layout = calculateImageLayout(image.width(), image.height(), width, height, "cover", "center");
            canvas.save();
            canvas.clipRRect(this.canvasKit.RRectXY([x, y, x + width, y + height], 12, 12), this.canvasKit.ClipOp.Intersect, true);
            this.configurePaint(this.fillPaint, "#FFFFFF", node.opacity, false, 0);
            canvas.drawImageRect(image, [
                layout.source.x,
                layout.source.y,
                layout.source.x + layout.source.width,
                layout.source.y + layout.source.height,
            ], [
                x + layout.destination.x,
                y + layout.destination.y,
                x + layout.destination.x + layout.destination.width,
                y + layout.destination.y + layout.destination.height,
            ], this.fillPaint, false);
            canvas.restore();
        }
    }
    drawVideoPlaceholder(canvas, node) {
        const playback = this.videoNodePlaybacks.get(node.id);
        this.videoPainter.drawNode(canvas, node, playback ?? null);
    }
    drawArrowheads(canvas, node) {
        const strokes = node.strokes?.length
            ? node.strokes
            : node.stroke
                ? [node.stroke]
                : [];
        [...strokes].reverse().forEach((stroke) => this.drawArrowheadsForStroke(canvas, {
            ...node,
            stroke,
            strokes: undefined,
        }));
    }
    drawArrowheadsForStroke(canvas, node) {
        const width = node.bounds.width;
        const height = node.bounds.height;
        if (node.strokeStartArrow && node.strokeStartArrow !== "none") {
            this.drawArrowhead(canvas, node, node.strokeStartArrow, 0, 0, width, height);
        }
        if (node.strokeEndArrow && node.strokeEndArrow !== "none") {
            this.drawArrowhead(canvas, node, node.strokeEndArrow, width, height, 0, 0);
        }
    }
    drawArrowhead(canvas, node, arrow, tipX, tipY, fromX, fromY) {
        const angle = Math.atan2(tipY - fromY, tipX - fromX);
        const strokeWidth = node.stroke?.width ?? 2;
        const capHalf = strokeWidth / 2;
        if (arrow === "round") {
            this.drawStrokePaintedShape(canvas, node, (paint) => canvas.drawCircle(tipX, tipY, capHalf, paint));
            return;
        }
        if (arrow === "square") {
            const tangentX = Math.cos(angle) * capHalf;
            const tangentY = Math.sin(angle) * capHalf;
            const capNormalX = -Math.sin(angle) * capHalf;
            const capNormalY = Math.cos(angle) * capHalf;
            const capBuilder = new this.canvasKit.PathBuilder();
            capBuilder
                .moveTo(tipX + tangentX + capNormalX, tipY + tangentY + capNormalY)
                .lineTo(tipX + tangentX - capNormalX, tipY + tangentY - capNormalY)
                .lineTo(tipX - tangentX - capNormalX, tipY - tangentY - capNormalY)
                .lineTo(tipX - tangentX + capNormalX, tipY - tangentY + capNormalY)
                .close();
            const capPath = capBuilder.detach();
            capBuilder.delete();
            this.withPath(capPath, (path) => {
                this.drawStrokePaintedShape(canvas, node, (paint) => canvas.drawPath(path, paint));
            });
            return;
        }
        const size = Math.max(8, (node.stroke?.width ?? 2) * 4);
        const backX = tipX - Math.cos(angle) * size;
        const backY = tipY - Math.sin(angle) * size;
        const normalX = -Math.sin(angle) * size * 0.45;
        const normalY = Math.cos(angle) * size * 0.45;
        if (arrow === "circle") {
            this.drawStrokePaintedShape(canvas, node, (paint) => canvas.drawCircle(tipX, tipY, size * 0.45, paint));
            return;
        }
        const builder = new this.canvasKit.PathBuilder();
        if (arrow === "line") {
            builder.moveTo(tipX, tipY).lineTo(backX + normalX, backY + normalY);
            builder.moveTo(tipX, tipY).lineTo(backX - normalX, backY - normalY);
        }
        else if (arrow === "triangle-flip") {
            builder
                .moveTo(tipX + normalX, tipY + normalY)
                .lineTo(backX, backY)
                .lineTo(tipX - normalX, tipY - normalY)
                .close();
        }
        else if (arrow === "diamond") {
            const middleX = (tipX + backX) / 2;
            const middleY = (tipY + backY) / 2;
            builder
                .moveTo(tipX, tipY)
                .lineTo(middleX + normalX, middleY + normalY)
                .lineTo(backX, backY)
                .lineTo(middleX - normalX, middleY - normalY)
                .close();
        }
        else {
            builder
                .moveTo(tipX, tipY)
                .lineTo(backX + normalX, backY + normalY)
                .lineTo(backX - normalX, backY - normalY)
                .close();
        }
        const path = builder.detach();
        builder.delete();
        this.withPath(path, (arrowPath) => {
            if (arrow === "line") {
                this.drawStroke((paint) => canvas.drawPath(arrowPath, paint), node, undefined, canvas);
            }
            else {
                this.drawStrokePaintedShape(canvas, node, (paint) => canvas.drawPath(arrowPath, paint));
            }
        });
    }
    createPolygonPath(width, height, sides, cornerRadius) {
        const radiusX = width / 2;
        const radiusY = height / 2;
        const points = Array.from({ length: sides }, (_, index) => {
            const angle = -Math.PI / 2 + (index * Math.PI * 2) / sides;
            return {
                x: radiusX + Math.cos(angle) * radiusX,
                y: radiusY + Math.sin(angle) * radiusY,
            };
        });
        if (cornerRadius > 0) {
            const roundedPath = this.canvasKit.Path.MakeFromSVGString(roundedPolygonPath(points, cornerRadius));
            if (roundedPath)
                return roundedPath;
        }
        const builder = new this.canvasKit.PathBuilder();
        for (let index = 0; index < points.length; index += 1) {
            const point = points[index];
            if (index === 0)
                builder.moveTo(point.x, point.y);
            else
                builder.lineTo(point.x, point.y);
        }
        builder.close();
        const path = builder.detach();
        builder.delete();
        return path;
    }
    createLinePath(width, height, pathData) {
        if (pathData) {
            const parsed = this.canvasKit.Path.MakeFromSVGString(pathData);
            if (parsed)
                return parsed;
        }
        const builder = new this.canvasKit.PathBuilder();
        builder.moveTo(0, 0).lineTo(width, height);
        const path = builder.detach();
        builder.delete();
        return path;
    }
    /**
     * A parsed path for `pathData`, reused across frames. Returns null on an
     * unparseable string, exactly like `Path.MakeFromSVGString`.
     *
     * The cache is bounded so a long editing session cannot grow it without
     * limit; the oldest entry is evicted and freed on overflow. Callers must not
     * mutate what they get back — `withCachedPath` is the safe way to draw one.
     */
    cachedPath(pathData, fillRule) {
        // `setFillType` writes to the path, so two nodes sharing a path string but
        // asking for different rules must not share one cached object.
        const key = fillRule ? `${fillRule}|${pathData}` : pathData;
        const hit = this.pathCache.get(key);
        if (hit) {
            // Refresh recency: Map keeps insertion order, so re-inserting moves it
            // to the end and keeps the eviction below picking a genuinely old entry.
            this.pathCache.delete(key);
            this.pathCache.set(key, hit);
            return hit;
        }
        const parsed = this.canvasKit.Path.MakeFromSVGString(pathData);
        if (!parsed)
            return null;
        if (fillRule) {
            parsed.setFillType?.(fillRule === "evenodd"
                ? this.canvasKit.FillType.EvenOdd
                : this.canvasKit.FillType.Winding);
        }
        if (this.pathCache.size >= PATH_CACHE_LIMIT) {
            const oldest = this.pathCache.keys().next().value;
            if (oldest !== undefined) {
                this.pathCache.get(oldest)?.delete();
                this.pathCache.delete(oldest);
            }
        }
        this.pathCache.set(key, parsed);
        return parsed;
    }
    /** Draws with a cached path, leaving it in the cache afterwards. */
    withCachedPath(pathData, draw, fillRule) {
        const path = this.cachedPath(pathData, fillRule);
        if (path)
            draw(path);
    }
    releaseGridTile() {
        if (!this.gridTile)
            return;
        this.gridTile.shader.delete();
        this.gridTile.image.delete();
        this.gridTile = null;
    }
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
    gridDotShader(step, zoom, devicePixelRatio, dotRadius, color, alpha) {
        const canvasKit = this.canvasKit;
        const repeat = canvasKit.TileMode.Repeat;
        const filter = canvasKit.FilterMode?.Linear;
        const mipmap = canvasKit.MipmapMode?.None;
        if (!repeat || !filter || !mipmap)
            return null;
        const tilePixels = Math.round(step * zoom * devicePixelRatio);
        // Too small and the dot has no room; too large and the texture is a worse
        // deal than drawing the points.
        if (tilePixels < 4 || tilePixels > 512)
            return null;
        const radiusPixels = dotRadius * zoom * devicePixelRatio;
        const key = `${tilePixels}:${radiusPixels.toFixed(3)}:${alpha.toFixed(3)}`;
        if (this.gridTile?.key === key)
            return this.gridTile.shader;
        this.releaseGridTile();
        const surface = canvasKit.MakeSurface(tilePixels, tilePixels);
        if (!surface)
            return null;
        const paint = new canvasKit.Paint();
        try {
            const tileCanvas = surface.getCanvas();
            tileCanvas.clear(canvasKit.parseColorString("#00000000"));
            paint.setAntiAlias(true);
            paint.setStyle(canvasKit.PaintStyle.Fill);
            paint.setColor(color);
            paint.setAlphaf(alpha);
            // Centred in the cell, so the dot never straddles the tile seam.
            tileCanvas.drawCircle(tilePixels / 2, tilePixels / 2, radiusPixels, paint);
            const image = surface.makeImageSnapshot();
            const scale = step / tilePixels;
            const shader = image.makeShaderOptions?.(repeat, repeat, filter, mipmap, [
                scale,
                0,
                -step / 2,
                0,
                scale,
                -step / 2,
                0,
                0,
                1,
            ]);
            if (!shader) {
                image.delete();
                return null;
            }
            this.gridTile = { key, image, shader };
            return shader;
        }
        finally {
            paint.delete();
            surface.delete();
        }
    }
    /**
     * The grid lattice as a flat x/y buffer for a single batched `drawPoints`.
     *
     * `exclude` drops the dots inside a circle so the caller can paint those
     * few individually without giving up the batch for the rest of the screen.
     * Returns null when the lattice is too large to be worth batching.
     */
    gridPointBuffer(startX, startY, right, bottom, step, exclude) {
        const columns = Math.floor((right - startX) / step) + 1;
        const rows = Math.floor((bottom - startY) / step) + 1;
        if (columns <= 0 || rows <= 0)
            return null;
        const count = columns * rows;
        if (count > GRID_POINT_LIMIT)
            return null;
        const needed = count * 2;
        if (!this.gridPoints || this.gridPoints.length < needed) {
            this.gridPoints = new Float32Array(needed);
        }
        const buffer = this.gridPoints;
        const excludeSquared = exclude ? exclude.radius * exclude.radius : 0;
        let index = 0;
        for (let column = 0; column < columns; column++) {
            const x = startX + column * step;
            for (let row = 0; row < rows; row++) {
                const y = startY + row * step;
                if (exclude) {
                    const dx = x - exclude.x;
                    const dy = y - exclude.y;
                    if (dx * dx + dy * dy < excludeSquared)
                        continue;
                }
                buffer[index++] = x;
                buffer[index++] = y;
            }
        }
        return index === buffer.length ? buffer : buffer.subarray(0, index);
    }
    withPath(path, draw) {
        try {
            draw(path);
        }
        finally {
            path.delete();
        }
    }
    /**
     * The dot grid without a tiled shader, for CanvasKit builds that cannot
     * provide one. Batches into a single `drawPoints` where available and only
     * falls back to a call per dot as a last resort.
     */
    drawGridDotsWithoutTile(canvas, grid) {
        const { startX, startY, worldRight, worldBottom, step, glow } = grid;
        this.fillPaint.setColor(grid.baseColor);
        this.fillPaint.setAlphaf(0.2);
        const points = this.gridPointBuffer(startX, startY, worldRight, worldBottom, step, glow);
        if (points && canvas.drawPoints && this.canvasKit.PointMode) {
            this.fillPaint.setStyle(this.canvasKit.PaintStyle.Stroke);
            this.fillPaint.setStrokeWidth(grid.baseRadius * 2);
            this.fillPaint.setStrokeCap(this.canvasKit.StrokeCap.Round);
            canvas.drawPoints(this.canvasKit.PointMode.Points, points, this.fillPaint);
            this.fillPaint.setStyle(this.canvasKit.PaintStyle.Fill);
            return;
        }
        const glowSquared = glow ? glow.radius * glow.radius : 0;
        for (let x = startX; x <= worldRight; x += step) {
            for (let y = startY; y <= worldBottom; y += step) {
                if (glow) {
                    const dx = x - glow.x;
                    const dy = y - glow.y;
                    if (dx * dx + dy * dy < glowSquared)
                        continue;
                }
                canvas.drawCircle(x, y, grid.baseRadius, this.fillPaint);
            }
        }
    }
    drawCanvasBackground(canvas, viewport, mode, pointerPos) {
        if (mode === "none")
            return;
        const step = 24; // Grid spacing in world units
        const worldLeft = -viewport.x / viewport.zoom;
        const worldTop = -viewport.y / viewport.zoom;
        const worldRight = worldLeft + viewport.width / viewport.zoom;
        const worldBottom = worldTop + viewport.height / viewport.zoom;
        const startX = Math.floor(worldLeft / step) * step;
        const startY = Math.floor(worldTop / step) * step;
        // High zoom pixel grid (Figma parity): when zoomed in to 400% (4.0) or higher,
        // draw subtle 1px pixel grid lines so individual pixel boundaries are crisp.
        if (viewport.zoom >= 4.0) {
            const pixelStep = 1;
            const pStartX = Math.floor(worldLeft);
            const pStartY = Math.floor(worldTop);
            this.configurePaint(this.strokePaint, "#000000", Math.min(0.12, (viewport.zoom - 3.5) * 0.04), // Soft fade-in between 400% and 800%
            true, 1 / viewport.zoom);
            for (let x = pStartX; x <= worldRight; x += pixelStep) {
                const path = new this.canvasKit.PathBuilder();
                path.moveTo(x, worldTop).lineTo(x, worldBottom);
                const built = path.detach();
                path.delete();
                canvas.drawPath(built, this.strokePaint);
                built.delete();
            }
            for (let y = pStartY; y <= worldBottom; y += pixelStep) {
                const path = new this.canvasKit.PathBuilder();
                path.moveTo(worldLeft, y).lineTo(worldRight, y);
                const built = path.detach();
                path.delete();
                canvas.drawPath(built, this.strokePaint);
                built.delete();
            }
        }
        if (mode === "lines") {
            this.configurePaint(this.strokePaint, "#000000", 0.06, true, 1 / viewport.zoom);
            for (let x = startX; x <= worldRight; x += step) {
                const path = new this.canvasKit.PathBuilder();
                path.moveTo(x, worldTop).lineTo(x, worldBottom);
                const built = path.detach();
                path.delete();
                canvas.drawPath(built, this.strokePaint);
                built.delete();
            }
            for (let y = startY; y <= worldBottom; y += step) {
                const path = new this.canvasKit.PathBuilder();
                path.moveTo(worldLeft, y).lineTo(worldRight, y);
                const built = path.detach();
                path.delete();
                canvas.drawPath(built, this.strokePaint);
                built.delete();
            }
            return;
        }
        // Hide background dots when zoomed out < 30% (0.3) for performance,
        // or when zoomed in > 150% (1.5) so dots don't distract during close-up editing.
        if (viewport.zoom < 0.3 || viewport.zoom > 1.5) {
            return;
        }
        // Google Stitch style dot grid with interactive mouse-proximity glow.
        // When zoomed out < 50% (0.5), disable the per-dot proximity math and
        // render standard static dots for max performance and zero lag.
        const enableGlow = viewport.zoom >= 0.5 && Boolean(pointerPos);
        const baseRadius = 0.8 / Math.max(0.5, Math.min(2, viewport.zoom));
        const glowRadiusMax = 200 / viewport.zoom; // Radius of mouse influence in world coordinates
        this.fillPaint.setAntiAlias(true);
        this.fillPaint.setStyle(this.canvasKit.PaintStyle.Fill);
        const baseColor = this.canvasKit.parseColorString("#71717A"); // zinc-500
        const greenColor = this.canvasKit.parseColorString("#7FFF7F"); // Voo brand green center
        const purpleColor = this.canvasKit.parseColorString("#8B5CF6"); // Voo violet/purple outer glow
        // Only the dots under the cursor's glow disc need individual colours and
        // radii. Everything else is one flat colour, so it goes out as a single
        // batch: one `drawCircle` per dot meant ~16k dots x 3 calls into WASM on a
        // wide viewport at mid zoom, which cost more than the entire scene and was
        // why panning stuttered even over empty canvas. A round stroke cap turns
        // the batch into dots in a single call.
        const glow = enableGlow && pointerPos
            ? { x: pointerPos.x, y: pointerPos.y, radius: glowRadiusMax }
            : null;
        const tileShader = this.gridDotShader(step, viewport.zoom, viewport.devicePixelRatio, baseRadius, baseColor, 0.2);
        const tiled = Boolean(tileShader);
        if (tileShader) {
            this.fillPaint.setShader(tileShader);
            this.fillPaint.setAlphaf(1);
            this.fillPaint.setAntiAlias(false);
            this.fillPaint.setStyle(this.canvasKit.PaintStyle.Fill);
            if (glow) {
                // Leave the square around the cursor bare and fill around it with
                // four plain rectangles. Clipping the square out instead makes the
                // clip region non-rectangular, which cost 300ms a frame; the dots
                // inside the square are painted individually below.
                const left = Math.max(worldLeft, glow.x - glow.radius);
                const top = Math.max(worldTop, glow.y - glow.radius);
                const right = Math.min(worldRight, glow.x + glow.radius);
                const bottom = Math.min(worldBottom, glow.y + glow.radius);
                for (const band of [
                    [worldLeft, worldTop, worldRight, top],
                    [worldLeft, bottom, worldRight, worldBottom],
                    [worldLeft, top, left, bottom],
                    [right, top, worldRight, bottom],
                ]) {
                    if (band[2] > band[0] && band[3] > band[1]) {
                        canvas.drawRect(band, this.fillPaint);
                    }
                }
            }
            else {
                canvas.drawRect([worldLeft, worldTop, worldRight, worldBottom], this.fillPaint);
            }
            this.fillPaint.setShader(null);
            this.fillPaint.setAntiAlias(true);
        }
        else {
            this.drawGridDotsWithoutTile(canvas, {
                startX,
                startY,
                worldRight,
                worldBottom,
                step,
                baseRadius,
                baseColor,
                glow,
            });
        }
        if (!glow)
            return;
        // Walk only the lattice cells the glow square covers, keeping the same
        // lattice alignment the fill above used.
        const glowLeft = Math.max(startX, Math.floor((glow.x - glow.radius) / step) * step);
        const glowTop = Math.max(startY, Math.floor((glow.y - glow.radius) / step) * step);
        const glowRight = Math.min(worldRight, glow.x + glow.radius);
        const glowBottom = Math.min(worldBottom, glow.y + glow.radius);
        this.fillPaint.setStyle(this.canvasKit.PaintStyle.Fill);
        for (let x = glowLeft; x <= glowRight; x += step) {
            for (let y = glowTop; y <= glowBottom; y += step) {
                const dist = Math.hypot(x - glow.x, y - glow.y);
                if (dist >= glow.radius) {
                    // Inside the punched-out square but beyond the glow: an ordinary
                    // dot the tiled fill did not get to paint.
                    if (tiled) {
                        this.fillPaint.setColor(baseColor);
                        this.fillPaint.setAlphaf(0.2);
                        canvas.drawCircle(x, y, baseRadius, this.fillPaint);
                    }
                    continue;
                }
                // Mouse proximity glow effect with green-to-purple gradient transition
                const factor = Math.pow(1 - dist / glow.radius, 2); // Ease-out curve
                const radius = baseRadius * (1 + factor * 1.5);
                const alpha = 0.2 + factor * 0.75;
                if (factor > 0.4) {
                    // Core mouse zone: Voo green center
                    this.fillPaint.setColor(greenColor);
                }
                else if (factor > 0.12) {
                    // Outer proximity ring: Voo purple gradient transition
                    this.fillPaint.setColor(purpleColor);
                }
                else {
                    // Far boundary: zinc base
                    this.fillPaint.setColor(baseColor);
                }
                this.fillPaint.setAlphaf(Math.min(1, alpha));
                canvas.drawCircle(x, y, radius, this.fillPaint);
            }
        }
    }
}
//# sourceMappingURL=skia-scene-painter.js.map