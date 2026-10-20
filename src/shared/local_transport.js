/**
 * The one way this codebase talks to a local inference backend, plus the one
 * way the desktop renderer talks to whitelisted remote hosts.
 *
 * A request to `http://127.0.0.1:1234` is not an ordinary fetch, because the
 * three shells this app ships in each break it differently:
 *
 * - **Desktop (Electron).** A loopback server that sends no CORS headers is
 *   refused to a renderer-side fetch before it is answered. Main-process requests are not subject to CORS at all, so the
 *   desktop path hops through IPC.
 * - **Extension.** Works directly, on the strength of a `127.0.0.1`
 *   host permission in the manifest.
 * - **Hosted page (https://voo.run).** Cannot work, ever: mixed-content
 *   blocking kills an http request from an https page and no header opts out
 *   of it. `localBackendReachability` says so up front rather than letting
 *   the user discover it as a failed generation.
 *
 * Remote requests (`remoteRequest`) have the mirror-image problem: the
 * desktop renderer's `voo://app` origin is trusted by no remote API, so they
 * hop through the main process's `voo:net-request` proxy — whitelisted and
 * header-filtered there — and keep plain fetch everywhere else.
 *
 * Everything returns bytes-or-json through one shape so the clients above do
 * not have to care which shell they are running in.
 */

/** Hosts a local backend may live on. Anything else is not "local". */
const LOOPBACK_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
  "[::1]",
  "0.0.0.0",
]);

/** True when a URL points at this machine. */
export function isLoopbackUrl(url) {
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Whether local backends can be reached from this shell at all, and why not.
 *
 * @returns {{ok: boolean, reason: string|null}} `reason` is an i18n key.
 */
export function localBackendReachability() {
  if (typeof window === "undefined") return { ok: true, reason: null };
  if (window.vooDesktop?.localBackend?.request)
    return { ok: true, reason: null };
  // An https page cannot reach http://127.0.0.1 — mixed content, no override.
  if (window.location?.protocol === "https:") {
    return { ok: false, reason: "localBackend.blockedByHttps" };
  }
  return { ok: true, reason: null };
}

/** Trailing slashes make `${base}/path` produce `//path`, which servers 404. */
export function normaliseEndpoint(url) {
  return String(url ?? "")
    .trim()
    .replace(/\/+$/, "");
}

export class LocalBackendError extends Error {
  /**
   * @param {string} code an i18n key, not prose — the UI decides the wording.
   * @param {object} [detail] anything worth logging alongside it.
   */
  constructor(code, detail) {
    super(code);
    this.name = "LocalBackendError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * One request to a local backend.
 *
 * @param {string} url absolute, loopback-only.
 * @param {object} [options]
 * @param {"GET"|"POST"} [options.method]
 * @param {object} [options.json] body to send as JSON.
 * @param {"json"|"bytes"} [options.expect] how to read the response.
 * @param {number} [options.timeoutMs]
 * @returns {Promise<object|Uint8Array>}
 */
export async function localRequest(url, options = {}) {
  const {
    method = "GET",
    json = null,
    expect = "json",
    timeoutMs = 30000,
    fetch: fetchImpl,
  } = options;

  // Refuse anything that is not this machine. The renderer can name any URL it
  // likes, and the desktop path runs it in the main process with no origin
  // policy of its own — so the check belongs here, before either path is taken.
  if (!isLoopbackUrl(url))
    throw new LocalBackendError("localBackend.notLoopback", { url });

  const reachability = localBackendReachability();
  if (!reachability.ok)
    throw new LocalBackendError(reachability.reason, { url });

  const bridge =
    typeof window !== "undefined"
      ? window.vooDesktop?.localBackend?.request
      : null;
  if (bridge && !fetchImpl)
    return viaDesktop(bridge, { url, method, json, expect, timeoutMs });
  return viaFetch({
    url,
    method,
    json,
    expect,
    timeoutMs,
    fetch: fetchImpl,
  });
}

/** Desktop: the main process performs it and hands back a plain object. */
async function viaDesktop(bridge, request) {
  const result = await bridge(request);
  if (!result?.ok) {
    throw new LocalBackendError(
      result?.code ?? "localBackend.unreachable",
      result?.detail,
    );
  }
  // Bytes cross IPC as base64; structured clone of a Uint8Array is possible but
  // the buffers here are whole PNGs and base64 keeps the channel plain JSON.
  if (request.expect === "bytes") return base64ToBytes(result.base64);
  return result.json;
}

/** Extension and local dev: an ordinary fetch, with a timeout that fires. */
async function viaFetch({
  url,
  method,
  json,
  expect,
  timeoutMs,
  fetch: fetchImpl = globalThis.fetch,
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    const doFetch = fetchImpl || globalThis.fetch;
    response = await doFetch(url, {
      method,
      signal: controller.signal,
      headers: json ? { "Content-Type": "application/json" } : undefined,
      body: json ? JSON.stringify(json) : undefined,
    });
  } catch (error) {
    // A refused connection and an aborted one are the same story to the user:
    // nothing is listening there right now.
    throw new LocalBackendError("localBackend.unreachable", {
      url,
      cause: String(error),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new LocalBackendError("localBackend.httpError", {
      url,
      status: response.status,
      body: await response.text().catch(() => ""),
    });
  }
  if (expect === "bytes") return new Uint8Array(await response.arrayBuffer());
  return response.json();
}

function base64ToBytes(base64) {
  const binary = atob(base64 ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Wraps raw image bytes as a data URL, the shape the canvas nodes consume. */
export function bytesToDataUrl(bytes, mimeType = "image/png") {
  let binary = "";
  // Chunked because `String.fromCharCode(...bytes)` blows the argument limit
  // on anything larger than a thumbnail.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

/**
 * Remote hosts the renderer may ask the desktop's net proxy for. Mirrors
 * `PROXY_ALLOWED_HOSTS` in electron/local_app.js — the main process enforces
 * its own copy, this one only fails fast so a bad URL never crosses IPC.
 * The two lists must change together.
 */
const REMOTE_ALLOWED_HOSTS = new Set([
  "voo.run",
  "ai.api.uiodesign.com",
  "api.302.ai",
  "dashscope.aliyuncs.com",
  "api.deepseek.com",
  "images.pexels.com",
  "videos.pexels.com",
]);

/**
 * Renderer-side pre-check for `remoteRequest`: plain https, no embedded
 * credentials, whitelisted host. The authoritative guard is the main
 * process's; a renderer can lie, so this exists only to fail cheaply.
 */
export function isAllowedRemoteUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return false;
    }
    const hostname = parsed.hostname;
    if (REMOTE_ALLOWED_HOSTS.has(hostname)) return true;
    if (
      /^(?:[a-z0-9-]+\.)+qiniup\.com$/.test(hostname) ||
      /^(?:[a-z0-9-]+\.)+qbox\.me$/.test(hostname) ||
      /^(?:[a-z0-9-]+\.)+uiodesign\.com$/.test(hostname) ||
      /^(?:[a-z0-9-]+\.)+aliyuncs\.com$/.test(hostname)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export class RemoteRequestError extends Error {
  /**
   * @param {string} code an i18n key, not prose — the UI decides the wording.
   * @param {object} [detail] anything worth logging alongside it.
   */
  constructor(code, detail) {
    super(code);
    this.name = "RemoteRequestError";
    this.code = code;
    this.detail = detail;
  }
}

/**
 * One request to a whitelisted remote host.
 *
 * @param {string} url absolute, https, whitelisted — see isAllowedRemoteUrl.
 * @param {object} [options]
 * @param {"GET"|"POST"} [options.method]
 * @param {object} [options.json] body to send as JSON.
 * @param {"json"|"text"|"bytes"} [options.expect] how to read the response.
 * @param {number} [options.timeoutMs]
 * @returns {Promise<object|string|Uint8Array>}
 */
export async function remoteRequest(url, options = {}) {
  const {
    method = "GET",
    json = null,
    expect = "json",
    timeoutMs = 30000,
  } = options;

  if (!isAllowedRemoteUrl(url))
    throw new RemoteRequestError("remoteRequest.urlNotAllowed", { url });

  const desktop =
    typeof window !== "undefined" ? (window.vooDesktop ?? null) : null;

  // The main process answers with no origin policy and enforces the real
  // whitelist — the desktop path never touches the network directly.
  if (desktop?.netRequest) {
    const result = await desktop.netRequest({
      url,
      method,
      headers: json ? { "Content-Type": "application/json" } : undefined,
      body: json ? JSON.stringify(json) : undefined,
      expect: expect === "bytes" ? "bytes" : "text",
      timeoutMs,
    });
    if (!result?.ok) {
      throw new RemoteRequestError(result?.error ?? "proxyNetworkError", {
        url,
        status: result?.status,
      });
    }
    if (expect === "bytes") return base64ToBytes(result.base64);
    if (expect === "json") return parseRemoteJson(result.bodyText, url);
    return result.bodyText;
  }

  // The older bridge carries GET JSON only, but that covers catalogs.
  if (desktop?.fetchJson && method === "GET" && !json && expect === "json") {
    const result = await desktop.fetchJson(url);
    if (!result?.ok) {
      throw new RemoteRequestError("remoteRequest.httpError", {
        url,
        status: result?.status,
      });
    }
    return result.data;
  }

  return viaRemoteFetch({ url, method, json, expect, timeoutMs });
}

/** Extension and hosted page: an ordinary fetch, with a timeout that fires. */
async function viaRemoteFetch({ url, method, json, expect, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: json ? { "Content-Type": "application/json" } : undefined,
      body: json ? JSON.stringify(json) : undefined,
    });
  } catch (error) {
    throw new RemoteRequestError("remoteRequest.unreachable", {
      url,
      cause: String(error),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new RemoteRequestError("remoteRequest.httpError", {
      url,
      status: response.status,
    });
  }
  if (expect === "bytes") return new Uint8Array(await response.arrayBuffer());
  if (expect === "text") return response.text();
  return response.json();
}

function parseRemoteJson(bodyText, url) {
  try {
    return JSON.parse(bodyText);
  } catch {
    throw new RemoteRequestError("remoteRequest.badJson", { url });
  }
}
