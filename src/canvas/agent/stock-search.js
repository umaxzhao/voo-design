import { STOCK_SEARCH_URL, COMMONS_SEARCH_URL } from "../../shared/app_endpoints.js";
import { TOOL_ERROR, toolError } from "./canvas-asset-shared.js";
async function fetchJson(fetchImpl, url, signal) {
  signal?.throwIfAborted();
  const response = await fetchImpl(url, {
    signal,
    headers: {
      Accept: "application/json"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
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
  signal
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
    const payload = await fetchJson(fetchImpl, primary.href, signal);
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
    const payload = await fetchJson(fetchImpl, fallback.href, signal);
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
