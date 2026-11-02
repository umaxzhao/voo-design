/** Geometry extracted from CanvasKit Paragraph glyph APIs. Coordinates are node-local. */
export interface SkiaTextRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}
export interface SkiaTextGlyphLayout {
    textLength: number;
    glyphRects: readonly (SkiaTextRect | null)[];
    caretRects: readonly (SkiaTextRect | null)[];
}
export declare function getTextIndexAtLayoutPoint(layout: SkiaTextGlyphLayout, localX: number, localY: number): number;
export declare function getSelectionBoundingRectsFromLayout(layout: SkiaTextGlyphLayout, start: number, end: number): SkiaTextRect[];
export declare function moveCaretVerticallyFromLayout(layout: SkiaTextGlyphLayout, index: number, direction: "up" | "down"): number;
export declare function moveCaretToLineBoundaryFromLayout(layout: SkiaTextGlyphLayout, index: number, direction: "home" | "end"): number;
export declare function getTextIndexAtPointMultiline(text: string, fontSize: number, localX: number, localY: number, lineHeightMultiplier?: number): number;
export declare function getSelectionBoundingRectsMultiline(text: string, fontSize: number, start: number, end: number, lineHeightMultiplier?: number): {
    x: number;
    y: number;
    width: number;
    height: number;
}[];
//# sourceMappingURL=skia-text-hit-test.d.ts.map