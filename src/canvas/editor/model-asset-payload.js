/** SPA fallback pages must never become cached ONNX weights. */
export function isHtmlModelResponse(response) {
  const type = String(response.headers?.get?.("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  return type === "text/html" || type === "application/xhtml+xml";
}

/** Reject empty/HTML bytes, including old poisoned caches; ONNX validates the binary graph later. */
export function isValidModelPayload(bytes) {
  if (!bytes?.byteLength) return false;
  const prefix = new TextDecoder().decode(bytes.subarray(0, 256)).trimStart();
  return !/^<(?:!doctype\s+html\b|html\b)/i.test(prefix);
}

/** A status probe reads one cache stream chunk, never buffers an entire large model. */
export async function isValidCachedModelResponse(response) {
  if (isHtmlModelResponse(response)) return false;
  const reader = response.body?.getReader?.();
  if (!reader) return false; // Cannot cheaply certify legacy non-stream responses.
  try {
    const { done, value } = await reader.read();
    return !done && isValidModelPayload(value);
  } finally {
    // A cloned response may wait for its other tee branch before settling
    // cancellation. Request it without blocking this small status probe.
    void reader.cancel().catch(() => false);
    reader.releaseLock();
  }
}
