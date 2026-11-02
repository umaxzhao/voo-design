export interface ImagePlaceholderLayout {
    background: [number, number, number, number];
    icon: {
        x: number;
        y: number;
        width: number;
        height: number;
        radius: number;
        strokeWidth: number;
    };
}
/**
 * Keeps the empty-image glyph centered and inside the object at every size.
 * The painter owns colors; this helper owns only deterministic geometry.
 */
export declare function layoutImagePlaceholder(bounds: {
    width: number;
    height: number;
}): ImagePlaceholderLayout;
//# sourceMappingURL=image-placeholder.d.ts.map