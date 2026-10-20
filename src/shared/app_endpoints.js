/**
 * Hosted endpoints this app depends on, read from build-time env vars.
 *
 * The defaults keep the current hosted behaviour. A standalone build points
 * these at its own host through `.env` (VITE_MODEL_BASE_URL, VITE_APP_URL).
 */

const DEFAULT_MODEL_BASE_URL = "https://voo.run/models";
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
