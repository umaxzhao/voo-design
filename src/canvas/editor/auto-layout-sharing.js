const GEOMETRY_KEYS = ["x", "y", "width", "height", "boxWidth"];
const normalizedNodes = new WeakSet();

function sameBox(original, measured) {
  for (const key of GEOMETRY_KEYS) {
    if (!Object.is(original[key], measured[key]) ||
      Object.hasOwn(original, key) !== Object.hasOwn(measured, key)) return false;
  }
  return true;
}

/** Normalizing an incoming record can replace its identity without changing layout. */
export function sameAutoLayoutGeometry(originals, measured) {
  return originals === measured || originals.length === measured.length && originals.every((node, index) =>
    node.id === measured[index].id && (node === measured[index] || sameBox(node, measured[index])));
}

/** Layout's scratch copies may only change these box fields before Boolean reconciliation. */
export function shareAutoLayoutNodes(originals, measured) {
  let changed = false;
  const shared = measured.map((node, index) => {
    const original = originals[index];
    if (normalizedNodes.has(original) && sameBox(original, node)) {
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
