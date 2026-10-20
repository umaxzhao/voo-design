/**
 * Strict, sanitized storage quota diagnostics helper.
 *
 * Invariants:
 * - Only allowlisted metadata fields: `storageArea`, `count`, `totalBytes`, `errorType`.
 * - Numeric counts and byte values must be non-negative safe integers or null.
 * - Extracts and validates ONLY when both valid storageArea and errorType are present.
 * - Exact classification: only recognized storage quota errors, never generic model/API quotas.
 * - Never captures or leaks keys, job IDs, provider names, prompts, images,
 *   payload values, or arbitrary private details.
 */

export const ALLOWED_STORAGE_AREAS = new Set([
  "indexeddb",
  "session",
  "local",
  "sync",
  "managed",
  "unknown",
]);

export const ALLOWED_ERROR_TYPES = new Set([
  "quota_bytes_exceeded",
  "quota_exceeded",
  "unknown",
]);

// Exact Chromium & Web Storage quota patterns
const STORAGE_QUOTA_PATTERNS = [
  /Session storage quota bytes exceeded/i,
  /storage quota bytes exceeded/i,
  /quota_bytes_exceeded/i,
];

// Explicit non-storage patterns (e.g. LLM provider quotas, billing, rate limits)
const NON_STORAGE_QUOTA_PATTERNS = [
  /model[_\s-]*quota/i,
  /rate[_\s-]*limit/i,
  /insufficient[_\s-]*quota/i,
  /balance/i,
  /credits/i,
  /tier/i,
  /account/i,
];

/**
 * Returns true if an error is an identified storage quota error.
 *
 * @param {*} error
 * @returns {boolean}
 */
export function isStorageQuotaError(error) {
  if (!error) return false;
  const name = typeof error.name === "string" ? error.name : "";
  const message = typeof error.message === "string" ? error.message : "";
  const code = typeof error.code === "string" ? error.code : "";

  // Reject non-storage quota errors (e.g. model quota, billing 429)
  for (const pattern of NON_STORAGE_QUOTA_PATTERNS) {
    if (pattern.test(message) || pattern.test(code) || pattern.test(name)) {
      return false;
    }
  }

  // IndexedDB reports quota failures by DOMException name, not Chrome message text.
  if (
    name === "QuotaExceededError" ||
    code === "quota_bytes_exceeded" ||
    code === "quotaExceeded"
  ) {
    return true;
  }

  for (const pattern of STORAGE_QUOTA_PATTERNS) {
    if (pattern.test(message) || pattern.test(code)) {
      return true;
    }
  }

  return false;
}

/**
 * Creates a strictly validated, sanitized quota diagnostics object.
 *
 * @param {Object} input
 * @param {string} [input.storageArea]
 * @param {number|null} [input.count]
 * @param {number|null} [input.totalBytes]
 * @param {string} [input.errorType]
 * @returns {{ storageArea: string, count: number|null, totalBytes: number|null, errorType: string }}
 */
export function createSanitizedQuotaDiagnostics({
  storageArea = "unknown",
  count = null,
  totalBytes = null,
  errorType = "quota_bytes_exceeded",
} = {}) {
  const safeArea =
    typeof storageArea === "string" && ALLOWED_STORAGE_AREAS.has(storageArea)
      ? storageArea
      : "unknown";

  const safeCount =
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0
      ? count
      : null;

  const safeTotalBytes =
    typeof totalBytes === "number" &&
    Number.isSafeInteger(totalBytes) &&
    totalBytes >= 0
      ? totalBytes
      : null;

  const safeErrorType =
    typeof errorType === "string" && ALLOWED_ERROR_TYPES.has(errorType)
      ? errorType
      : "unknown";

  return {
    storageArea: safeArea,
    count: safeCount,
    totalBytes: safeTotalBytes,
    errorType: safeErrorType,
  };
}

/**
 * Extracts and sanitizes allowlisted quota diagnostics from a details or error object.
 * Requires both a recognized storageArea AND a recognized errorType.
 *
 * @param {*} details
 * @returns {{ storageArea: string, count: number|null, totalBytes: number|null, errorType: string } | null}
 */
export function extractSanitizedQuotaDiagnostics(details) {
  if (!details || typeof details !== "object") return null;

  const areaCandidate = details.storageArea;
  const typeCandidate = details.errorType;
  const countCandidate = details.count;
  const bytesCandidate = details.totalBytes;

  const hasArea =
    typeof areaCandidate === "string" &&
    ALLOWED_STORAGE_AREAS.has(areaCandidate);
  const hasType =
    typeof typeCandidate === "string" && ALLOWED_ERROR_TYPES.has(typeCandidate);

  // Both storageArea and errorType must be valid allowlisted enums
  if (!hasArea || !hasType) {
    return null;
  }

  const hasValidCount =
    countCandidate === null ||
    countCandidate === undefined ||
    (typeof countCandidate === "number" &&
      Number.isSafeInteger(countCandidate) &&
      countCandidate >= 0);

  const hasValidBytes =
    bytesCandidate === null ||
    bytesCandidate === undefined ||
    (typeof bytesCandidate === "number" &&
      Number.isSafeInteger(bytesCandidate) &&
      bytesCandidate >= 0);

  if (!hasValidCount || !hasValidBytes) {
    return null;
  }

  return createSanitizedQuotaDiagnostics({
    storageArea: areaCandidate,
    count: countCandidate ?? null,
    totalBytes: bytesCandidate ?? null,
    errorType: typeCandidate,
  });
}

/**
 * Safely attaches sanitized quota details to an error object without throwing on frozen or non-extensible objects.
 *
 * @param {*} error
 * @param {Object} details
 */
export function safeAnnotateQuotaError(error, details) {
  if (!error || typeof error !== "object") return;
  try {
    if (!Object.isFrozen(error) && Object.isExtensible(error)) {
      error.details = details;
    }
  } catch {
    // Best-effort only; never throw or mask the original error
  }
}

/** Classify before accepting metadata: provider quota details cannot impersonate storage. */
export function extractStorageQuotaDiagnostics(error) {
  if (!isStorageQuotaError(error)) return null;
  return extractSanitizedQuotaDiagnostics(
    error?.details ?? error?.quotaDetails,
  );
}

/** Native errors may be frozen or have read-only codes; normalize without mutation. */
export function normalizeStorageQuotaError(error, diagnostics) {
  if (!isStorageQuotaError(error)) return error;
  const failure = new Error(error?.message || "quotaExceeded", {
    cause: error,
  });
  failure.name = "QuotaExceededError";
  failure.code = "quotaExceeded";
  failure.details = createSanitizedQuotaDiagnostics(diagnostics);
  return failure;
}

/** Wire boundaries classify native Chrome errors without mutating the original exception. */
export function storageFailureCode(error, fallback = "generic") {
  // Keep declared wire codes stable; only native uncoded quota errors need normalization.
  if (typeof error?.code === "string" && error.code) return error.code;
  return isStorageQuotaError(error)
    ? "quotaExceeded"
    : (error?.code ?? fallback);
}
