// Match predicates for the pipeline keyboard shortcuts (R / P / B). Pulled
// out of VooCanvas so the modifier-rejection + case-insensitive letter
// match logic can be unit-tested without spinning up a full canvas.
//
// The shortcuts intentionally reject every modifier (⌘/⌃/⎇/⇧) so they
// don't trample browser shortcuts (⌘R reload, ⌃B Bookmarks bar) and so
// shift-modified versions can be added later without ambiguity.
export function matchUnmodifiedKey(e, letter) {
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey)
        return false;
    if (typeof e.key !== "string")
        return false;
    return e.key.toLowerCase() === letter.toLowerCase();
}
// Shift-modified letter predicate. Used for "batch" variants that pair
// with plain-letter shortcuts: plain R retries the SELECTED failed
// node, Shift+R retries every transient failure on the canvas.
// Rejects ⌘/⌃/⎇ so it doesn't trample browser shortcuts (⌘⇧R is
// hard-reload in most browsers — Shift+R alone is unbound).
export function matchShiftLetter(e, letter) {
    if (e.metaKey || e.ctrlKey || e.altKey)
        return false;
    if (!e.shiftKey)
        return false;
    if (typeof e.key !== "string")
        return false;
    return e.key.toLowerCase() === letter.toLowerCase();
}
// Submit-from-textarea predicate: ⌘↵ on macOS, ⌃↵ on Windows/Linux. Used
// by the canvas pipeline hotkeys to let users hit Run without leaving the
// node's prompt textarea — same idiom as ChatGPT / SD WebUI / Cursor.
// Returns false for plain Enter (textareas need that for newlines) and
// for Shift+Enter (also a newline in most editors).
export function matchSubmitKey(e) {
    if (e.key !== "Enter")
        return false;
    // Allow EITHER meta (⌘) or ctrl (⌃). Don't require both — the user is on
    // exactly one platform and would type whichever modifier their OS uses.
    if (!e.metaKey && !e.ctrlKey)
        return false;
    // Shift+⌘+Enter / alt+⌘+Enter etc. are unbound — easier to extend later
    // if a "Run downstream from selection" variant lands.
    if (e.shiftKey || e.altKey)
        return false;
    return true;
}
// Node types that don't participate in pipeline execution (no provider call,
// no upstream/downstream contract). Shared between the keyboard handlers,
// right-click menu's `isRunnable`, and node-card UI gating so they can't
// drift out of sync.
//
// EXECUTION taxonomy — separate from the CONNECTION taxonomy in
// store/node-store.ts (CONNECTABLE_NODE_TYPES + isConnectableNode). The
// two views overlap on many types but encode different concerns:
//   • Connection rules decide what edges are legal at draw time.
//   • Execution rules decide what runs when runPipeline walks the graph.
// Keeping them separate means edits to one set won't accidentally redefine
// the other.
const NON_RUNNABLE_NODE_TYPES = new Set(["prompt", "loop", "group"]);
// Additional pass-through types that don't call providers but DO participate
// in execution (they pipe upstream → downstream). "Frame → Run all children"
// needs to pick the first PROVIDER-calling child as the run-from anchor;
// pass-throughs would yield a meaningless starting point.
const PASS_THROUGH_NODE_TYPES = new Set(["text", "image", "video"]);
export function isRunnableNodeType(type) {
    if (!type)
        return false;
    return !NON_RUNNABLE_NODE_TYPES.has(type);
}
// True when the node calls a provider (or aggregates outputs like gallery).
// Used to pick the meaningful starting point for "Run from frame children".
// Distinct from isRunnableNodeType because text/image/video pass-throughs
// ARE runnable but aren't a useful "run-from" root.
export function isProviderExecutorNodeType(type) {
    if (!type)
        return false;
    if (NON_RUNNABLE_NODE_TYPES.has(type))
        return false;
    if (PASS_THROUGH_NODE_TYPES.has(type))
        return false;
    return true;
}
// Guard for R / ⌘↵ / B — actions that mutate pipeline state. All three
// require a selection that points to a runnable node AND no in-flight
// pipeline (a concurrent run would race against the cancel flag).
export function canRunSelected(input) {
    if (!input.selectedId)
        return false;
    if (!isRunnableNodeType(input.nodeType))
        return false;
    if (input.isGenerating)
        return false;
    return true;
}
// Guard for P — read-only preview. Distinct from canRunSelected because
// previewPipeline is safe to invoke during an active run (it just rebuilds
// the plan from current state).
export function canPreviewSelected(input) {
    if (!input.selectedId)
        return false;
    if (!isRunnableNodeType(input.nodeType))
        return false;
    return true;
}
// Iter 102 extended this to include text-gen + llm so prompt-chain
// workflows can also "iterate" — the source's outputText flows in as
// upstream context via buildCombinedPrompt, mirroring how i2i refs flow
// for image/video chains.
const ITERABLE_NODE_TYPES = new Set(["generator", "image-gen", "msgen", "video-gen", "text-gen", "llm"]);
export function canIterateSelected(input) {
    if (!input.selectedId)
        return false;
    if (!input.nodeType || !ITERABLE_NODE_TYPES.has(input.nodeType))
        return false;
    if (!input.hasOutput)
        return false;
    return true;
}
//# sourceMappingURL=pipeline-hotkeys.js.map