/**
 * Structural layout intent derived by Voo's design materializer.
 *
 * Models never set this metadata directly. Composite expanders attach it
 * while turning a validated DesignSpec into editable canvas objects, so
 * quality gates do not have to infer component relationships from geometry.
 */
export const DESIGN_LAYOUT_ROLES = [
    "container",
    "background",
    "content",
    "decoration",
];
export const DESIGN_LAYOUT_SIZING = [
    "fixed",
    "fill-container",
    "hug-content",
];
export const DESIGN_LAYOUT_INTENT_TYPES = [
    "overlay",
    "crop",
    "breakout",
];
export function createDesignSemanticGroupId(input) {
    const root = `${input.idPrefix}-semantic-${input.base}-${input.seq}-${input.pageIdx}-${input.layerIdx}`;
    return input.suffix ? `${root}-${input.suffix}` : root;
}
function isBackgroundContentPair(left, right) {
    return ((left.role === "background" && right.role !== "background") ||
        (right.role === "background" && left.role !== "background"));
}
/** Content/content collisions remain invalid inside the same component. */
export function isExpectedDesignSemanticOverlap(left, right) {
    if (left.groupId === right.groupId) {
        return isBackgroundContentPair(left, right);
    }
    if (left.role === "background" && right.parentGroupId === left.groupId) {
        return true;
    }
    return right.role === "background" && left.parentGroupId === right.groupId;
}
export function sharesOverlayIntent(left, right) {
    return (left?.type === "overlay" &&
        right?.type === "overlay" &&
        left.id === right.id);
}
export function isFillBackgroundForContent(input) {
    return (input.background.groupId === input.content.groupId &&
        input.background.role === "background" &&
        input.background.sizing === "fill-container" &&
        input.content.role !== "background" &&
        input.container?.groupId === input.background.groupId &&
        input.container.role === "container");
}
//# sourceMappingURL=design-layout-semantics.js.map