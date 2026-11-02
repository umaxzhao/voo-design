import type { ScenePoint, SceneViewport } from "./scene-types.js";
export interface SkiaCommentPin {
    id: string;
    x: number;
    y: number;
    label: string;
    draft?: boolean;
}
export interface SkiaCommentPinsState {
    pins: readonly SkiaCommentPin[];
    hoveredId: string | null;
}
export declare function hitTestSkiaCommentPins(state: SkiaCommentPinsState, viewport: SceneViewport, point: ScenePoint): SkiaCommentPin | null;
//# sourceMappingURL=skia-comment-pins.d.ts.map