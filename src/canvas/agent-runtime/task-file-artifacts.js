/** Project file references carried by completed tool receipts. */

const FILE_EXTENSIONS = Object.freeze({
  html: [".html", ".htm"],
  pptx: [".ppt", ".pptx"],
  markdown: [".md", ".markdown"],
  mindmap: [".mm", ".xmind", ".opml"],
});

export const FILE_MEDIA_TYPES = Object.freeze(Object.keys(FILE_EXTENSIONS));

export function canonicalDeliverableType(mediaType) {
  return (
    {
      ppt: "pptx",
      slide: "slides",
      slides: "slides",
      md: "markdown",
    }[mediaType] ?? mediaType
  );
}

/** Never turn a model-supplied URL or an out-of-project path into an action. */
export function projectArtifactPath(artifact, projectRoot) {
  if (!artifact || artifact.saved !== true || !projectRoot) return null;
  const mediaType = canonicalDeliverableType(artifact.mediaType);
  const extensions = FILE_EXTENSIONS[mediaType];
  const path = artifact.path;
  if (!extensions || typeof path !== "string") return null;
  if (!extensions.some((extension) => path.toLowerCase().endsWith(extension))) {
    return null;
  }
  const normalize = (value) => value.replaceAll("\\", "/").replace(/\/+$/, "");
  const root = normalize(projectRoot);
  const file = normalize(path);
  if (!/^(\/|[A-Za-z]:\/)/.test(root) || !file.startsWith(`${root}/`)) {
    return null;
  }
  if (file.split("/").includes("..") || file.split("/").includes(".")) {
    return null;
  }
  return path;
}

export function receiptFileArtifacts(receipt, mediaType, projectRoot) {
  if (!["committed", "accepted", "pending_review"].includes(receipt.status)) {
    return [];
  }
  const artifacts = receipt.result?.artifacts;
  if (!Array.isArray(artifacts)) return [];
  return artifacts.flatMap((artifact) => {
    if (canonicalDeliverableType(artifact.mediaType) !== mediaType) return [];
    const path = projectArtifactPath(artifact, projectRoot);
    if (!path || typeof artifact.id !== "string" || !artifact.id) return [];
    return [
      {
        key: `file:${artifact.id}`,
        name: path.replaceAll("\\", "/").split("/").at(-1),
        path,
        id: artifact.id,
      },
    ];
  });
}
