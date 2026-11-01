/** Compile a read-only JSON baseline; always read the caller's current values. */
export function createDefaultValueMatcher(expected) {
  if (!expected || typeof expected !== "object") return actual => actual === expected;
  if (Array.isArray(expected)) {
    const fields = expected.map(createDefaultValueMatcher);
    return actual => Array.isArray(actual) && actual.length === fields.length &&
      fields.every((match, index) => match(actual[index]));
  }
  const fields = new Map(Object.entries(expected).map(([key, value]) => [key, createDefaultValueMatcher(value)]));
  return actual => {
    if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
    let count = 0;
    // Reuse the baseline structure, never cache equality for mutable inputs.
    for (const key in actual) {
      if (!Object.hasOwn(actual, key)) continue;
      const match = fields.get(key);
      if (!match || !match(actual[key])) return false;
      count++;
    }
    return count === fields.size;
  };
}
