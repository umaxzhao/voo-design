/**
 * Minimal local-only error collector.
 *
 * Deliberately has no remote transport and no third-party SDK. It keeps a
 * small in-memory circular buffer of sanitized errors plus lightweight action
 * breadcrumbs, and can format a user-facing diagnostic report that is safe to
 * paste into an issue.
 *
 * Privacy contract:
 * - Never captures image bytes/data URLs, prompt text, API keys, credentials,
 *   or absolute user file paths.
 * - Every captured message/stack passes through `sanitizeErrorText()` before it
 *   is stored.
 * - Report generation is best-effort and can never throw into the caller.
 */

import { extractStorageQuotaDiagnostics } from "./storage-quota-diagnostics.js";

const MAX_ERRORS = 50;
const MAX_BREADCRUMBS = 20;

/** In-memory ring state. Kept module-local so the collector is a singleton. */
const errors = [];
const breadcrumbs = [];
const captureListeners = new Set();

function safeString(value) {
  try {
    if (typeof value === "string") return value;
    if (value === null || value === undefined) return "";
    if (value instanceof Error)
      return `${value.name || "Error"}: ${value.message || ""}`;
    return String(value);
  } catch {
    return "";
  }
}

function redactCommonCredentials(value) {
  return value
    .replace(
      /data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/g,
      "[IMAGE_DATA_URL]",
    )
    .replace(
      /data:[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=]+/g,
      "[DATA_URL]",
    )
    .replace(/(?<![a-zA-Z0-9])(?:sk|pk|rk)-[a-zA-Z0-9_-]{12,}\b/g, "[API_KEY]")
    .replace(
      /(["']?(?:api[_-]?key|token|authorization|secret|password)["']?\s*[:=]\s*["'])[^"']*(["'])/gi,
      "$1[REDACTED]$2",
    )
    .replace(
      /([?&](?:api_key|key|token|auth|signature)=)[^&#\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(/(\/Users\/)[^/\\\s"']+/g, "$1~user")
    .replace(/(\/home\/)[^/\\\s"']+/g, "$1~user")
    .replace(/(C:\\Users\\)[^\\"']+/gi, "$1~user");
}

function redactLikelyUserContent(value) {
  // If an error payload accidentally contains serialized node/prompt data,
  // redact the value for the fields most likely to carry user content.
  return value.replace(
    /(["']?(?:prompt|text|description|dataUrl|src|imageId|assetId|filename|label)["']?\s*:\s*["'])[^"']*(["'])/gi,
    "$1[REDACTED]$2",
  );
}

/**
 * Sanitizes an error message/stack so captured diagnostics never retain user
 * images, prompts, credentials, or absolute user paths.
 */
export function sanitizeErrorText(input) {
  const text = safeString(input);
  if (!text) return text;
  try {
    return redactLikelyUserContent(redactCommonCredentials(text));
  } catch {
    return "[sanitize-error]";
  }
}

function captureSafely(operation) {
  try {
    return operation();
  } catch {
    return null;
  }
}

function safeErrorName(error) {
  return (
    captureSafely(() => {
      if (!error) return "";
      return typeof error.name === "string"
        ? error.name
        : (error.constructor?.name ?? "Error");
    }) ?? "Error"
  );
}

function safeErrorMessage(error, fallback = "") {
  return sanitizeErrorText(
    captureSafely(() => {
      if (typeof error === "string") return error;
      if (!error) return fallback;
      if (typeof error.message === "string") return error.message;
      return String(error);
    }) ?? fallback,
  );
}

function safeStack(error) {
  return sanitizeErrorText(
    captureSafely(() => {
      if (!error) return "";
      if (typeof error.stack === "string") return error.stack;
      if (error instanceof Error) return error.stack ?? "";
      return "";
    }) ?? "",
  );
}

/**
 * Capture one sanitized error in the local ring buffer.
 *
 * @param {Object} input
 * @param {*} [input.error] Original error/value; only sanitized fields are stored.
 * @param {string} [input.message] Explicit fallback message.
 * @param {string} [input.source] e.g. "window.error", "unhandledrejection", "react-boundary".
 * @param {string} [input.code] Optional stable error code.
 */
export function captureError({
  error = null,
  message = "",
  source = "unknown",
  code = null,
} = {}) {
  return captureSafely(() => {
    const safeMessage = safeErrorMessage(error, message);
    const quotaDiagnostics = extractStorageQuotaDiagnostics(error);
    const entry = {
      time: new Date().toISOString(),
      name: safeErrorName(error),
      message: safeMessage,
      source: sanitizeErrorText(source),
      code: code ? sanitizeErrorText(code) : null,
      stack: safeStack(error),
      ...(quotaDiagnostics ? { quota: quotaDiagnostics } : {}),
    };
    errors.push(entry);
    if (errors.length > MAX_ERRORS)
      errors.splice(0, errors.length - MAX_ERRORS);
    for (const listener of captureListeners) {
      captureSafely(() => listener(entry, { error, message, source, code }));
    }
    return entry;
  });
}

/**
 * Register a listener invoked whenever an error is captured.
 * Returns an unsubscribe callback.
 *
 * @param {(entry: object, context: object) => void} listener
 * @returns {() => void} unsubscribe function
 */
export function addErrorCaptureListener(listener) {
  if (typeof listener !== "function") return () => {};
  captureListeners.add(listener);
  return () => {
    captureListeners.delete(listener);
  };
}

/**
 * Record a lightweight user/action breadcrumb. Action values are short
 * identifiers only; never pass user text or content into this function.
 *
 * @param {Object} input
 * @param {string} input.action Stable action id, e.g. "click:taskbar-split-layers".
 * @param {string} [input.category] Breadcrumb category, e.g. "ui", "editor", "user".
 */
export function addBreadcrumb({ action = "", category = "ui" } = {}) {
  return captureSafely(() => {
    if (typeof action !== "string" || action.length === 0) return null;
    const entry = {
      time: new Date().toISOString(),
      category: sanitizeErrorText(category),
      action: sanitizeErrorText(action),
    };
    breadcrumbs.push(entry);
    if (breadcrumbs.length > MAX_BREADCRUMBS) {
      breadcrumbs.splice(0, breadcrumbs.length - MAX_BREADCRUMBS);
    }
    return entry;
  });
}

/** Return a shallow snapshot for tests/diagnostics. */
export function getDiagnosticSnapshot() {
  return (
    captureSafely(() => ({
      errors: errors.map((entry) => ({ ...entry })),
      breadcrumbs: breadcrumbs.map((entry) => ({ ...entry })),
    })) ?? { errors: [], breadcrumbs: [] }
  );
}

/** Clear local diagnostics (used by tests and by an explicit user action). */
export function clearDiagnostics() {
  errors.length = 0;
  breadcrumbs.length = 0;
  captureListeners.clear();
}

/**
 * Format the current local report as indented JSON.
 *
 * The report intentionally includes only non-sensitive metadata and sanitized
 * error text. Pass `app` and `capabilities` from the caller so this module can
 * stay free of DOM/environment imports.
 */
export function formatReport({
  app = {},
  capabilities = {},
  error = null,
  message = "",
  source = "manual",
  code = null,
} = {}) {
  return (
    captureSafely(() => {
      let latest = null;
      if (error || message) {
        latest = captureError({ error, message, source, code });
      }
      const snapshot = getDiagnosticSnapshot();
      const report = {
        timestamp: new Date().toISOString(),
        app: captureSafely(() => JSON.parse(JSON.stringify(app))) ?? {},
        capabilities:
          captureSafely(() => JSON.parse(JSON.stringify(capabilities))) ?? {},
        errors: latest ? [...snapshot.errors] : snapshot.errors,
        breadcrumbs: snapshot.breadcrumbs,
      };
      return JSON.stringify(report, null, 2);
    }) ?? "{}"
  );
}

export const ERROR_COLLECTOR_LIMITS = Object.freeze({
  MAX_ERRORS,
  MAX_BREADCRUMBS,
});

let globalHandlersInstalled = false;

/**
 * Install once-per-page window error + unhandledrejection listeners that
 * feed the local collector. Never rethrows; never installs twice.
 *
 * @param {Window | undefined} [target]
 * @returns {() => void} disposer
 */
export function installGlobalErrorHandlers(target) {
  const root =
    target ??
    (typeof window !== "undefined" ? window : undefined);
  if (!root || typeof root.addEventListener !== "function") {
    return () => {};
  }
  const isWindowRoot =
    typeof window !== "undefined" && root === window;
  if (globalHandlersInstalled && isWindowRoot) {
    return () => {};
  }

  const onError = (event) => {
    try {
      captureError({
        error: event?.error ?? null,
        message: event?.message || String(event?.error ?? "window.error"),
        source: "window.error",
      });
    } catch {
      /* never throw from a global handler */
    }
  };

  const onRejection = (event) => {
    try {
      const reason = event?.reason;
      captureError({
        error: reason instanceof Error ? reason : null,
        message:
          reason instanceof Error
            ? reason.message
            : safeString(reason) || "unhandledrejection",
        source: "unhandledrejection",
      });
    } catch {
      /* never throw from a global handler */
    }
  };

  root.addEventListener("error", onError);
  root.addEventListener("unhandledrejection", onRejection);
  if (isWindowRoot) globalHandlersInstalled = true;

  return () => {
    root.removeEventListener("error", onError);
    root.removeEventListener("unhandledrejection", onRejection);
    if (typeof window !== "undefined" && root === window) {
      globalHandlersInstalled = false;
    }
  };
}

