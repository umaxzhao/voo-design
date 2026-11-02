import type { SceneBounds, SceneElement, ScenePoint, SceneViewport } from "./scene-types.js";
export declare function elementSidePortGeometry(bounds: SceneBounds, rotation: number, side: "left" | "right", flipX?: boolean): {
    point: ScenePoint;
    outward: ScenePoint;
};
export declare function includeMaskDependencies(visibleElements: readonly SceneElement[], allElements: readonly SceneElement[]): SceneElement[];
export declare function screenToWorld(point: ScenePoint, viewport: SceneViewport): ScenePoint;
export declare function viewportWorldBounds(viewport: SceneViewport): SceneBounds;
export declare function boundsIntersect(a: SceneBounds, b: SceneBounds): boolean;
export declare function elementWorldBounds(element: SceneElement): SceneBounds;
export declare function containsPoint(bounds: SceneBounds, point: ScenePoint): boolean;
export declare function hitTestElement(element: SceneElement, point: ScenePoint, tolerance: number): boolean;
//# sourceMappingURL=scene-geometry.d.ts.map