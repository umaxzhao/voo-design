import type { ScenePoint, SceneViewport } from "./scene-types.js";
export type SkiaGradientHandle = "start" | "center" | "end";
export interface SkiaGradientOverlayState {
    targetId: string;
    start: ScenePoint;
    end: ScenePoint;
    linear: boolean;
    activeHandle: SkiaGradientHandle | null;
    hoveredHandle: SkiaGradientHandle | null;
}
export declare function hitTestSkiaGradientOverlay(overlay: SkiaGradientOverlayState, viewport: SceneViewport, point: ScenePoint): SkiaGradientHandle | null;
//# sourceMappingURL=skia-gradient-overlay.d.ts.map