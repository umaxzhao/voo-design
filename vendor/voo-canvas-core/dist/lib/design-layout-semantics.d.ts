/**
 * Structural layout intent derived by Voo's design materializer.
 *
 * Models never set this metadata directly. Composite expanders attach it
 * while turning a validated DesignSpec into editable canvas objects, so
 * quality gates do not have to infer component relationships from geometry.
 */
export declare const DESIGN_LAYOUT_ROLES: readonly ["container", "background", "content", "decoration"];
export type DesignLayoutRole = (typeof DESIGN_LAYOUT_ROLES)[number];
export declare const DESIGN_LAYOUT_SIZING: readonly ["fixed", "fill-container", "hug-content"];
export type DesignLayoutSizing = (typeof DESIGN_LAYOUT_SIZING)[number];
export declare const DESIGN_LAYOUT_INTENT_TYPES: readonly ["overlay", "crop", "breakout"];
export type DesignLayoutIntentType = (typeof DESIGN_LAYOUT_INTENT_TYPES)[number];
/** Model-authored exception to the default containment/collision contract. */
export interface DesignLayoutIntent {
    id: string;
    type: DesignLayoutIntentType;
}
export interface DesignLayoutSemantics {
    /** Stable id shared by the parts of one generated semantic component. */
    groupId: string;
    /** Parent semantic group for nested controls such as a nav CTA. */
    parentGroupId?: string;
    role: DesignLayoutRole;
    /** Expected size relationship used by bounded deterministic repair. */
    sizing: DesignLayoutSizing;
}
export declare function createDesignSemanticGroupId(input: {
    idPrefix: string;
    base: number;
    seq: number;
    pageIdx: number;
    layerIdx: number;
    suffix?: string;
}): string;
/** Content/content collisions remain invalid inside the same component. */
export declare function isExpectedDesignSemanticOverlap(left: DesignLayoutSemantics, right: DesignLayoutSemantics): boolean;
export declare function sharesOverlayIntent(left: DesignLayoutIntent | undefined, right: DesignLayoutIntent | undefined): boolean;
export declare function isFillBackgroundForContent(input: {
    background: DesignLayoutSemantics;
    content: DesignLayoutSemantics;
    container?: DesignLayoutSemantics;
}): boolean;
//# sourceMappingURL=design-layout-semantics.d.ts.map