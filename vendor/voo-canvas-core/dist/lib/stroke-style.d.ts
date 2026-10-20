/**
 * A style bag, declared here rather than imported from React.
 *
 * The one caller casts into it for convenience; taking a dependency on React's
 * types for that would put a UI framework in a renderer that draws to a canvas.
 * React's own CSSProperties satisfies this structurally at the call site.
 */
type CSSProperties = Record<string, string | number | undefined>;
export type StrokeStyle = "solid" | "dashed" | "dotted" | "custom";
export type StrokeAlign = "inside" | "center" | "outside";
export interface StrokeBoxInput {
    strokeWidth?: number;
    strokeWidthTop?: number;
    strokeWidthRight?: number;
    strokeWidthBottom?: number;
    strokeWidthLeft?: number;
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: StrokeStyle;
    strokeDashLength?: number;
    strokeDashGap?: number;
    strokeDashPattern?: number[];
    strokeLineCap?: "butt" | "round" | "square";
    strokeLineJoin?: "miter" | "round" | "bevel";
    strokeMiterLimit?: number;
    strokeAlign?: StrokeAlign;
    strokeVisible?: boolean;
    strokeTopEnabled?: boolean;
    strokeRightEnabled?: boolean;
    strokeBottomEnabled?: boolean;
    strokeLeftEnabled?: boolean;
}
export type StrokeWidthPatch = Pick<StrokeBoxInput, "strokeWidth" | "strokeWidthTop" | "strokeWidthRight" | "strokeWidthBottom" | "strokeWidthLeft">;
export interface StrokeEdgeWidths {
    top: number;
    right: number;
    bottom: number;
    left: number;
}
export declare function hasIndependentStrokeWidths(input: StrokeBoxInput): boolean;
/** True when CSS border/outline cannot faithfully paint Inspector settings. */
export declare function requiresSvgStroke(input: StrokeBoxInput): boolean;
export declare function getStrokeEdgeWidths(input: StrokeBoxInput): StrokeEdgeWidths;
export declare function hasVisibleStroke(input: StrokeBoxInput): boolean;
export declare function getStrokeWidthPatch(enabled: boolean): StrokeWidthPatch;
export declare function getUniformStrokeWidthPatch(width: number): StrokeWidthPatch;
export declare function strokeDashArray(style: StrokeStyle | undefined, width: number, dashLength?: number, dashGap?: number, dashPattern?: readonly number[]): string | undefined;
export declare function miterAngleFromLimit(limit?: number): number;
export declare function miterLimitFromAngle(angle: number): number;
export interface StrokeBoxOptions {
    defaultWidth?: number;
    defaultColor?: string;
    extraBoxShadow?: string | null;
}
export interface StrokeBoxStyle {
    borderWidth?: string;
    borderTopWidth?: string;
    borderRightWidth?: string;
    borderBottomWidth?: string;
    borderLeftWidth?: string;
    borderColor?: string;
    borderStyle?: StrokeStyle | "none";
    outlineWidth?: string;
    outlineColor?: string;
    outlineStyle?: StrokeStyle;
    outlineOffset?: string;
    boxShadow?: string;
}
export declare const getStrokeBoxStyle: (input: StrokeBoxInput, opts?: StrokeBoxOptions) => StrokeBoxStyle;
export declare const strokeBoxCss: (input: StrokeBoxInput, opts?: StrokeBoxOptions) => CSSProperties;
export {};
//# sourceMappingURL=stroke-style.d.ts.map