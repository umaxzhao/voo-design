// Shared streaming, image, and canvas-size helpers for layout actions.
import { streamCodexCompletion } from "../components/agent-panel/codex_transport.js";
import { DEFAULT_AGENT_MODEL } from "../../shared/agent-defaults.js";
import { parseCliModelId } from "../../shared/providers/provider_cli.js";

import { layoutCanvasSize } from "../layout_geometry.js";
import { dataUrlToBlob, getImageBlobMap, putImage } from "./db.js";
import { API_MEDIA_TYPE, PROVIDER_ID } from "../../shared/providers.js";
import {
  fetchAssetDataUrl,
  streamProviderText,
  submitProviderJob,
} from "../provider_client.js";
import { StreamingLayoutFilter } from "../editor/html_import.js";

export { StreamingLayoutFilter };

/**
 * AI layout generation for Design (image editor) nodes.
 *
 * The flow: gather the prompt (node box + upstream In nodes) → send the HTML
 * contract to the generator → keep the raw HTML as a version → parse it into
 * an editor document → flatten a preview → open the editor on the resulting
 * layers.
 *
 * Generation and review use the selected model, defaulting to the Codex
 * subscription. No separate API key is required for Codex.
 */

/** The preview flattened from a generated document; cap keeps memory sane. */
const FLATTEN_MAX_EDGE = 2048;
const IMAGE_MAX_BYTES = 12 * 1024 * 1024;

/**
 * Streams one layout HTML from the configured generator, resolving to the
 * model's text.
 *
 * Every mode streams: standalone calls the provider from the page, and the
 * extension / desktop / hosted builds hand the job to whoever holds the API
 * key and receive the tokens back as events. A host that cannot stream (an
 * older service worker, a provider with no SSE endpoint) is not an error —
 * the buffered call still answers, just with a single chunk at the end.
 *
 * `onChunk` receives `{ text, reasoning }` ACCUMULATED so far, never deltas;
 * `StreamingLayoutFilter.feedAccumulated` derives the deltas from them.
 */
export async function streamLayoutText({
  model,
  prompt,
  providerId,
  referenceImage,
  onChunk,
}) {
  // CLI model IDs (claude:, codex:, antigravity:) use the native CLI bridge.
  const { cliId } = parseCliModelId(model ?? DEFAULT_AGENT_MODEL);
  const isCliModel = Boolean(cliId);
  const effectiveProviderId = isCliModel
    ? PROVIDER_ID.CLI
    : providerId || PROVIDER_ID.DEEPSEEK;
  if (isCliModel) {
    let text = "";
    for await (const chunk of streamCodexCompletion({
      model: model ?? DEFAULT_AGENT_MODEL,
      messages: [
        {
          role: "user",
          content: referenceImage
            ? [
                { type: "text", text: prompt },
                { type: "image_url", image_url: { url: referenceImage } },
              ]
            : prompt,
        },
      ],
    })) {
      text += chunk.choices?.[0]?.delta?.content || "";
      onChunk?.({ text });
    }
    return text.trim();
  }
  const job = {
    providerId: effectiveProviderId,
    mediaType: API_MEDIA_TYPE.TEXT,
    request: { model: model ?? DEFAULT_AGENT_MODEL, prompt },
  };

  try {
    const streamed = await streamProviderText({ ...job, onChunk });
    return streamed?.text?.trim() ?? "";
  } catch (error) {
    // Only a host that does not know the streaming message falls back; a
    // failed generation must stay failed rather than run a second time.
    if (!isUnsupportedStream(error)) throw error;
    const result = await submitProviderJob(job);
    const text = result?.text?.trim() ?? "";
    if (text) onChunk?.({ text });
    return text;
  }
}

/** True when the host answered "I do not handle that message". */
export function isUnsupportedStream(error) {
  return (
    error?.code === "unknownMessage" || error?.code === "extensionRequired"
  );
}

/**
 * Makes sure the extension may fetch remote images (picsum and friends) the
 * generated HTML may reference. All-hosts is an optional host permission
 * so everyday extension use stays narrow; layout generation asks for it on
 * demand, inside the click that starts a run. Non-extension builds fetch
 * directly and need nothing.
 */
export async function ensureRemoteImagePermission() {
  if (typeof globalThis.chrome?.permissions?.contains !== "function")
    return true;
  const needed = { origins: ["https://*/*"] };
  try {
    if (await chrome.permissions.contains(needed)) return true;
    return await chrome.permissions.request(needed);
  } catch {
    return false;
  }
}

export async function resolveLayoutImages(doc, pendingImages) {
  const resolved = [];
  for (const { nodeId, src } of pendingImages ?? []) {
    const node = doc.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) continue;
    try {
      const { dataUrl } = await fetchAssetDataUrl({
        url: src,
        maxBytes: IMAGE_MAX_BYTES,
      });
      const imageId = `img-${crypto.randomUUID()}`;
      const blob = dataUrlToBlob(dataUrl);
      await putImage(imageId, blob);
      node.imageId = imageId;
      resolved.push([imageId, blob]);
    } catch {
      // The image could not be fetched (blocked, dead link, cross-origin
      // policy). Degrade the layer to a neutral placeholder box instead of
      // failing the whole layout.
      node.imageId = null;
      node.fill = "#cfcfcf";
      node.src = null;
    }
  }
  return resolved;
}

/** Renders a document onto an offscreen canvas and returns a PNG data URL. */
export async function flattenDocument(doc, imageUrls) {
  const [{ draw }, { decodeImageSource }] = await Promise.all([
    import("../editor/scene_renderer.js"),
    import("../editor/bitmap_cache.js"),
  ]);
  const bitmaps = new Map();
  const imageNodes = (doc.nodes ?? []).filter(
    (node) => (node.kind === "image" || node.kind === "IMAGE") && node.imageId,
  );
  for (const node of imageNodes) {
    const source = imageUrls[node.imageId];
    if (!source) continue;
    try {
      bitmaps.set(node.imageId, await decodeImageSource(source));
    } catch {
      // Missing bitmap paints as the node's placeholder fill, if any.
    }
  }

  const maxEdge = Math.max(doc.width ?? 1, doc.height ?? 1);
  const scale = maxEdge > FLATTEN_MAX_EDGE ? FLATTEN_MAX_EDGE / maxEdge : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round((doc.width ?? 1) * scale));
  canvas.height = Math.max(1, Math.round((doc.height ?? 1) * scale));
  const ctx = canvas.getContext("2d");
  draw(ctx, {
    doc,
    viewport: { panX: 0, panY: 0, zoom: scale },
    dpr: 1,
    selectionRect: null,
    cropRect: null,
    includeRegions: false,
    pageBackground: false,
    bypassAdjustments: true,
    bitmapOf: (id) => bitmaps.get(id) ?? null,
    maskOf: () => null,
  });
  return canvas.toDataURL("image/png");
}

/**
 * The canvas size a generated layout must match: the editor document's
 * dimensions when one exists, otherwise the attached picture's pixel size
 * (the canvas opens at that size before any document is saved), falling back
 * to the media preset.
 */
export async function resolveCanvasSize(node) {
  const data = node?.data;
  const fromDoc = layoutCanvasSize(data);
  if (data?.editorDoc) return fromDoc;

  // A size the user pinned in the AI layout panel beats the picture's own
  // pixels (the editor opens at exactly that size too, see editor_page.jsx).
  const pinnedWidth = data?.layoutWidth;
  const pinnedHeight = data?.layoutHeight;
  if (
    Number.isFinite(pinnedWidth) &&
    pinnedWidth > 0 &&
    Number.isFinite(pinnedHeight) &&
    pinnedHeight > 0
  ) {
    return {
      width: Math.round(pinnedWidth),
      height: Math.round(pinnedHeight),
    };
  }

  const imageId = data?.imageId;
  if (imageId) {
    try {
      const blobs = await getImageBlobMap([imageId]);
      const blob = blobs.get(imageId);
      if (blob) {
        const { decodeImageSource } = await import("../editor/bitmap_cache.js");
        const img = await decodeImageSource(blob);
        const width = img?.naturalWidth || img?.width;
        const height = img?.naturalHeight || img?.height;
        if (
          Number.isFinite(width) &&
          width > 0 &&
          Number.isFinite(height) &&
          height > 0
        ) {
          return { width: Math.round(width), height: Math.round(height) };
        }
      }
    } catch {
      // Fall through to the preset.
    }
  }
  return fromDoc;
}
