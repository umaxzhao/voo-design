export interface ScenePoint {
    x: number;
    y: number;
}
export interface SceneBounds extends ScenePoint {
    width: number;
    height: number;
}
export interface SceneViewport {
    x: number;
    y: number;
    zoom: number;
    width: number;
    height: number;
    devicePixelRatio: number;
}
export interface SceneFill {
    id?: string;
    color: string;
    opacity: number;
    gradient?: SceneGradient;
    imageUrl?: string;
    imageFit?: import("./image-layout.js").SceneImageFit;
    imagePosition?: import("./image-layout.js").SceneImagePosition;
    imageAdjustments?: import("../paint-layers.js").ImageAdjustments;
}
export interface SceneGradient {
    type: "linear" | "radial" | "angular" | "diamond";
    angle: number;
    centerX: number;
    centerY: number;
    width: number;
    height: number;
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    stops: readonly {
        color: string;
        opacity: number;
        position: number;
    }[];
}
export interface SceneStroke {
    color: string;
    opacity: number;
    gradient?: SceneGradient;
    imageUrl?: string;
    imageFit?: import("./image-layout.js").SceneImageFit;
    imagePosition?: import("./image-layout.js").SceneImagePosition;
    imageAdjustments?: import("../paint-layers.js").ImageAdjustments;
    width: number;
    align?: "inside" | "center" | "outside";
    sideWidths?: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    dash?: readonly number[];
    lineCap?: "butt" | "round" | "square";
    lineJoin?: "miter" | "round" | "bevel";
    miterLimit?: number;
}
export interface SceneShadow {
    id: string;
    color: string;
    offsetX: number;
    offsetY: number;
    blur: number;
    spread: number;
    inset: boolean;
    showBehindTransparent: boolean;
    blendMode?: import("../external-types.js").EffectBlendMode;
}
export interface SceneDepth {
    color: string;
    distance: number;
    angle: number;
}
export interface SceneCornerRadii {
    topLeft: number;
    topRight: number;
    bottomRight: number;
    bottomLeft: number;
}
export interface SceneElementBase {
    id: string;
    parentId: string | null;
    designSemantics?: import("../design-layout-semantics.js").DesignLayoutSemantics;
    layoutIntent?: import("../design-layout-semantics.js").DesignLayoutIntent;
    bounds: SceneBounds;
    visible: boolean;
    opacity: number;
    rotation: number;
    flipX: boolean;
    flipY: boolean;
    zIndex: number;
    locked?: boolean;
    readOnly?: boolean;
    isComponent?: boolean;
    isMainComponent?: boolean;
    componentId?: string;
    isMask?: boolean;
    maskId?: string | null;
    /**
     * How the element referenced by `maskId` is applied to this element.
     *
     * - `"geometry"` (default): a vector clip to the mask element's shape/bounds
     *   — the historical behaviour, used by `clipTo`-style clipping-mask chains
     *   and by container/frame clipping.
     * - `"alpha"`: a per-pixel alpha matte — the mask element's image alpha is
     *   multiplied into this element (a soft, feathered cutout), rather than a
     *   hard geometric clip. The mask element must carry an `imageUrl` (its
     *   bitmap is the matte); the renderer applies it as a `DstIn` composite.
     *
     * Defaults to `"geometry"` when absent, so existing scenes are unchanged.
     */
    maskType?: "alpha" | "geometry";
    blendMode?: import("../external-types.js").BlendMode;
    fill?: SceneFill;
    fills?: readonly SceneFill[];
    stroke?: SceneStroke;
    strokes?: readonly SceneStroke[];
    shadows?: readonly SceneShadow[];
    depth?: SceneDepth;
    layerBlur?: number;
    backgroundBlur?: number;
    noise?: boolean;
    noiseLayers?: number;
    noiseEffectKeys?: readonly string[];
    noiseModes?: readonly ("single" | "dual" | "multicolor")[];
    noiseSizes?: readonly number[];
    noiseDensities?: readonly number[];
    noiseColors?: readonly string[];
    noiseSecondaryColors?: readonly string[];
    noiseOpacities?: readonly number[];
    noiseBlendModes?: readonly import("../external-types.js").EffectBlendMode[];
    effectOrder?: readonly string[];
    cornerRadius?: number;
    cornerRadii?: SceneCornerRadii;
}
export interface SceneFrame extends SceneElementBase {
    kind: "frame";
    title: string;
    clipContent: boolean;
    imageUrl?: string;
    imageFit?: import("./image-layout.js").SceneImageFit;
    imagePosition?: import("./image-layout.js").SceneImagePosition;
    imageCropScale?: number;
    imageCropOffsetX?: number;
    imageCropOffsetY?: number;
    imageCropRotation?: number;
    imageAdjustments?: import("../paint-layers.js").ImageAdjustments;
    /** Versioned, non-destructive Pixel-mode instructions for this image. */
    rasterDocument?: import("../raster/raster-document.js").RasterDocument;
    isAiNode?: boolean;
}
export type SceneNodeShape = "rect" | "ellipse" | "triangle" | "polygon" | "line" | "arrow" | "path" | "text" | "image" | "video" | "button" | "card" | "boolean";
export interface SceneNode extends SceneElementBase {
    kind: "node";
    nodeType: string;
    shape: SceneNodeShape;
    title: string;
    /** Whether this node clips its descendants like an imported nested Frame. */
    clipContent?: boolean;
    text?: string;
    textColor?: string;
    textOpacity?: number;
    textVisible?: boolean;
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    maxLines?: number;
    ellipsis?: string;
    /**
     * The text box hugs its content on the horizontal axis (Figma auto-width),
     * so the painter must lay the paragraph out unbounded instead of wrapping
     * at `bounds.width`. Auto-width text never wraps by definition — its width
     * *is* whatever the glyphs measure. Wrapping it re-flows the moment our
     * substituted font is even slightly wider than the one the box was sized
     * against, which is what shredded short imported labels ("VS" → "V"/"S").
     */
    textAutoWidth?: boolean;
    lineHeight?: number;
    letterSpacing?: number;
    paragraphSpacing?: number;
    textAlign?: "left" | "center" | "right" | "justify";
    textAlignVertical?: "top" | "middle" | "bottom";
    textDirection?: "ltr" | "rtl";
    imageUrl?: string;
    imageUrls?: readonly string[];
    videoUrl?: string;
    /**
     * Resolved upstream "before" image for the compare slider. Presence means
     * the slider is active: the painter draws the before image full-bleed and
     * clips this node's own (after) image to the right of the divider.
     */
    compareBeforeUrl?: string;
    /** Compare divider position, 0..100 across the node's width. Default 50. */
    comparePercent?: number;
    imageFit?: import("./image-layout.js").SceneImageFit;
    imagePosition?: import("./image-layout.js").SceneImagePosition;
    imageCropScale?: number;
    imageCropOffsetX?: number;
    imageCropOffsetY?: number;
    imageCropRotation?: number;
    imageAdjustments?: import("../paint-layers.js").ImageAdjustments;
    /** Versioned, non-destructive Pixel-mode instructions for this image. */
    rasterDocument?: import("../raster/raster-document.js").RasterDocument;
    videoFit?: "cover" | "contain" | "fill";
    polygonSides?: number;
    booleanOperation?: import("../boolean-ops.js").BooleanOperation;
    booleanSources?: readonly import("../boolean-ops.js").BooleanSource[];
    ellipseInnerRadius?: number;
    ellipseStartAngle?: number;
    ellipseSweep?: number;
    fillRule?: "nonzero" | "evenodd";
    pathData?: string;
    /** Editable local Bézier anchors, used for accurate pen-path hit testing. */
    pathAnchors?: readonly import("../pen-path.js").PenAnchor[];
    pathClosed?: boolean;
    strokeStartArrow?: import("../external-types.js").StrokeArrowhead;
    strokeEndArrow?: import("../external-types.js").StrokeArrowhead;
    subtitle?: string;
    metadata?: readonly string[];
    status?: "PENDING" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELED";
    model?: string;
    ratio?: string;
    resolution?: string;
    /**
     * True when the client can already tell a run would fail (no model picked,
     * or no configured provider serves it — see lib/ai-node-preflight.ts). The
     * footer paints the Run button muted so the card says so before the click.
     * Undefined means "not evaluated / unknown", which paints normally.
     */
    runBlocked?: boolean;
}
export interface SceneConnection {
    id: string;
    kind: "connection";
    sourceId: string;
    targetId: string;
    start: ScenePoint;
    end: ScenePoint;
    controlStart: ScenePoint;
    controlEnd: ScenePoint;
    bounds: SceneBounds;
    visible: boolean;
    opacity: number;
    zIndex: number;
    stroke: SceneStroke;
}
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export interface SceneOverlay extends SceneElementBase {
    kind: "overlay";
    overlayType: "selection" | "resize-handle" | "linear-selection" | "linear-resize-handle" | "path-selection" | "port" | "marquee" | "snap-guide" | "ellipse-arc-start" | "ellipse-arc-sweep" | "ellipse-arc-ratio";
    targetId: string;
    handle?: ResizeHandle;
    linearHandle?: "start" | "end";
    portDirection?: "in" | "out";
    isConnected?: boolean;
    pathData?: string;
    componentBadge?: "main" | "instance";
}
export type SceneElement = SceneFrame | SceneNode | SceneConnection | SceneOverlay;
export interface SceneSnapshot {
    revision: number;
    backgroundColor: string;
    gridMode?: "dots" | "lines" | "none";
    selectedIds?: ReadonlySet<string>;
    elements: readonly SceneElement[];
}
export interface SceneHit {
    element: SceneElement;
    worldPoint: ScenePoint;
}
export type SkiaBackend = "webgpu" | "webgl" | "software";
export type RasterExportFormat = "png" | "jpeg" | "webp";
export interface SceneExportOptions {
    format: RasterExportFormat | "pdf";
    bounds: SceneBounds;
    scale?: number;
    quality?: number;
    backgroundColor?: string;
    timeoutMs?: number;
}
//# sourceMappingURL=scene-types.d.ts.map