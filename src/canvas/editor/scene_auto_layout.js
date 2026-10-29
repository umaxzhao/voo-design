/** Reflow opt-in group layouts in document coordinates. Pure scene data only. */

/**
 * Auto layout is a *document-coordinate flattening pass* over group folders.
 * Every child keeps an absolute box, so the pass resolves each group's own box
 * first and then writes absolute child positions. The public contract is
 * unchanged from the original flex-only implementation:
 *
 * - `normalizeAutoLayout(value)` accepts documents written before wrap / gap /
 *   min-max existed and fills the new fields with defaults.
 * - `reflowAutoLayout(doc)` is pure (the input document is never mutated) and
 *   idempotent (feeding its output back in returns identical geometry).
 *
 * ## Resolution order (deterministic, no oscillation)
 *
 * 1. **Hug measurement, bottom-up.** A post-order walk measures every group
 *    after its child groups, so a hug frame is sized from its children's
 *    already-resolved boxes. A `layoutWidth`/`layoutHeight: "fill"` child is
 *    measured at its current size here: filling is decided later, by the
 *    parent, and a hug parent has no free space to hand out.
 * 2. **Clamp.** Every resolved box is clamped by the group's own
 *    `minWidth`/`maxWidth`/`minHeight`/`maxHeight`. `min` wins when
 *    `min > max` (the CSS `clamp()` rule), and clamping never moves children.
 * 3. **Line breaking (wrap).** Wrapped lines are only formed against the
 *    *resolved inner main size*. A hug main axis therefore produces one line
 *    unless `maxWidth`/`maxHeight` clamps it below the content size; in that
 *    case the clamped size is kept (re-hugging after wrapping would move the
 *    target and oscillate).
 * 4. **Cross size.** A fixed cross axis keeps its (clamped) size. A hug cross
 *    axis sums its line cross sizes plus `crossGap`.
 * 5. **Placement, top-down.** For each group the parent resolves fill children
 *    (`fill` on a bounded axis receives an equal share on the main axis, and
 *    the whole inner cross on the cross axis; in a wrapped frame a cross-fill
 *    child stretches to its own line instead), positions the lines with
 *    `justifyContent` + `alignContent` + `alignItems`, translates whole
 *    subtrees, and only then recurses into child groups with the axes the
 *    parent pinned. This top-down recursion is what lets a filled nested group
 *    lay its own fill children across the imposed size.
 * 6. **Conflicts resolve toward the measured size.** A `fill` child of a hug
 *    parent keeps its measured size (the parent has no bounded axis to share),
 *    and a hug child of a fixed parent keeps its hug size unless it is itself
 *    marked `fill`. That pairing is stable across repeated passes.
 * 7. **Absolute children** are excluded from flow *and* from hug measurement;
 *    they keep their offset from the parent and are translated with the
 *    parent's subtree by `moveSubtree`.
 *
 * `justifyContent`/`alignContent` support start, center, end, space-between,
 * space-around and space-evenly (the last two are cheap here, so they ship).
 * `alignItems` supports start/center/end and `stretch`, which gives every flow
 * child the full line cross (or the inner cross when the frame does not wrap) —
 * a hugging cross axis has no free space, so children keep their measured size.
 * Per-line main-axis fill is still omitted; see the deferred notes in the
 * reflow tests.
 */

export { normalizeAutoLayout } from "./auto-layout-values.js";
export { reflowAutoLayout } from "./auto-layout-reflow.js";
