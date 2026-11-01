const GEOMETRY_KEYS = ["x", "y", "width", "height", "boxWidth"];
const normalizedNodes = new WeakSet();

/** Layout's scratch copies may only change these box fields before Boolean reconciliation. */
export function shareAutoLayoutNodes(originals, measured) {
  let changed = false;
  const shared = measured.map((node, index) => {
    const original = originals[index];
    if (normalizedNodes.has(original) && GEOMETRY_KEYS.every(key =>
      Object.is(original[key], node[key]) && Object.hasOwn(original, key) === Object.hasOwn(node, key))) {
      return original;
    }
    // Normalize imported records once. Keeping their original dictionary-like
    // shapes made later spreads and serialization slower than fresh copies.
    normalizedNodes.add(node);
    changed = true;
    return node;
  });
  return changed ? shared : originals;
}
