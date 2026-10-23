/**
 * scripts/agent-bench/fixture-builder.mjs
 *
 * Builds synthetic fixture states for task dry-run evaluation.
 * Creates minimal states that satisfy the predicates in each task.
 */

/**
 * Builds a synthetic fixture state that satisfies the task's predicates.
 * For dry-run validation, we construct a state matching the expectations.
 */
export function buildFixtureState(task) {
  const state = {
    editor: {
      artboard: null,
      layers: [],
    },
  };

  // Extract dimensions from artboardSize predicate
  const artboardPred = task.expect.find((p) => p.type === "artboardSize");
  if (artboardPred) {
    state.editor.artboard = {
      width: artboardPred.width,
      height: artboardPred.height,
    };
  }

  // Extract text content from layerTextIncludes predicates
  const textPredicates = task.expect.filter((p) => p.type === "layerTextIncludes");
  for (const pred of textPredicates) {
    state.editor.layers.push({
      id: `text-${state.editor.layers.length}`,
      kind: "text",
      text: pred.text,
    });
  }

  // Extract layer count expectations
  const countPredicates = task.expect.filter((p) => p.type === "layerCount");
  for (const pred of countPredicates) {
    const kind = pred.layerKind || "shape";
    const min = pred.min ?? 1;

    // Add layers to meet minimum count
    let existingCount = state.editor.layers.filter((l) => l.kind === kind).length;
    for (let i = existingCount; i < min; i++) {
      state.editor.layers.push({
        id: `${kind}-${i}`,
        kind,
        ...(kind === "text" ? { text: "" } : {}),
      });
    }
  }

  return state;
}
