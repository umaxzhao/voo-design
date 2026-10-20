import type { PenPoint } from "../pen-path.js";
export interface SkiaPenDrawAnchor extends PenPoint {
    handleIn?: PenPoint;
    handleOut?: PenPoint;
}
export interface SkiaPenDrawOverlayState {
    anchors: readonly SkiaPenDrawAnchor[];
    isSubPathTerminated: boolean;
}
//# sourceMappingURL=skia-pen-draw-overlay.d.ts.map