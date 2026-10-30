import { STOCK_SEARCH_URL, COMMONS_SEARCH_URL } from "../../shared/app_endpoints.js";
import { TOOL_ERROR, toolError } from "./canvas-asset-shared.js";
const STOCK_REQUEST_TIMEOUT_MS = 6000;
async function fetchJson(fetchImpl, url, signal, timeoutMs) {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const cancel = () => controller.abort(signal.reason);
  signal?.addEventListener("abort", cancel, {
    once: true
  });
  const timer = setTimeout(() => controller.abort(new Error("Stock request timed out")), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
function plainText(value) {
  if (typeof DOMParser === "function") {
    return new DOMParser().parseFromString(String(value ?? ""), "text/html").body.textContent ?? "";
  }
  return String(value ?? "").replace(/<[^>]*>/g, "");
}

/** Keep the public stock tool usable when its primary search index is unavailable. */
export async function searchStock(query, count, {
  fetch: fetchImpl,
  signal,
  timeoutMs = STOCK_REQUEST_TIMEOUT_MS
}) {
  const warnings = [];
  const primary = new URL(STOCK_SEARCH_URL);
  primary.search = new URLSearchParams({
    q: query,
    page_size: String(count),
    license_type: "all",
    mature: "false"
  });
  try {
    const payload = await fetchJson(fetchImpl, primary.href, signal, timeoutMs);
    const results = (payload.results ?? []).filter(item => item?.url || item?.thumbnail);
    if (results.length) return {
      results: results.slice(0, count),
      warnings,
      source: "openverse"
    };
    warnings.push({
      source: "openverse",
      reason: "No results"
    });
  } catch (error) {
    signal?.throwIfAborted();
    warnings.push({
      source: "openverse",
      reason: error.message
    });
  }
  const fallback = new URL(COMMONS_SEARCH_URL);
  fallback.search = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: "6",
    gsrlimit: String(count),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
    format: "json",
    origin: "*"
  });
  try {
    const payload = await fetchJson(fetchImpl, fallback.href, signal, timeoutMs);
    if (payload.error) throw new Error(payload.error.info ?? payload.error.code);
    const results = Object.values(payload.query?.pages ?? {}).map(page => {
      const image = page.imageinfo?.[0] ?? {},
        metadata = image.extmetadata ?? {};
      return {
        url: image.thumburl ?? image.url,
        title: page.title?.replace(/^File:/, ""),
        creator: plainText(metadata.Artist?.value),
        license: plainText(metadata.LicenseShortName?.value),
        foreign_landing_url: image.descriptionurl
      };
    }).filter(item => item.url && /(?:^CC|public domain|^PD)/i.test(item.license));
    if (!results.length) throw new Error("No openly licensed bitmap results");
    return {
      results,
      warnings,
      source: "wikimedia-commons"
    };
  } catch (error) {
    signal?.throwIfAborted();
    throw toolError(TOOL_ERROR.STOCK_UNAVAILABLE, `Stock search failed: ${warnings.map(item => `${item.source}: ${item.reason}`).join("; ")}; Wikimedia Commons: ${error.message}`);
  }
}
