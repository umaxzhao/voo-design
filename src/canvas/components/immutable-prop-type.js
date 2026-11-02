/** Validate a shared immutable model once, rather than once for every row/cell. */
export function immutablePropType(checker) {
  const validObjects = new WeakSet();
  const wrap = validate => (...args) => {
    const value = args[0]?.[args[1]];
    const isObject = value !== null && typeof value === "object";
    if (isObject && validObjects.has(value)) return null;
    const error = validate(...args);
    // Invalid values are never cached: diagnostics and recovery remain observable.
    if (!error && isObject) validObjects.add(value);
    return error;
  };
  const result = wrap(checker);
  result.isRequired = wrap(checker.isRequired);
  return result;
}
