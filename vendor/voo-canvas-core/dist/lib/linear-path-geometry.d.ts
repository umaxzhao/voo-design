export interface LinearPathPoint {
    x: number;
    y: number;
}
export interface LinearPathGeometry {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
}
export interface LinearPathEndpoints {
    start: LinearPathPoint;
    end: LinearPathPoint;
}
export type LinearPathEndpoint = "start" | "end";
export interface CompleteLinearPathDrawEffects {
    place: (geometry: LinearPathGeometry) => void;
    reset: () => void;
}
interface LinearPathNodeLike {
    type: string;
    x: number;
    y: number;
    w: number;
    h: number | null;
    rotation?: number;
    pathData?: string;
}
/**
 * Converts legacy line boxes whose height represented the painted stroke into
 * the zero-height path model. Moving y to the former vertical center preserves
 * the exact visible path while removing stroke width from object geometry.
 */
export declare function normalizeLinearPathNode<T extends LinearPathNodeLike>(node: T): T;
/**
 * Converts a directed A → B gesture into the horizontal local box used by
 * line/arrow nodes. The box rotates around its center, so its local left and
 * right endpoints land exactly on A and B without losing drag direction.
 */
export declare function createLinearPathGeometry(start: LinearPathPoint, end: LinearPathPoint): LinearPathGeometry | null;
/** Recovers the directed world-space endpoints represented by a node box. */
export declare function getLinearPathEndpoints(geometry: LinearPathGeometry): LinearPathEndpoints;
/** Moves one directed endpoint while keeping the opposite endpoint fixed. */
export declare function resizeLinearPathEndpoint(geometry: LinearPathGeometry, handle: LinearPathEndpoint, point: LinearPathPoint): LinearPathGeometry | null;
/**
 * Commits a completed A → B path and always releases the transient draw state.
 * Keeping both effects in one operation prevents an early return from leaving
 * the preview line mounted after the real node has been created.
 */
export declare function completeLinearPathDraw(start: LinearPathPoint, end: LinearPathPoint, effects: CompleteLinearPathDrawEffects): boolean;
export {};
//# sourceMappingURL=linear-path-geometry.d.ts.map