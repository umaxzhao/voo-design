export type AlignType = "left" | "center" | "right" | "top" | "middle" | "bottom";
export interface AlignableItem {
    id: string;
    x: number;
    y: number;
    w: number;
    h: number;
}
export interface AlignResult {
    id: string;
    x: number;
    y: number;
}
export declare const alignSelection: (items: AlignableItem[], type: AlignType) => AlignResult[];
export type DistributeAxis = "horizontal" | "vertical";
export declare const distributeSelection: (items: AlignableItem[], axis: DistributeAxis) => AlignResult[];
/**
 * Equal-gap Tidy Up distribution along one axis — spreads elements such that
 * the visual white space (gap) between adjacent bounding box edges is equal.
 * `gap = (totalSpan - sum(sizes)) / (N - 1)`
 */
export declare const tidyUpSelection: (items: AlignableItem[], axis?: DistributeAxis) => AlignResult[];
//# sourceMappingURL=align.d.ts.map