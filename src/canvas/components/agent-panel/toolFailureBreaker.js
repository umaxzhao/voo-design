/**
 * Stops an agent turn that keeps hitting the same tool failure.
 *
 * Without this, a tool that fails for a reason the model cannot fix (the
 * workflow executor chunk missing after a rebuild, an upstream that is not
 * configured) gets retried until MAX_STEPS_PER_TURN, and the user sees only
 * "Turn stopped after 20 steps" instead of the actual cause.
 *
 * Pure logic, no React: the loop records every tool outcome and ends the
 * turn when record() returns a trip.
 */

/** Same tool + same error this many times in one turn ends the turn. */
export const REPEATED_FAILURE_LIMIT = 2;

/**
 * Failures that no retry in this page session can fix. One occurrence ends
 * the turn. Matched on the message because they surface as plain Errors.
 */
const UNRECOVERABLE_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

function errorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return String(error.message ?? error.code ?? error);
}

function errorCode(error) {
  if (error && typeof error === "object" && typeof error.code === "string") return error.code;
  return "";
}

export function isUnrecoverableToolError(error) {
  const text = errorText(error);
  return UNRECOVERABLE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * The identity of a failure: tool plus error code, falling back to the first
 * line of the message (so "HTTP 500 at 12:01" and "HTTP 500 at 12:02" from
 * the same tool still count as the same failure only when their code agrees).
 */
export function failureSignature(toolName, error) {
  const code = errorCode(error);
  const text = errorText(error).split("\n")[0].slice(0, 120);
  return `${toolName}::${code || text}`;
}

export function createToolFailureBreaker({ limit = REPEATED_FAILURE_LIMIT } = {}) {
  const counts = new Map();
  return {
    /**
     * Record one tool outcome. Returns null to continue, or
     * { toolName, error, count, unrecoverable } when the turn should end.
     */
    record(toolName, success, error) {
      if (success) {
        for (const key of counts.keys()) {
          if (key.startsWith(`${toolName}::`)) counts.delete(key);
        }
        return null;
      }
      const message = errorText(error) || "unknown error";
      if (isUnrecoverableToolError(error)) {
        return { toolName, error: message, count: 1, unrecoverable: true };
      }
      const key = failureSignature(toolName, error);
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      if (count >= limit) {
        return { toolName, error: message, count, unrecoverable: false };
      }
      return null;
    },
  };
}
