import type { SceneBounds, ScenePoint, SceneViewport } from "./scene-types.js";
export type SkiaVariantStripAction = "select" | "remove" | "pin";
export interface SkiaVariantStripHit {
    action: SkiaVariantStripAction;
    index: number;
}
export interface SkiaVariantStripState {
    nodeId: string;
    anchorBounds: SceneBounds;
    urls: readonly string[];
    activeUrl?: string;
    mediaType: "image" | "video";
    hover: SkiaVariantStripHit | null;
}
export interface SkiaVariantThumbLayout {
    index: number;
    left: number;
    top: number;
    size: number;
}
export interface SkiaVariantStripLayout {
    left: number;
    top: number;
    width: number;
    height: number;
    thumbs: readonly SkiaVariantThumbLayout[];
}
export declare function layoutSkiaVariantStrip(strip: SkiaVariantStripState, viewport: SceneViewport): SkiaVariantStripLayout;
export declare function hitTestSkiaVariantStrip(strip: SkiaVariantStripState, viewport: SceneViewport, point: ScenePoint): SkiaVariantStripHit | null;
//# sourceMappingURL=skia-variant-strip.d.ts.map