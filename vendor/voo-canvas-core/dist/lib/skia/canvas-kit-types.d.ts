export interface SkiaObject {
    delete(): void;
}
export type SkiaColor = unknown;
export type SkiaEnumValue = unknown;
export type SkiaRect = number[];
export type SkiaImageFilter = SkiaObject;
export type SkiaColorFilter = SkiaObject;
export type SkiaMaskFilter = SkiaObject;
export type SkiaShader = SkiaObject;
export type SkiaBlender = SkiaObject;
export interface SkiaRuntimeEffect extends SkiaObject {
    makeBlender(uniforms: Float32Array | number[]): SkiaBlender;
}
export interface SkiaPaint extends SkiaObject {
    setAntiAlias(value: boolean): void;
    setAlphaf(value: number): void;
    setColor(value: SkiaColor): void;
    setBlendMode(value: SkiaEnumValue): void;
    setBlender?(blender: SkiaBlender): void;
    setStyle(value: SkiaEnumValue): void;
    setStrokeWidth(value: number): void;
    setPathEffect(effect: SkiaPathEffect | null): void;
    setStrokeCap(value: SkiaEnumValue): void;
    setStrokeJoin(value: SkiaEnumValue): void;
    setStrokeMiter(value: number): void;
    setImageFilter(filter: SkiaImageFilter | null): void;
    setColorFilter?(filter: SkiaColorFilter | null): void;
    setMaskFilter(filter: SkiaMaskFilter | null): void;
    setShader(shader: SkiaShader | null): void;
}
export interface SkiaPath extends SkiaObject {
    computeTightBounds(outputArray?: SkiaRect): SkiaRect;
    makeCombined(other: SkiaPath, operation: SkiaEnumValue): SkiaPath | null;
    makeDashed(on: number, off: number, phase: number): SkiaPath | null;
    makeSimplified(): SkiaPath | null;
    makeStroked(options?: {
        width?: number;
        miter_limit?: number;
        precision?: number;
        join?: SkiaEnumValue;
        cap?: SkiaEnumValue;
    }): SkiaPath | null;
    setFillType?(fillType: SkiaEnumValue): void;
    toSVGString(): string;
}
export type SkiaPathEffect = SkiaObject;
export interface SkiaPathBuilder extends SkiaObject {
    addPath(path: SkiaPath, matrix?: readonly number[]): SkiaPathBuilder | null;
    close(): SkiaPathBuilder;
    cubicTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): SkiaPathBuilder;
    detach(): SkiaPath;
    lineTo(x: number, y: number): SkiaPathBuilder;
    moveTo(x: number, y: number): SkiaPathBuilder;
}
export interface SkiaImage extends SkiaObject {
    encodeToBytes(format?: SkiaEnumValue, quality?: number): Uint8Array | null;
    height(): number;
    width(): number;
    makeShaderOptions?(tileX: SkiaEnumValue, tileY: SkiaEnumValue, filterMode: SkiaEnumValue, mipmapMode: SkiaEnumValue, localMatrix?: number[]): SkiaShader;
}
export interface SkiaParagraph extends SkiaObject {
    didExceedMaxLines(): boolean;
    getHeight(): number;
    getLongestLine(): number;
    getNumberOfLines(): number;
    layout(width: number): void;
    getGlyphPositionAtCoordinate(dx: number, dy: number): {
        pos: number;
    };
    getLineMetrics(): Array<{
        top: number;
        height: number;
    }>;
    getRectsForRange(start: number, end: number, heightStyle: SkiaEnumValue, widthStyle: SkiaEnumValue): Array<{
        rect: Float32Array | number[];
    }>;
    unresolvedCodepoints(): number[];
}
export interface SkiaParagraphBuilder extends SkiaObject {
    addText(text: string): void;
    build(): SkiaParagraph;
}
export interface SkiaFontProvider extends SkiaObject {
    registerFont(bytes: ArrayBuffer | Uint8Array, family: string): void;
}
export interface SkiaCanvas {
    clear(color: SkiaColor): void;
    clipPath(path: SkiaPath, operation: SkiaEnumValue, antiAlias: boolean): void;
    clipRect(rect: SkiaRect, operation: SkiaEnumValue, antiAlias: boolean): void;
    clipRRect(rect: SkiaRect, operation: SkiaEnumValue, antiAlias: boolean): void;
    drawCircle(x: number, y: number, radius: number, paint: SkiaPaint): void;
    /** Batched point draw — one call for a whole flattened [x, y, …] array. */
    drawPoints?(mode: SkiaEnumValue, points: Float32Array, paint: SkiaPaint): void;
    drawImageRect(image: SkiaImage, source: SkiaRect, destination: SkiaRect, paint: SkiaPaint, fastSample: boolean): void;
    drawOval(rect: SkiaRect, paint: SkiaPaint): void;
    drawParagraph(paragraph: SkiaParagraph, x: number, y: number): void;
    drawPath(path: SkiaPath, paint: SkiaPaint): void;
    drawRect(rect: SkiaRect, paint: SkiaPaint): void;
    drawRRect(rect: SkiaRect, paint: SkiaPaint): void;
    restore(): void;
    rotate(degrees: number, x: number, y: number): void;
    save(): number;
    saveLayer(paint?: SkiaPaint, bounds?: SkiaRect | null, backdrop?: SkiaImageFilter | null): number;
    scale(x: number, y: number): void;
    translate(x: number, y: number): void;
}
export interface SkiaSurface extends SkiaObject {
    flush(): void;
    getCanvas(): SkiaCanvas;
    makeImageSnapshot(bounds?: number[]): SkiaImage;
}
export type SkiaGpuContext = SkiaObject;
export interface SkiaGpuCanvasContext {
    readonly __skiaGpuCanvasContext?: never;
}
export interface CanvasKitApi {
    BlendMode: Record<"Clear" | "Color" | "ColorBurn" | "ColorDodge" | "Darken" | "Difference" | "DstIn" | "Exclusion" | "HardLight" | "Hue" | "Lighten" | "Luminosity" | "Modulate" | "Multiply" | "Overlay" | "Saturation" | "Screen" | "SoftLight" | "Plus" | "SrcIn" | "SrcOver", SkiaEnumValue>;
    RuntimeEffect?: {
        MakeForBlender(source: string, callback?: (error: string) => void): SkiaRuntimeEffect | null;
    };
    BlurStyle: {
        Inner: SkiaEnumValue;
        Normal: SkiaEnumValue;
    };
    ClipOp: {
        Difference: SkiaEnumValue;
        Intersect: SkiaEnumValue;
    };
    ColorSpace: {
        SRGB: SkiaEnumValue;
    };
    FontWeight: Record<string, SkiaEnumValue>;
    FontSlant: {
        Italic: SkiaEnumValue;
        Upright: SkiaEnumValue;
    };
    FillType: {
        EvenOdd: SkiaEnumValue;
        Winding: SkiaEnumValue;
    };
    ImageFormat: {
        PNG: SkiaEnumValue;
        JPEG: SkiaEnumValue;
        WEBP: SkiaEnumValue;
    };
    Paint: new () => SkiaPaint;
    PaintStyle: {
        Fill: SkiaEnumValue;
        Stroke: SkiaEnumValue;
    };
    PointMode?: Record<"Points" | "Lines" | "Polygon", SkiaEnumValue>;
    ImageFilter: {
        MakeBlur(sigmaX: number, sigmaY: number, tileMode: SkiaEnumValue, input: SkiaImageFilter | null): SkiaImageFilter;
        MakeDropShadowOnly(offsetX: number, offsetY: number, sigmaX: number, sigmaY: number, color: SkiaColor, input: SkiaImageFilter | null, cropRect?: unknown): SkiaImageFilter;
    };
    ColorFilter?: {
        MakeMatrix(matrix: number[]): SkiaColorFilter;
    };
    MaskFilter: {
        MakeBlur(style: SkiaEnumValue, sigma: number, respectCtm: boolean): SkiaMaskFilter;
    };
    PathEffect: {
        MakeDash(intervals: number[], phase?: number): SkiaPathEffect;
    };
    ParagraphBuilder: {
        MakeFromFontProvider(style: object, provider: SkiaFontProvider): SkiaParagraphBuilder;
    };
    ParagraphStyle: new (style: object) => object;
    Path: {
        MakeFromSVGString(data: string): SkiaPath | null;
        MakeFromOp(one: SkiaPath, two: SkiaPath, operation: SkiaEnumValue): SkiaPath | null;
    };
    PathOp: Record<"Difference" | "Intersect" | "Union" | "XOR", SkiaEnumValue>;
    PathBuilder: new () => SkiaPathBuilder;
    TextAlign: Record<string, SkiaEnumValue>;
    RectHeightStyle: Record<"Tight" | "Max", SkiaEnumValue>;
    RectWidthStyle: Record<"Tight" | "Max", SkiaEnumValue>;
    UnderlineDecoration: number;
    LineThroughDecoration: number;
    TextDirection: {
        LTR: SkiaEnumValue;
        RTL: SkiaEnumValue;
    };
    StrokeCap: Record<"Butt" | "Round" | "Square", SkiaEnumValue>;
    StrokeJoin: Record<"Bevel" | "Miter" | "Round", SkiaEnumValue>;
    TileMode: {
        Clamp: SkiaEnumValue;
        Decal: SkiaEnumValue;
        Repeat?: SkiaEnumValue;
        Mirror?: SkiaEnumValue;
    };
    FilterMode?: {
        Linear: SkiaEnumValue;
        Nearest: SkiaEnumValue;
    };
    MipmapMode?: {
        None: SkiaEnumValue;
        Linear: SkiaEnumValue;
        Nearest: SkiaEnumValue;
    };
    Shader: {
        MakeLinearGradient(start: number[], end: number[], colors: SkiaColor[], positions: number[] | null, tileMode: SkiaEnumValue): SkiaShader;
        MakeRadialGradient(center: number[], radius: number, colors: SkiaColor[], positions: number[] | null, tileMode: SkiaEnumValue): SkiaShader;
        MakeSweepGradient(centerX: number, centerY: number, colors: SkiaColor[], positions: number[] | null, tileMode: SkiaEnumValue, localMatrix?: null, flags?: number, startAngle?: number, endAngle?: number): SkiaShader;
    };
    TextStyle: new (style: object) => object;
    TypefaceFontProvider: {
        Make(): SkiaFontProvider;
    };
    GetWebGLContext(canvas: HTMLCanvasElement, options?: object): number;
    MakeGPUCanvasContext(context: SkiaGpuContext, canvas: HTMLCanvasElement): SkiaGpuCanvasContext | null;
    MakeGPUCanvasSurface(context: SkiaGpuCanvasContext, colorSpace: SkiaEnumValue, width?: number, height?: number): SkiaSurface | null;
    MakeGPUDeviceContext(device: unknown): SkiaGpuContext | null;
    MakeImageFromCanvasImageSource(source: CanvasImageSource): SkiaImage;
    MakeImageFromEncoded(bytes: ArrayBuffer | Uint8Array): SkiaImage | null;
    MakeOnScreenGLSurface(context: SkiaGpuContext, width: number, height: number, colorSpace: SkiaEnumValue): SkiaSurface | null;
    MakeSWCanvasSurface(canvas: HTMLCanvasElement): SkiaSurface | null;
    MakeSurface(width: number, height: number): SkiaSurface | null;
    MakeWebGLContext(handle: number): SkiaGpuContext | null;
    RRectXY(rect: SkiaRect, radiusX: number, radiusY: number): SkiaRect;
    parseColorString(color: string): SkiaColor;
}
export interface CanvasKitInitOptions {
    locateFile?: (fileName: string) => string;
}
export type CanvasKitInitializer = (options?: CanvasKitInitOptions) => Promise<CanvasKitApi>;
//# sourceMappingURL=canvas-kit-types.d.ts.map