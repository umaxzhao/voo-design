export interface MeasureRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface AxisMeasure {
    /** 0 when the rects overlap on this axis. */
    gap: number;
    /** 0 when the rects are separated on this axis. */
    overlap: number;
    /** Start/end of the guide line along the measured axis (world coords). */
    from: number;
    to: number;
    /** Position of the guide line on the perpendicular axis (world coords). */
    at: number;
}
export interface MeasureResult {
    /** Horizontal measurement (line runs left↔right). */
    x: AxisMeasure;
    /** Vertical measurement (line runs top↔bottom). */
    y: AxisMeasure;
}
export interface PaddingResult {
    top: number;
    right: number;
    bottom: number;
    left: number;
    isContained: boolean;
}
export declare function isContained(child: MeasureRect, parent: MeasureRect): boolean;
export declare function measurePadding(childRect: MeasureRect, parentRect: MeasureRect): PaddingResult;
export declare function measureBetween(a: MeasureRect, b: MeasureRect): MeasureResult;
//# sourceMappingURL=measure-distance.d.ts.map