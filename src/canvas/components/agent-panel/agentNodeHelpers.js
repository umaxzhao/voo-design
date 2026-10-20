import { getImageDataUrl } from "../../store/db.js";

export const AGENT_SPEED_STORAGE_KEY = "voo.agent.speed";
export const FAST_MAX_STEPS_PER_TURN = 3;

export function getStoredAgentSpeed() {
  try {
    return localStorage.getItem(AGENT_SPEED_STORAGE_KEY) === "fast"
      ? "fast"
      : "thinking";
  } catch {
    return "thinking";
  }
}

export function getNodeDisplayName(node, t = (k) => k) {
  if (!node) return "";
  if (node.data?.label) return node.data.label;
  if (node.data?.title) return node.data.title;
  switch (node.type) {
    case "imageAsset":
      return t("node.imageEditor.title");
    case "apiImage":
    case "generate":
      return t("node.apiImage.title");
    case "videoShot":
    case "apiVideo":
      return t("node.video.title");
    case "apiAudio":
      return t("node.audio.title");
    case "prompt":
      return t("node.prompt.title");
    case "storyboardPlan":
      return t("node.storyboard.title");
    case "combineVideo":
      return t("node.combineVideo.title");
    case "groupNode":
      return t("node.group.defaultLabel");
    case "model3d":
    case "apiModel3d":
      return t("node.mediaPreview.model3d");
    case "html":
      return t("node.mediaPreview.html");
    case "slides":
      return t("node.mediaPreview.slides");
    case "mediaPreview": {
      const mediaType =
        node.data?.mediaType || (node.data?.imageId ? "image" : null);
      switch (mediaType) {
        case "image":
          return t("node.mediaPreview.image");
        case "video":
          return t("node.mediaPreview.video");
        case "audio":
          return t("node.mediaPreview.audio");
        case "model3d":
          return t("node.mediaPreview.model3d");
        case "scene3d":
          return t("node.mediaPreview.scene3d");
        case "html":
          return t("node.mediaPreview.html");
        case "slides":
          return t("node.mediaPreview.slides");
        default:
          return t("node.mediaPreview.title");
      }
    }
    default:
      return node.type || node.id;
  }
}

export function getMediaCategory(node) {
  if (!node) return null;
  const type = node.type;
  if (type === "mediaPreview") {
    const mt = node.data?.mediaType || (node.data?.imageId ? "image" : null);
    if (
      [
        "image",
        "video",
        "audio",
        "model3d",
        "scene3d",
        "html",
        "slides",
      ].includes(mt)
    ) {
      return mt;
    }
    return null;
  }
  if (type === "imageAsset" || type === "apiImage" || type === "generate") {
    return "image";
  }
  if (type === "videoShot" || type === "apiVideo" || type === "combineVideo") {
    return "video";
  }
  if (type === "apiAudio") {
    return "audio";
  }
  if (type === "model3d" || type === "apiModel3d") {
    return "model3d";
  }
  if (type === "html") {
    return "html";
  }
  if (type === "slides") {
    return "slides";
  }
  return null;
}

export function assignMediaTags(nodes = [], t = (k, _params) => k) {
  const counts = {
    image: 0,
    video: 0,
    audio: 0,
    model3d: 0,
    scene3d: 0,
    html: 0,
    slides: 0,
  };

  return (nodes || []).map((node) => {
    if (!node) return { node, tag: null, category: null };
    const category = getMediaCategory(node);
    if (!category || counts[category] === undefined) {
      return { node, tag: null, category: null };
    }
    counts[category] += 1;
    const index = counts[category];
    const tag = t(`agent.mediaTag.${category}`, { index });
    return { node, tag, category, index };
  });
}

export function formatAttachmentEntry({ node, tag }, t = (k) => k) {
  const name = getNodeDisplayName(node, t);
  if (!tag) {
    return `"${name}" (id: ${node.id}, type: ${node.type})`;
  }
  const mediaType = getMediaCategory(node) || node.data?.mediaType || node.type;
  const meta = [mediaType];
  const title =
    node.data?.title ||
    node.data?.label ||
    (name && name !== node.type && name !== node.id ? name : null);
  if (title) {
    meta.push(`"${title}"`);
  }
  const w = node.data?.width ?? node.width;
  const h = node.data?.height ?? node.height;
  if (w && h) {
    meta.push(`${w}×${h}`);
  }
  return `${tag} = ${node.id} (${meta.join(", ")})`;
}

export function formatAttachmentsContext(nodes = [], t = (k) => k) {
  if (!nodes || nodes.length === 0) return "";
  const tagged = assignMediaTags(nodes, t);
  const parts = tagged.map((item) => formatAttachmentEntry(item, t));
  return `[Attachments: ${parts.join("; ")}]`;
}

export function getNodeThumbnail(node, images = {}, thumbnails = {}) {
  if (!node?.data) return null;
  const imageId = node.data.imageId;
  if (imageId) {
    if (thumbnails[imageId]) return thumbnails[imageId];
    if (images[imageId]) return images[imageId];
  }
  const results = node.data.results;
  if (Array.isArray(results) && results.length > 0) {
    const idx = node.data.selectedIndex ?? 0;
    const resultId = results[idx] || results[0];
    if (thumbnails[resultId]) return thumbnails[resultId];
    if (images[resultId]) return images[resultId];
  }
  if (node.data.imageUrl) return node.data.imageUrl;
  if (node.data.url) return node.data.url;
  if (node.data.src) return node.data.src;
  return null;
}

/**
 * The picture a node shows, as a data URL a model request can carry. The
 * store's images/thumbnails maps hold blob: object URLs, which only mean
 * something inside this renderer — sent as image_url they fail the request
 * ("Expected a valid URL"), so read the stored bytes by id instead.
 */
export async function getNodeImageDataUrl(node) {
  const data = node?.data;
  if (!data) return null;
  const results = Array.isArray(data.results) ? data.results : [];
  const imageId =
    data.imageId || results[data.selectedIndex ?? 0] || results[0];
  if (imageId) return (await getImageDataUrl(imageId)) ?? null;
  const url = data.imageUrl || data.url || data.src;
  return typeof url === "string" && /^(data:image\/|https:\/\/)/.test(url)
    ? url
    : null;
}
