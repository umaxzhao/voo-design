export type PaintLayerType = "solid" | "linear" | "radial" | "angular" | "diamond" | "image";
export interface ImageAdjustments {
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
    highlights: number;
    shadows: number;
}
export interface PaintLayer {
    id: string;
    type: PaintLayerType;
    color?: string;
    opacity?: number;
    visible?: boolean;
    backgroundImage?: string;
    backgroundSize?: "cover" | "contain" | "fill" | "none" | "tile";
    backgroundPosition?: "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";
    imageAdjustments?: ImageAdjustments;
}
export declare function createPaintLayerId(prefix: string): string;
export declare function updatePaintLayer(layers: readonly PaintLayer[], id: string, patch: Partial<Omit<PaintLayer, "id">>): PaintLayer[];
export declare function removePaintLayer(layers: readonly PaintLayer[], id: string): PaintLayer[];
export declare function movePaintLayer(layers: readonly PaintLayer[], sourceId: string, targetId: string): PaintLayer[];
//# sourceMappingURL=paint-layers.d.ts.map