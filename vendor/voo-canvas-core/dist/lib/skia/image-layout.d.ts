import type { SceneBounds } from "./scene-types.js";
export type SceneImageFit = "cover" | "contain" | "fill" | "none" | "tile";
export type SceneImagePosition = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";
export interface SceneImageLayout {
    source: SceneBounds;
    destination: SceneBounds;
}
export declare function calculateImageLayout(imageWidth: number, imageHeight: number, targetWidth: number, targetHeight: number, fit: SceneImageFit, position: SceneImagePosition): SceneImageLayout;
//# sourceMappingURL=image-layout.d.ts.map