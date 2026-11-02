/**
 * Hosted endpoints this app depends on, read from build-time env vars.
 *
 * The model default targets the editor's independently deployed static weights.
 * A standalone build points
 * these at its own host through `.env` (VITE_MODEL_BASE_URL, VITE_APP_URL).
 */

const DEFAULT_MODEL_BASE_URL = "https://voo.run/editor/models";
const DEFAULT_APP_URL = "https://voo.run";

function envValue(key) {
  return (typeof import.meta !== "undefined" && import.meta.env?.[key]) || "";
}

/** Base URL that model files are downloaded from, without a trailing slash. */
export const MODEL_BASE_URL = (envValue("VITE_MODEL_BASE_URL") || DEFAULT_MODEL_BASE_URL).replace(
  /\/+$/,
  "",
);

/** Public URL of this app, sent as the HTTP-Referer on provider requests. */
export const APP_URL = envValue("VITE_APP_URL") || DEFAULT_APP_URL;

/** Public stock search has no credentials and can be hosted by a standalone build. */
export const STOCK_SEARCH_URL = envValue("VITE_STOCK_SEARCH_URL") || "https://api.openverse.org/v1/images/";
export const COMMONS_SEARCH_URL = envValue("VITE_COMMONS_SEARCH_URL") || "https://commons.wikimedia.org/w/api.php";
