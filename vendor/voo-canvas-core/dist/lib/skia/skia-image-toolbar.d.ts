import type { SceneBounds, ScenePoint, SceneViewport } from "./scene-types.js";
export declare const SKIA_IMAGE_TOOLBAR_HEIGHT = 36;
export declare const SKIA_IMAGE_TOOLBAR_ITEM_WIDTH = 40;
export interface SkiaImageToolbarItem {
    id: string;
    glyph: string;
    label: string;
    disabled?: boolean;
    tone?: "default" | "danger" | "active";
}
export interface SkiaImageToolbarState {
    nodeId: string;
    anchorBounds: SceneBounds;
    highlightedIndex: number;
    items: readonly SkiaImageToolbarItem[];
}
export interface SkiaImageToolbarLayout {
    left: number;
    top: number;
    width: number;
    height: number;
}
export declare function layoutSkiaImageToolbar(toolbar: SkiaImageToolbarState, viewport: SceneViewport): SkiaImageToolbarLayout;
export declare function hitTestSkiaImageToolbar(toolbar: SkiaImageToolbarState, viewport: SceneViewport, point: ScenePoint): SkiaImageToolbarItem | null;
//# sourceMappingURL=skia-image-toolbar.d.ts.map