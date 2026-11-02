import { type MeasureRect } from "./measure-distance.js";
import type { SceneViewport } from "./scene-types.js";
export interface SkiaMeasureOverlayState {
    source: MeasureRect;
    target: MeasureRect;
}
export interface SkiaMeasureSegment {
    id: string;
    value: number;
    horizontal: boolean;
    left: number;
    top: number;
    length: number;
}
export declare function buildSkiaMeasureSegments(overlay: SkiaMeasureOverlayState, viewport: SceneViewport): readonly SkiaMeasureSegment[];
//# sourceMappingURL=skia-measure-overlay.d.ts.map