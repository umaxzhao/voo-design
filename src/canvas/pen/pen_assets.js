/**
 * Pen `.pen` assets: the image bitmaps a document references, and how their
 * relative URLs are turned into data URLs the editor can store.
 *
 * A Pen image fill points at a file next to the `.pen` document
 * (`./image.jpg`, `images/logo.png`) or embeds the bytes inline as a data URL.
 * Only those two forms are read. Network URLs are never fetched silently — the
 * importer reports them and skips the fill — and nothing outside the document's
 * own folder is opened, so a crafted `.pen` cannot walk the filesystem.
 *
 * Every failure is recorded as a warning and skipped: one missing picture must
 * not stop the rest of the document from importing.
 */

const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const DATA_URL_PATTERN = /^data:/i;

/** Node types whose fills can reference an external asset. */
export function collectPenAssetRefs(document) {
  const refs = new Map();
  const add = (url, kind) => {
    if (typeof url !== "string") return;
    const trimmed = url.trim();
    if (!trimmed || refs.has(trimmed)) return;
    refs.set(trimmed, kind);
  };
  const walk = (children) => {
    for (const child of children ?? []) {
      if (!child || typeof child !== "object") continue;
      for (const key of ["fill", "stroke"]) {
        const value = child[key];
        if (value == null) continue;
        for (const entry of Array.isArray(value) ? value : [value]) {
          if (!entry || typeof entry !== "object") continue;
          if (entry.type === "image") add(entry.url, "image");
          else if (entry.type === "shader") add(entry.url, "shader");
        }
      }
      if (child.type === "script" && typeof child.scriptUri === "string") {
        add(child.scriptUri, "script");
      }
      if (Array.isArray(child.children)) walk(child.children);
    }
  };
  walk(document?.children ?? []);
  return [...refs].map(([url, kind]) => ({ url, kind }));
}

/** The MIME type of a byte stream, by its signature. */
export function sniffAssetMime(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4) return "application/octet-stream";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
  if (head.startsWith("<svg") || head.startsWith("<?xml")) return "image/svg+xml";
  return "application/octet-stream";
}

function bytesToBase64(bytes) {
  if (typeof btoa === "function") {
    const chunkSize = 0x8000;
    let binary = "";
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return btoa(binary);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  throw new Error("base64-unavailable");
}

/** Wraps asset bytes as a `data:` URL. */
export function bytesToDataUrl(bytes, mime = null) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return `data:${mime ?? sniffAssetMime(view)};base64,${bytesToBase64(view)}`;
}

/** A host value (Blob / ArrayBuffer / File / string) as a data URL, or null. */
async function toDataUrl(value) {
  if (typeof value === "string") {
    return DATA_URL_PATTERN.test(value.trim()) ? value.trim() : null;
  }
  if (value == null || typeof value !== "object") return null;
  if (typeof value.arrayBuffer === "function") {
    const buffer = await value.arrayBuffer();
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return bytesToDataUrl(bytes, typeof value.type === "string" && value.type ? value.type : null);
  }
  if (value instanceof ArrayBuffer) return bytesToDataUrl(new Uint8Array(value));
  if (value instanceof Uint8Array) return bytesToDataUrl(value);
  return null;
}

/** A resource URL decoded for the host: no query/hash, percent escapes resolved. */
function relativePathOf(url) {
  const trimmed = url.trim();
  const withoutQuery = trimmed.replace(/[?#].*$/, "");
  let decoded = withoutQuery;
  try {
    decoded = decodeURIComponent(withoutQuery);
  } catch {
    // Keep the raw spelling when it is not valid percent-encoding.
  }
  return decoded.replace(/^\.\//, "");
}

function isSafeRelativePath(path) {
  if (!path || path.startsWith("/") || path.startsWith("\\")) return false;
  if (SCHEME_PATTERN.test(path)) return false;
  const parts = path.split(/[/\\]+/);
  return !parts.includes("..");
}

function dirnameOf(filePath) {
  const normalized = String(filePath).replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return index <= 0 ? normalized : normalized.slice(0, index);
}

/**
 * Reads every referenced asset and resolves it to a data URL.
 *
 * Host resolution order:
 *  1. an explicit `readSibling(relativeUrl)` callback (tests, custom hosts);
 *  2. a directory handle for web builds opened through the File System API;
 *  3. Electron's `readFileBytes` beside an opened `filePath`.
 *
 * Returns `{ assets, warnings }`; `assets` maps the original URL to its data
 * URL, and warnings are `{ message, count }` entries.
 */
export async function resolvePenAssets(refs, options = {}) {
  const {
    filePath = null,
    dirHandle = null,
    fileHandle = null,
    readSibling = null,
    electronAPI = typeof window !== "undefined" ? window.electronAPI : null,
  } = options;
  const assets = new Map();
  const warnings = new Map();
  const note = (message) => warnings.set(message, (warnings.get(message) ?? 0) + 1);

  for (const { url, kind } of Array.isArray(refs) ? refs : []) {
    if (typeof url !== "string" || !url.trim()) continue;
    // Script sources are recorded (the caller reports the unsupported node) but
    // never read: nothing in the editor executes or embeds them.
    if (kind === "script") continue;
    const trimmed = url.trim();
    if (DATA_URL_PATTERN.test(trimmed)) {
      assets.set(url, trimmed);
      continue;
    }
    if (SCHEME_PATTERN.test(trimmed)) {
      // http(s):, file:, ftp: … — never fetched silently.
      note(`network-asset:${trimmed}`);
      continue;
    }
    const relative = relativePathOf(trimmed);
    if (!isSafeRelativePath(relative)) {
      note(`unsafe-asset-path:${trimmed}`);
      continue;
    }
    try {
      const value = await readAssetBytes({
        relative,
        original: trimmed,
        filePath,
        dirHandle,
        fileHandle,
        readSibling,
        electronAPI,
      });
      const dataUrl = await toDataUrl(value);
      if (!dataUrl) {
        note(`unresolved-asset:${trimmed}`);
        continue;
      }
      assets.set(url, dataUrl);
    } catch (error) {
      note(`asset-read-failed:${trimmed}`);
    }
  }

  return {
    assets,
    warnings: [...warnings].map(([message, count]) => ({ message, count })),
  };
}

async function readAssetBytes({
  relative,
  original,
  filePath,
  dirHandle,
  fileHandle,
  readSibling,
  electronAPI,
}) {
  if (typeof readSibling === "function") {
    return readSibling(relative, { url: original });
  }
  if (dirHandle && typeof dirHandle.getFileHandle === "function") {
    const segments = relative.split(/[/\\]+/).filter(Boolean);
    let directory = dirHandle;
    for (const segment of segments.slice(0, -1)) {
      if (typeof directory.getDirectoryHandle !== "function") return null;
      directory = await directory.getDirectoryHandle(segment);
    }
    const handle = await directory.getFileHandle(segments[segments.length - 1]);
    return handle.getFile();
  }
  if (filePath && electronAPI?.readFileBytes) {
    const target = `${dirnameOf(filePath)}/${relative}`;
    return electronAPI.readFileBytes(target);
  }
  // A picked file handle gives no way to reach its siblings; the caller can
  // still pass `readSibling` when it has a directory scope.
  if (fileHandle) return null;
  return null;
}
