/**
 * The types the renderer borrows from the host's document model.
 *
 * Copied verbatim from voo-canvas's `store/node-store.ts` rather than imported:
 * that module is the application's central store and reaches most of the app,
 * while these are the only declarations the painter actually needs. A consumer
 * with its own model satisfies them structurally.
 */
export type BlendMode = "pass-through" | "normal" | "darken" | "multiply" | "plus-darker" | "color-burn" | "lighten" | "screen" | "plus-lighter" | "color-dodge" | "overlay" | "soft-light" | "hard-light" | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity";
export type EffectBlendMode = Exclude<BlendMode, "pass-through">;
export interface DepthEffect {
    enabled?: boolean;
    distance?: number;
    angle?: number;
    color?: string;
}
export type StrokeArrowhead = "none" | "line" | "triangle" | "triangle-flip" | "circle" | "diamond" | "round" | "square";
//# sourceMappingURL=external-types.d.ts.map