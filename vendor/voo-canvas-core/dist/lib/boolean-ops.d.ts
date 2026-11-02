export type BooleanOperation = "union" | "subtract" | "intersect" | "exclude";
export type BooleanOpType = BooleanOperation;
export interface BooleanSource {
    id: string;
    type: string;
    x: number;
    y: number;
    w: number;
    h: number | null;
    name?: string;
    color?: string;
    strokeColor?: string;
    strokeWidth?: number;
    opacity?: number;
    rotation?: number;
    cornerRadius?: number;
    polygonSides?: number;
    polygonCount?: number;
    ellipseInnerRadius?: number;
    ellipseStartAngle?: number;
    ellipseSweep?: number;
    booleanOperation?: BooleanOperation;
    booleanSources?: BooleanSource[];
    points?: {
        x: number;
        y: number;
    }[];
}
export interface PolygonPath {
    points: {
        x: number;
        y: number;
    }[];
}
export interface BooleanOpResult {
    op: BooleanOperation;
    combinedBoundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    svgPathData: string;
}
export declare const BOOLEAN_OPERATIONS: readonly BooleanOperation[];
export declare function getBooleanSelection(selectedIdsOrNodes?: unknown, nodesList?: unknown[]): BooleanSource[];
export declare function buildBooleanNode(arg1: BooleanOperation | BooleanSource[], arg2?: BooleanOperation | BooleanSource[]): {
    id: string;
    type: string;
    title: string;
    name: string;
    parentId: null;
    x: number;
    y: number;
    w: number;
    h: number;
    booleanOperation: BooleanOperation;
    booleanSources: BooleanSource[];
};
/**
 * Computes exact operational bounding box based on the Boolean operation type.
 */
export declare function getOpBoundingBox(op: BooleanOperation, paths: PolygonPath[]): {
    x: number;
    y: number;
    width: number;
    height: number;
};
/**
 * Executes a vector boolean operation (union / intersect / subtract / exclude)
 * on a set of polygon shapes.
 */
export declare function performBooleanOp(op: BooleanOperation, paths: PolygonPath[]): BooleanOpResult;
//# sourceMappingURL=boolean-ops.d.ts.map