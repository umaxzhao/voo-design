/**
 * The `.voo` editor file's shape and its validation, free of `electron` so it
 * can be tested under plain node.
 *
 * A `.voo` file is one picture-editor node the way a PSD is one document:
 * the editor document (layers, regions, transforms, mask references) plus
 * the image bytes every layer references, embedded as data URLs so the file
 * is self-contained and survives a move between machines.
 */

export const VOO_FILE_FORMAT = "voo-editor";
export const VOO_FILE_VERSION = 2;
export const VOO_SUPPORTED_VERSIONS = Object.freeze([1, 2]);
export const VOO_KINDS = Object.freeze(["design", "clip", "model3d"]);

/** Returns a minimal valid document structure for the given kind. */
export function defaultDocumentForKind(kind = "design") {
  if (kind === "clip") {
    return {
      timeline: { tracks: [] },
      overlays: [],
      audioTracks: [],
      backgroundColor: "#000000",
      canvasWidth: 1920,
      canvasHeight: 1080,
    };
  }
  if (kind === "model3d") {
    return {
      format: "glb",
      nodes: [],
      materials: [],
      settings: {},
    };
  }
  return {
    version: 1,
    width: 1024,
    height: 1024,
    backgroundColor: "#000000",
    nodes: [],
  };
}

/** A minimal valid document, for callers that only need the shape. */
export function emptyVooFile(document = null, kind = "design") {
  return {
    format: VOO_FILE_FORMAT,
    version: VOO_FILE_VERSION,
    kind,
    document: document ?? defaultDocumentForKind(kind),
    assets: {},
  };
}

/**
 * Accepts a value as a valid `.voo` file (supports both v1 and v2 envelopes).
 *
 * The document is trusted wholesale once it is shaped right — the editor's
 * own deserialiser normalises the node list — so this checks the envelope:
 * the format marker, a supported version (1 or 2), a document object, and
 * an assets/images map whose values look like data URLs.
 * In v2, `kind` must be one of "design", "clip", or "model3d".
 * `preview` is optional: a flattened picture the canvas can show on the node
 * without opening the document.
 */
export function isValidVooFile(value) {
  if (!value || typeof value !== "object") return false;
  if (value.format !== VOO_FILE_FORMAT) return false;
  if (
    typeof value.version !== "number" ||
    !VOO_SUPPORTED_VERSIONS.includes(value.version)
  ) {
    return false;
  }
  if (!value.document || typeof value.document !== "object") return false;

  // v1 envelope: images map is required; kind is optional (implicitly "design")
  if (value.version === 1) {
    if (!value.images || typeof value.images !== "object") return false;
    if (
      !Object.values(value.images).every(
        (dataUrl) => typeof dataUrl === "string" && dataUrl.startsWith("data:"),
      )
    ) {
      return false;
    }
  }

  // v2 envelope: kind is required ("design" | "clip" | "model3d"); assets (or images fallback) is required
  if (value.version === 2) {
    if (!VOO_KINDS.includes(value.kind)) return false;
    const assets = value.assets ?? value.images;
    if (!assets || typeof assets !== "object") return false;
    if (
      !Object.values(assets).every(
        (dataUrl) => typeof dataUrl === "string" && dataUrl.startsWith("data:"),
      )
    ) {
      return false;
    }
  }

  // Ensure any declared assets and images maps contain only valid data URLs
  if (value.assets && typeof value.assets === "object") {
    if (
      !Object.values(value.assets).every(
        (dataUrl) => typeof dataUrl === "string" && dataUrl.startsWith("data:"),
      )
    ) {
      return false;
    }
  }
  if (value.images && typeof value.images === "object") {
    if (
      !Object.values(value.images).every(
        (dataUrl) => typeof dataUrl === "string" && dataUrl.startsWith("data:"),
      )
    ) {
      return false;
    }
  }

  if (
    value.preview !== undefined &&
    (typeof value.preview !== "string" || !value.preview.startsWith("data:"))
  ) {
    return false;
  }

  return true;
}

function designAssetIds(document) {
  const ids = new Set();
  const scan = (nodes) => {
    for (const node of nodes ?? []) {
      if (node?.kind === "image" && typeof node.imageId === "string") {
        ids.add(node.imageId);
      }
      if (node?.maskId && typeof node.maskId === "string") {
        ids.add(node.maskId);
      }
      if (typeof node?.assetId === "string") {
        ids.add(node.assetId);
      }
    }
  };
  scan(document?.nodes);
  if (Array.isArray(document?.pages)) {
    for (const page of document.pages) {
      const pageDoc = page?.sceneDoc || page?.document || page;
      scan(pageDoc?.nodes);
    }
  }
  return [...ids];
}

function clipAssetIds(document) {
  const ids = new Set();
  if (Array.isArray(document?.timeline?.tracks)) {
    for (const track of document.timeline.tracks) {
      for (const clip of track?.clips ?? track?.items ?? []) {
        if (typeof clip?.assetId === "string") ids.add(clip.assetId);
        if (
          typeof clip?.nodeId === "string" &&
          clip.nodeId.startsWith("audio-")
        ) {
          ids.add(clip.nodeId);
        }
      }
    }
  }
  if (Array.isArray(document?.timeline?.clips)) {
    for (const clip of document.timeline.clips) {
      if (typeof clip?.assetId === "string") ids.add(clip.assetId);
    }
  }
  if (Array.isArray(document?.clips)) {
    for (const clip of document.clips) {
      if (typeof clip?.assetId === "string") ids.add(clip.assetId);
    }
  }
  if (Array.isArray(document?.overlays)) {
    for (const overlay of document.overlays) {
      if (typeof overlay?.pipAssetId === "string") ids.add(overlay.pipAssetId);
      if (typeof overlay?.assetId === "string") ids.add(overlay.assetId);
      if (typeof overlay?.imageId === "string") ids.add(overlay.imageId);
    }
  }
  if (Array.isArray(document?.audioTracks)) {
    for (const audio of document.audioTracks) {
      const assetId = audio?.assetId ?? audio?.id;
      if (typeof assetId === "string") ids.add(assetId);
    }
  }
  return [...ids];
}

function model3dAssetIds(document) {
  const ids = new Set();
  if (typeof document?.modelAssetId === "string") ids.add(document.modelAssetId);
  if (typeof document?.assetId === "string") ids.add(document.assetId);
  if (typeof document?.previewAssetId === "string") ids.add(document.previewAssetId);
  if (Array.isArray(document?.textures)) {
    for (const tex of document.textures) {
      if (typeof tex === "string") ids.add(tex);
      else if (typeof tex?.assetId === "string") ids.add(tex.assetId);
      else if (typeof tex?.id === "string") ids.add(tex.id);
    }
  } else if (document?.textures && typeof document.textures === "object") {
    for (const val of Object.values(document.textures)) {
      if (typeof val === "string") ids.add(val);
      else if (typeof val?.assetId === "string") ids.add(val.assetId);
    }
  }
  if (Array.isArray(document?.materials)) {
    for (const mat of document.materials) {
      for (const key of [
        "mapAssetId",
        "normalMapAssetId",
        "roughnessMapAssetId",
        "metalnessMapAssetId",
        "aoMapAssetId",
        "textureId",
        "assetId",
      ]) {
        if (typeof mat?.[key] === "string") ids.add(mat[key]);
      }
    }
  }
  if (Array.isArray(document?.nodes)) {
    for (const node of document.nodes) {
      if (typeof node?.assetId === "string") ids.add(node.assetId);
      if (typeof node?.modelAssetId === "string") ids.add(node.modelAssetId);
      if (typeof node?.textureId === "string") ids.add(node.textureId);
    }
  }
  return [...ids];
}

/** The editor document's asset/image ids — the ones the file must carry bytes for. */
export function imageIdsOfDocument(
  document,
  kind = document?.kind ?? "design",
) {
  if (kind === "clip") return clipAssetIds(document);
  if (kind === "model3d") return model3dAssetIds(document);
  return designAssetIds(document);
}

export const assetIdsOfDocument = imageIdsOfDocument;
