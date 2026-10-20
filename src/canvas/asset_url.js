/**
 * Base-aware URL for files shipped in the build's public directory.
 *
 * The extension build serves them from the origin root (base "/"); the hosted
 * web build serves them under "/editor/". `import.meta.env.BASE_URL` carries
 * each build's base, so the same source produces the right URL in both.
 */
export function assetUrl(name) {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}${name}`;
}
