export interface PenPoint {
    x: number;
    y: number;
}
export interface PenAnchor {
    x: number;
    y: number;
    handleIn?: PenPoint;
    handleOut?: PenPoint;
    disconnect?: boolean;
    closeSubPath?: boolean;
}
export interface PenPathGeometryState {
    anchors: PenAnchor[];
    closed: boolean;
}
export interface PenPathState extends PenPathGeometryState {
    commitToken: object;
}
export interface PenPathStyle {
    color: string;
    width: number;
}
export interface PenNodeTransform {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation?: number;
    flipH?: boolean;
    flipV?: boolean;
}
export interface PenPointerDownOptions {
    clickCount: number;
    closeThreshold: number;
}
export interface PenPointerDownResult {
    state: PenPathState;
    shouldCommit: boolean;
}
/**
 * Claims the current draft for one finish trigger. Escape, toolbar switching,
 * and the active-tool subscription can fire in the same event turn; clearing
 * the shared guard synchronously prevents duplicate overlapping Pen nodes.
 */
export declare function claimPenPathCommit(requestedState: PenPathState): PenPathState | null;
export interface PenNodePatch {
    type: "pen";
    parentId: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
    pathData: string;
    vectorClosed: boolean;
    vectorAnchors: PenAnchor[];
    strokeColor: string;
    strokeWidth: number;
    strokeLineCap: "round";
    strokeLineJoin: "round";
    fillVisible: false;
}
export declare function startPenPath(point: PenPoint): PenPathState;
export declare function appendPenAnchor(state: PenPathState, point: PenPoint): PenPathState;
/** Starts another sub-path while preserving a previously closed last path. */
export declare function startDisconnectedPenSubPath(state: PenPathState, point: PenPoint): PenPathState;
/**
 * Drags the control handle of the latest anchor.
 * - Normal drag: mirrors handleIn as the opposite of handleOut (smooth curve).
 * - Alt-drag (altKey=true): moves only handleOut, leaves handleIn unchanged
 *   ("broken handle" / corner point in Illustrator/Figma).
 */
export declare function dragLatestPenHandle(state: PenPathState, pointer: PenPoint, altKey?: boolean): PenPathState;
export declare function movePenAnchor(anchors: readonly PenAnchor[], index: number, point: PenPoint): PenAnchor[];
export declare function movePenHandle(anchors: readonly PenAnchor[], index: number, handleType: "in" | "out", point: PenPoint, symmetric?: boolean): PenAnchor[];
/**
 * Deletes an anchor at `index` and re-bridges the surrounding curve.
 * If the anchor was the only one in its sub-path the sub-path is dropped.
 * The `disconnect` flag on the *next* anchor is cleared when the preceding
 * sub-path end is removed, because the gap is now gone.
 */
export declare function deletePenAnchor(anchors: readonly PenAnchor[], index: number): PenAnchor[];
export interface ClosestPenSegment {
    distance: number;
    fromIndex: number;
    point: PenPoint;
    t: number;
    toIndex: number;
}
export interface PenPathBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
/** Calculates the visible curve bounds, excluding unused control handles. */
export declare function calculatePenPathBounds(anchors: readonly PenAnchor[], closed: boolean): PenPathBounds | null;
/** Finds the actual Bézier segment nearest to a pointer in the same space. */
export declare function findClosestPenSegment(anchors: readonly PenAnchor[], closed: boolean, pointer: PenPoint): ClosestPenSegment | null;
/**
 * Inserts a new anchor on the cubic Bézier segment between anchor[fromIndex]
 * and anchor[fromIndex+1] at parameter t (0–1).  The two surrounding anchors
 * get updated handles so the curve shape is preserved (de Casteljau split).
 * Returns the full updated anchor list.
 */
export declare function insertAnchorOnSegment(anchors: readonly PenAnchor[], fromIndex: number, t: number, toIndex?: number): PenAnchor[];
/**
 * Toggles an anchor between smooth (mirrored handles) and corner (independent
 * handles).  A smooth anchor has at least one handle; a corner anchor has none.
 * - Smooth → Corner: strips both handles (Figma's Alt+click behaviour).
 * - Corner → Smooth: synthesises symmetric handles tangent to the segment
 *   direction (1/3 of segment length on each side).
 */
export declare function toggleAnchorType(anchors: readonly PenAnchor[], index: number): PenAnchor[];
export declare function closePenPathNearStart(state: PenPathState, point: PenPoint, threshold: number): PenPathState;
/** Resolve a click while a Pen path is already in progress. */
export declare function resolvePenPointerDown(state: PenPathState, point: PenAnchor, options: PenPointerDownOptions): PenPointerDownResult;
/** Drop trailing anchors that sit within `tolerance` of the previous one.
 *  Double-click commits fire after the second pointerdown already appended
 *  a duplicate of the final anchor (Chromium reports event.detail = 0 on
 *  pointerdown, so the dup cannot be filtered out earlier). */
export declare function dropTrailingDuplicateAnchors(state: PenPathState, tolerance: number): PenPathState;
export declare function buildPenPathData(anchors: readonly PenAnchor[], closed: boolean): string;
export declare function scalePenGeometry(anchors: readonly PenAnchor[], closed: boolean, scaleX: number, scaleY: number): Pick<PenNodePatch, "pathData" | "vectorAnchors">;
/** Maps a canvas-space pointer into the editable local coordinates of a Pen. */
export declare function worldPointToPenLocal(geometry: PenNodeTransform, point: PenPoint): PenPoint;
/** Maps a Pen-local point into canvas world coordinates. */
export declare function penLocalPointToWorld(geometry: PenNodeTransform, point: PenPoint): PenPoint;
/**
 * Rebuilds a Pen's local bounds after an anchor edit without changing the
 * world-space position of its rotated or flipped path.
 */
export declare function reframeEditedPenPath(geometry: PenNodeTransform, anchors: readonly PenAnchor[], closed: boolean, style: PenPathStyle): Pick<PenNodePatch, "x" | "y" | "w" | "h" | "pathData" | "vectorAnchors"> | null;
export declare function finalizePenPath(state: PenPathGeometryState, style: PenPathStyle): PenNodePatch | null;
/** Snaps a point relative to a reference point to horizontal, vertical, or 45-degree diagonal. */
export declare function constrainPoint45(point: PenPoint, relativeTo: PenPoint): PenPoint;
/** Snaps the handle direction relative to its anchor to 45-degree increments while preserving distance. */
export declare function constrainHandle45(handle: PenPoint, anchor: PenPoint): PenPoint;
//# sourceMappingURL=pen-path.d.ts.map