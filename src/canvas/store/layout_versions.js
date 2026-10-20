/** Keeps the newest N generated versions around for switching. */
export const MAX_LAYOUT_VERSIONS = 12;

/** Stable, privacy-preserving provenance for generated layout versions. */
export function createLayoutProvenance({
  model = null,
  providerId = null,
  prompt = "",
  operation = "generate",
} = {}) {
  let hash = 2166136261;
  for (const char of String(prompt)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return {
    operation,
    model: model || null,
    providerId: providerId || null,
    promptDigest: `fnv1a-${(hash >>> 0).toString(16)}`,
    createdAt: Date.now(),
  };
}

export function getLayoutVersionProvenance(version) {
  return version?.provenance && typeof version.provenance === "object"
    ? version.provenance
    : null;
}

/** The HTML a node should re-parse: selected version first, then the latest. */
export function layoutHtmlOf(node) {
  const versions = Array.isArray(node?.data?.layoutVersions)
    ? node.data.layoutVersions
    : [];
  const selected = versions.find(
    (version) => version.id === node.data.selectedLayoutVersionId,
  );
  return selected?.html ?? node?.data?.layoutHtml ?? "";
}

/**
 * Appends a new layout version snapshot and clamps the history length to max.
 */
export function appendLayoutVersion(
  versions,
  version,
  max = MAX_LAYOUT_VERSIONS,
) {
  const current = Array.isArray(versions) ? versions : [];
  return [...current, version].slice(-max);
}
