/**
 * Web search client — free, no-key design-inspiration search.
 *
 * Design agents need visual references, not news. Two free sources, no API
 * key required:
 *
 *  - Openverse API (https://api.openverse.org): CC-licensed image search,
 *    CORS-open (Access-Control-Allow-Origin: *) so the hosted editor can call
 *    it straight from the browser.
 *  - Behance search page (https://www.behance.net/search/projects): server
 *    rendered HTML listing design projects. Behance sends no CORS header, so
 *    this source is reachable from the desktop main process and the extension
 *    background, and silently skipped in the hosted browser.
 *
 * Pinterest is not scrapable (SPA) and is intentionally not included.
 */

export const SEARCH_UNAVAILABLE = "SEARCH_UNAVAILABLE";

const OPENVERSE_API = "https://api.openverse.org/v1/images/";
const BEHANCE_SEARCH = "https://www.behance.net/search/projects";

/**
 * Openverse CC image search. Works from any origin (CORS-open).
 *
 * @returns {Promise<Array<{title, url, imageUrl, creator, license, source}>>}
 */
async function searchOpenverse(query, maxResults) {
  const url = `${OPENVERSE_API}?q=${encodeURIComponent(query)}&page_size=${maxResults}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.results ?? []).map((item) => ({
    title: item.title || "Untitled",
    url: item.foreign_landing_url || item.url || "",
    imageUrl: item.url || "",
    creator: item.creator || "",
    license: item.license || "",
    source: "openverse",
  }));
}

/**
 * Behance project search — server-rendered HTML. No CORS header, so only
 * reachable where the fetch bypasses CORS (desktop main process, extension
 * background); the hosted browser's fetch throws and we skip it.
 *
 * @returns {Promise<Array<{title, url, source}>>}
 */
async function searchBehance(query, maxResults) {
  const res = await fetch(
    `${BEHANCE_SEARCH}?search=${encodeURIComponent(query)}`,
    {
      headers: {
        // A plain browser UA keeps the SSR page from being shaped for a bot.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
  );
  if (!res.ok) return [];
  const html = await res.text();

  const results = [];
  const galleryRe =
    /href="(\/gallery\/\d+[^"]*)"[^>]*>[\s\S]*?"name":"([^"]{3,120})"/g;
  let m;
  while ((m = galleryRe.exec(html)) && results.length < maxResults) {
    const url = `https://www.behance.net${m[1].split("?")[0]}`;
    const title = m[2];
    if (!results.some((r) => r.url === url)) {
      results.push({ title, url, source: "behance" });
    }
  }
  return results;
}

/**
 * Searches design-inspiration sources. Openverse always runs; Behance only
 * where CORS permits. Both failing yields SEARCH_UNAVAILABLE.
 *
 * @param {object} args
 * @param {string} args.query
 * @param {number} [args.maxResults]
 * @returns {Promise<{ok: boolean, code?: string, results?: Array}>}
 */
export async function webSearch({ query, maxResults = 5 } = {}) {
  if (!query || !query.trim()) {
    return { ok: false, code: "EMPTY_QUERY", results: [] };
  }
  const limit = Math.min(8, Math.max(1, Number(maxResults) || 5));
  const results = [];

  try {
    results.push(...(await searchOpenverse(query, limit)));
  } catch {
    // Openverse down — continue with Behance if it works.
  }
  try {
    results.push(...(await searchBehance(query, limit)));
  } catch {
    // Behance unreachable (hosted browser CORS) — Openverse results stand.
  }

  if (results.length === 0) {
    return { ok: false, code: SEARCH_UNAVAILABLE, results: [] };
  }
  return { ok: true, results };
}
