/** Beta editor chrome is enabled only by an explicit local/test build.
 * Release beta-off takes precedence over a packaged local renderer.
 * Never infer it from the URL: packaged desktop apps also use localhost.
 */
export function resolveEditorBetaFeatures({
  development = false,
  localEditor,
  beta,
} = {}) {
  if (development === true) return true;
  if (beta === "0") return false;
  return localEditor === "1" || beta === "1";
}

/** Preserve local testing by default, but retain an explicit release override. */
export function resolveEditorBetaBuildFlag({ beta, localEditor } = {}) {
  return beta ?? (localEditor === "1" ? "1" : "0");
}

export const EDITOR_BETA_ENABLED = resolveEditorBetaFeatures({
  development: import.meta.env?.DEV,
  localEditor: import.meta.env?.VITE_LOCAL_EDITOR,
  beta: import.meta.env?.VITE_EDITOR_BETA,
});
