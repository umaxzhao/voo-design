import type { SkiaFontManager } from "./font-manager.js";
import type { SceneElement } from "./scene-types.js";
export interface SceneTextLayoutInspection {
    nodeId: string;
    status: "measured" | "unsupported";
    reason?: string;
    text: string;
    fontFamily: string;
    fontWeight: number;
    availableWidth: number;
    availableHeight: number;
    measuredWidth?: number;
    /** Unwrapped width for short-copy readability repairs. */
    intrinsicWidth?: number;
    measuredHeight?: number;
    lineCount?: number;
    maxLinesExceeded?: boolean;
    clipped?: boolean;
    missingGlyphs?: boolean;
    unresolvedCodepoints?: readonly number[];
}
interface ParagraphFactory {
    createParagraph: SkiaFontManager["createParagraph"];
}
export declare function inspectSceneTextLayouts(elements: readonly SceneElement[], fonts: ParagraphFactory, scopeIds?: readonly string[]): readonly SceneTextLayoutInspection[];
export {};
//# sourceMappingURL=text-layout-inspection.d.ts.map