/** File-operation diagnostics never include names, paths, contents or native messages. */
const ERROR_CODES = Object.freeze({
  AbortError: "canceled", NotFoundError: "not_found", NotAllowedError: "permission_denied",
  SecurityError: "permission_denied", QuotaExceededError: "quota_exceeded",
  TypeMismatchError: "type_mismatch", NotSupportedError: "unsupported", TypeError: "unsupported",
  InvalidModificationError: "invalid_operation", InvalidStateError: "invalid_state",
  NotReadableError: "not_readable", NoModificationAllowedError: "read_only",
  SyntaxError: "invalid_data", DataCloneError: "unsupported",
});

const OPERATIONS = new Set([
  "read-metadata", "write-metadata", "check-permission", "query-permission",
  "choose-directory", "list-folders", "create-folder", "delete-folder",
  "scan-files", "read-file", "write-file", "move-file", "rename-file",
  "trash-file", "restore-file", "delete-file", "empty-trash", "notify-subscriber",
  "abort-write", "open-handle-store", "access-handle-store",
]);

export function isFsaError(error, name) {
  // Older injected handles use an exact DOMException-name sentinel.
  return error?.name === name || (error?.name === "Error" && error.message === name);
}

function errorTypeOf(error) {
  return Object.keys(ERROR_CODES).find(name => isFsaError(error, name)) ?? "UnknownError";
}

export function reportFsaError(operation, error) {
  if (isFsaError(error, "AbortError") || isFsaError(error, "NotFoundError")) return;
  const errorType = errorTypeOf(error);
  console.warn("[WebFsaDriver] Operation failed", { operation: OPERATIONS.has(operation) ? operation : "unknown", errorType });
}

export function fsaFailure(operation, error) {
  reportFsaError(operation, error);
  return { ok: false, error: ERROR_CODES[errorTypeOf(error)] ?? "io_error",
    operation: OPERATIONS.has(operation) ? operation : "unknown" };
}

export async function fsaResult(operation, action) {
  try {
    return await action();
  } catch (error) {
    return fsaFailure(operation, error);
  }
}

export async function fsaRead(operation, action) {
  try {
    return await action();
  } catch (error) {
    const result = fsaFailure(operation, error);
    // Callers may log rejected errors. Do not carry native messages or causes
    // across this boundary: browsers can include private workspace names there.
    const safe = new Error(`File System Access ${result.operation} failed: ${result.error}`);
    safe.name = errorTypeOf(error);
    safe.code = result.error;
    safe.operation = result.operation;
    throw safe;
  }
}

/** Only absence is a successful availability probe. Permission/I/O errors propagate. */
export async function optionalFsaEntry(lookup) {
  try {
    return await lookup();
  } catch (error) {
    if (isFsaError(error, "NotFoundError")) return null;
    throw error;
  }
}

export async function writeFsaHandle(handle, bytes) {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes);
    await writable.close();
  } catch (error) {
    if (typeof writable.abort === "function") {
      try { await writable.abort(); }
      catch (abortError) { reportFsaError("abort-write", abortError); }
    }
    throw error;
  }
}
