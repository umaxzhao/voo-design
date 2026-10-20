import type { CanvasKitApi, SkiaCanvas, SkiaPaint } from "./canvas-kit-types.js";
import type { SkiaFontManager } from "./font-manager.js";
import type { SceneElement, SceneNode } from "./scene-types.js";
/**
 * Skia-native GUI layer for AI creator cards (Run button, prompt body, model /
 * aspect-ratio / resolution pickers and their dropdowns). Layout, hit-testing
 * and painting all live here so the canvas and the pointer handlers can never
 * drift apart the way the old DOM overlay did.
 */
export type AiNodeControlId = "run" | "prompt" | "model" | "ratio" | "resolution";
export type AiNodeDropdownControlId = "model" | "ratio" | "resolution";
export interface AiNodeControlOption {
    value: string;
    label: string;
    /**
     * True when no configured provider serves this model. Flagged with colour
     * rather than a label suffix: option rows ellipsize at this width, so a
     * trailing marker is the first thing to disappear.
     */
    unavailable?: boolean;
}
export interface AiNodeControlRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface SkiaControlHitTestResult {
    controlId: AiNodeControlId;
    bounds: AiNodeControlRect;
}
export interface AiNodeControlTarget {
    nodeType: string;
    width: number;
    height: number;
    model?: string;
    ratio?: string;
    resolution?: string;
}
export interface AiNodeControlLayout {
    footerY: number;
    prompt: AiNodeControlRect | null;
    run: AiNodeControlRect | null;
    model: AiNodeControlRect | null;
    ratio: AiNodeControlRect | null;
    resolution: AiNodeControlRect | null;
}
export interface AiNodeDropdownLayout {
    bounds: AiNodeControlRect;
    options: readonly AiNodeControlRect[];
    /** Options actually laid out — long lists scroll instead of growing. */
    visibleCount: number;
    /** First option index rendered, after clamping the requested scroll. */
    scrollOffset: number;
}
/** Empty-state label for the model chip. Reads as the action the user has to
 *  take — a bare "Model" looks like a field label, so an unconfigured node
 *  gave no hint that it was the reason Run wouldn't work. */
export declare const MODEL_PLACEHOLDER = "Set model";
export declare const AI_NODE_RATIO_OPTIONS: readonly AiNodeControlOption[];
export declare const AI_NODE_RESOLUTION_OPTIONS: readonly AiNodeControlOption[];
/** True for AI creator cards whose whole surface Skia owns. */
export declare function isAiControlCard(element: SceneElement): element is SceneNode;
/**
 * Recovers the model / ratio / resolution strings the scene adapter packed into
 * `metadata` (in that order, dropping empty values) without needing new scene
 * fields. Entries are classified by shape so a missing model or ratio can never
 * shift the remaining values into the wrong control.
 */
export declare function resolveAiNodeControlValues(node: SceneNode): {
    model?: string;
    ratio?: string;
    resolution?: string;
};
export declare function aiNodeControlTarget(node: SceneNode): AiNodeControlTarget;
/**
 * Deterministic advance width estimate. Paragraph metrics are unavailable until
 * a font is registered, so control geometry must not depend on them — otherwise
 * hit-testing and painting could disagree on the very first frame.
 */
export declare function estimateControlTextWidth(text: string, fontSize: number): number;
export declare function layoutAiNodeControls(target: AiNodeControlTarget): AiNodeControlLayout;
export declare function hitTestNodeControls(node: SceneNode, localX: number, localY: number): SkiaControlHitTestResult | null;
export declare function layoutAiNodeDropdown(anchorInput: AiNodeControlRect | null, optionCount: number, cardWidth: number, requestedScrollOffset?: number, flipBelow?: boolean): AiNodeDropdownLayout;
/**
 * Absolute option index under the pointer, `-1` for the popover chrome (a click
 * there is swallowed rather than treated as "outside"), or `null` when the
 * pointer is not over the popover at all.
 */
export declare function hitTestAiNodeDropdown(layout: AiNodeDropdownLayout, localX: number, localY: number): number | null;
/** Max scroll offset for a list, so callers can clamp wheel deltas. */
export declare function maxAiNodeDropdownScroll(optionCount: number): number;
/**
 * Screen-space flip test: the popover opens above its anchor unless the
 * anchor is too close to the viewport top to fit the popover there.
 * `anchorScreenTop` is the anchor's top edge in canvas screen pixels.
 */
export declare function aiNodeDropdownFlipsBelow(anchorScreenTop: number, dropdownHeight: number, zoom: number): boolean;
export type AiNodeDropdownKeyResult = {
    type: "close";
} | {
    type: "commit";
    index: number;
} | {
    type: "highlight";
    index: number;
    scrollOffset: number;
} | {
    type: "ignore";
};
/**
 * Keyboard navigation for an open dropdown (Escape / Enter / ArrowUp /
 * ArrowDown). Highlight stops at both ends; scrolling follows the highlight
 * so a long list keeps the active row visible.
 */
export declare function resolveAiNodeDropdownKey(state: Pick<AiNodeDropdownState, "options" | "highlightedIndex" | "scrollOffset">, key: string): AiNodeDropdownKeyResult;
export interface AiNodeControlHover {
    nodeId: string;
    controlId: AiNodeControlId;
}
export interface AiNodeDropdownState {
    nodeId: string;
    controlId: AiNodeDropdownControlId;
    anchor: AiNodeControlRect;
    cardWidth: number;
    options: readonly AiNodeControlOption[];
    value: string;
    highlightedIndex: number;
    scrollOffset: number;
    /** Open below the anchor instead of above (not enough viewport room above). */
    flipBelow?: boolean;
}
export declare function getAiNodeControlHover(): AiNodeControlHover | null;
/** Returns true when the hover actually changed, so callers can skip repaints. */
export declare function setAiNodeControlHover(next: AiNodeControlHover | null): boolean;
export declare function getAiNodeControlPressed(): AiNodeControlHover | null;
/** Same change-detection contract as setAiNodeControlHover. */
export declare function setAiNodeControlPressed(next: AiNodeControlHover | null): boolean;
export declare function getAiNodeDropdown(): AiNodeDropdownState | null;
export declare function setAiNodeDropdown(next: AiNodeDropdownState | null): void;
export declare function resetAiNodeControlState(): void;
export declare function aiNodePromptPlaceholder(nodeType: string): string;
export declare function drawNodeControls(canvasKit: CanvasKitApi, canvas: SkiaCanvas, fonts: SkiaFontManager, node: SceneNode, paint: SkiaPaint): void;
//# sourceMappingURL=skia-node-controls.d.ts.map