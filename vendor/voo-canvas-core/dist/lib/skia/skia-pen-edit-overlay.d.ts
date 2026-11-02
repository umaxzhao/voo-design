import { type PenAnchor } from "../pen-path.js";
import type { ScenePoint, SceneViewport } from "./scene-types.js";
export interface SkiaPenEditAnchor extends PenAnchor {
    handlesVisible: boolean;
    selected: boolean;
    endpoint: boolean;
}
export interface SkiaPenEditOverlayState {
    nodeId: string;
    anchors: readonly SkiaPenEditAnchor[];
    closed: boolean;
    insertPreview: ScenePoint | null;
}
export type SkiaPenEditHit = {
    kind: "anchor";
    anchorIndex: number;
} | {
    kind: "handle";
    anchorIndex: number;
    handleType: "in" | "out";
} | {
    kind: "path";
    fromIndex: number;
    toIndex: number;
    t: number;
    point: ScenePoint;
};
export declare function hitTestSkiaPenEditOverlay(overlay: SkiaPenEditOverlayState | null, point: ScenePoint, viewport: SceneViewport): SkiaPenEditHit | null;
//# sourceMappingURL=skia-pen-edit-overlay.d.ts.map