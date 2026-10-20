/**
 * Cross-origin asset fetching for the service worker.
 *
 * The content script tries page-context fetch first because same-origin and
 * `blob:` URLs are only readable there. This worker is the fallback for CDN
 * URLs the page origin is not allowed to read.
 */

import { bytesToBase64 } from "./db_wire.js";

/**
 * Default ceiling for a fetched asset. Callers raise it for video, which is
 * an order of magnitude larger than a still and would otherwise be rejected
 * here after the whole clip had already been downloaded.
 */
const DEFAULT_MAX_BYTES = 12 * 1024 * 1024;
const EXTERNAL_MAX_BYTES = 128 * 1024 * 1024;
const INTERNAL_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".test",
  ".invalid",
  ".arpa",
  ".onion",
];

function externalAssetUrl(value) {
  if (typeof value !== "string") throw new Error("invalidAssetUrl");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalidAssetUrl");
  }
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  // URL canonicalizes alternate IPv4 spellings (hex, octal, integer) before
  // this check. Literal IPs and private-use DNS names are never valid CDN
  // targets for a hosted page asking the privileged worker to fetch an asset.
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !host.includes(".") ||
    /^[\d.]+$/.test(host) ||
    host.startsWith("[") ||
    INTERNAL_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    throw new Error("invalidAssetUrl");
  }
  return url.href;
}

async function readExternalAsset(response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > EXTERNAL_MAX_BYTES) {
    await response.body?.cancel();
    throw new Error("assetTooLarge");
  }
  if (!response.body) throw new Error("assetBodyUnavailable");

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (
      let result = await reader.read();
      !result.done;
      result = await reader.read()
    ) {
      const { value } = result;
      total += value.byteLength;
      if (total > EXTERNAL_MAX_BYTES) {
        await reader.cancel();
        throw new Error("assetTooLarge");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Fetches a remote asset and converts it to a data URL. */
export async function fetchAsDataUrl(
  url,
  maxBytes = DEFAULT_MAX_BYTES,
  options = {},
) {
  if (options.external) {
    // This path is reachable from externally_connectable pages. Keep its
    // limits independent of caller-supplied maxBytes and never send cookies.
    const safeUrl = externalAssetUrl(url);
    const response = await fetch(safeUrl, {
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok || response.redirected) {
      throw new Error(`HTTP ${response.status} while fetching asset`);
    }
    const bytes = await readExternalAsset(response);
    const type = response.headers.get("content-type") || "image/png";
    return `data:${type};base64,${bytesToBase64(bytes.buffer)}`;
  }
  if (typeof url === "string" && url.startsWith("data:")) {
    return url;
  }
  // Anonymous first: a signed CDN link is the common case and some hosts reject
  // the request outright once a cookie is attached. Cookie-gated assets are the
  // second attempt, and reading those is the one thing this worker can do that
  // the page context cannot.
  const attempt = (credentials) =>
    fetch(url, { credentials }).catch(() => null);
  let response = await attempt("omit");
  if (!response?.ok) response = await attempt("include");
  if (!response?.ok) {
    throw new Error(
      `HTTP ${response?.status ?? "network_error"} while fetching asset`,
    );
  }
  const blob = await response.blob();
  if (blob.size > maxBytes) {
    throw new Error(
      `Image is too large (${Math.round(blob.size / 1024 / 1024)}MB)`,
    );
  }
  const buffer = await blob.arrayBuffer();
  return `data:${blob.type || "image/png"};base64,${bytesToBase64(buffer)}`;
}
