/**
 * Waits out a web image turn and brings the new pictures back as data URLs.
 *
 * Done means: the page is not busy, at least one new image is at least 256px
 * on both edges, and that set has held still for the settle window. Icons,
 * avatars and the previous turn are filtered by the adapter before this runs.
 */

import { mediaUrlToDataUrl } from "./dom-utils.js";
import { codedError } from "./errors.js";

const MIN_EDGE = 256;

/** Prefix a prompt that does not already ask for an image. */
export function imagePrompt(prompt) {
  const text = String(prompt ?? "").trim();
  if (/image|图片|图像/i.test(text)) return text;
  return `Generate an image: ${text}`;
}

function mimeOf(dataUrl) {
  const match = /^data:([^;,]+)/.exec(dataUrl || "");
  return match?.[1] || "image/png";
}

function sourceOf(element) {
  return element?.currentSrc || element?.src || element?.getAttribute?.("src") || "";
}

function isReady(element) {
  const width = element?.naturalWidth || 0;
  const height = element?.naturalHeight || 0;
  return width >= MIN_EDGE && height >= MIN_EDGE;
}

function freshImages(adapter, known, root) {
  const seen = new Set();
  const images = adapter.collectImageElements(root);
  return images.filter((element) => {
    const src = sourceOf(element);
    if (!src || known?.has(src) || seen.has(src) || !isReady(element)) return false;
    seen.add(src);
    return true;
  });
}

function resultRoot(adapter, baselineTurns) {
  const turns = adapter.getAssistantTurns?.() ?? [];
  if (turns.length > baselineTurns) return turns[turns.length - 1];
  return globalThis.document;
}

/**
 * Polls until the new images settle, then downloads them in the page so
 * cookie-scoped CDNs are readable.
 */
export async function collectGeneratedImages(adapter, {
  known = new Set(),
  baselineTurns = 0,
  count = 1,
  timeoutMs = 240000,
  settleMs = 3000,
  intervalMs = 250,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  onProgress = () => {},
  download = (url, element) => mediaUrlToDataUrl(url, adapter.backgroundFetch, element),
} = {}) {
  const deadline = now() + timeoutMs;
  let lastSignature = null;
  let stableSince = null;

  while (now() < deadline) {
    const ready = freshImages(adapter, known, resultRoot(adapter, baselineTurns));
    const signature = ready.map(sourceOf).join("|");
    const held = !adapter.isBusy() && ready.length > 0 && signature === lastSignature;
    if (!held) {
      lastSignature = signature;
      stableSince = now();
    } else if (now() - stableSince >= settleMs) {
      onProgress({ stage: "downloading" });
      const images = [];
      for (const element of ready.slice(0, count)) {
        const src = sourceOf(element);
        const dataUrl = src.startsWith("data:") ? src : await download(src, element);
        images.push({
          dataUrl,
          width: element.naturalWidth,
          height: element.naturalHeight,
          mimeType: mimeOf(dataUrl),
        });
      }
      if (images.length === 0) throw codedError("noImages");
      return { images };
    }
    await sleep(intervalMs);
  }

  const ready = freshImages(adapter, known, resultRoot(adapter, baselineTurns));
  if (!adapter.isBusy() && ready.length === 0) throw codedError("noImages");
  throw codedError("timeout");
}
