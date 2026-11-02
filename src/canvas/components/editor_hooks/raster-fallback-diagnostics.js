const SAFE_ERROR_NAMES = new Set([
  "Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError",
  "URIError", "EvalError", "AggregateError", "AbortError", "SecurityError",
  "NotAllowedError", "NotFoundError", "QuotaExceededError", "InvalidStateError",
  "NetworkError", "OperationError", "DataError", "TimeoutError", "UnknownError",
]);

/** Expected fallbacks stay usable without logging provider or image details. */
export function reportRasterFallback(code, error) {
  const errorName = SAFE_ERROR_NAMES.has(error?.name) ? error.name : "Error";
  console.warn("raster-fallback", { code, errorName });
}
