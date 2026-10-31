/**
 * Decodes a base64 image data URL into a Blob without a fetch round-trip
 * (fetching a data: URL just to get the same bytes back is wasted work).
 * Returns null when the input is not a well-formed base64 data URL.
 */
export function pngDataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  let binary;
  try {
    binary = atob(match[2]);
  } catch {
    return null; // malformed base64
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

/**
 * Writes SVG markup (and optional PNG data URL) to the system clipboard.
 */
export async function writeSvgToSystemClipboard(svgString, pngDataUrl = null) {
  if (typeof navigator === "undefined" || !navigator.clipboard) return false;
  const items = {};
  if (svgString) {
    items["text/plain"] = new Blob([svgString], { type: "text/plain" });
    items["text/html"] = new Blob([`<meta charset="utf-8">${svgString}`], {
      type: "text/html",
    });
    try {
      items["image/svg+xml"] = new Blob([svgString], {
        type: "image/svg+xml",
      });
    } catch {
      // image/svg+xml may be restricted by some browser environments
    }
  }
  if (pngDataUrl) {
    const blob = pngDataUrlToBlob(pngDataUrl);
    if (blob) items["image/png"] = blob;
  }
  if (navigator.clipboard.write && globalThis.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem(items)]);
      return true;
    } catch {
      // Text is still available when rich clipboard writes are denied.
    }
  }
  if (svgString && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(svgString);
      return true;
    } catch {
      // The in-app clipboard remains available when the OS write fails.
    }
  }
  return false;
}

/**
 * Best-effort write of a PNG data URL to the SYSTEM clipboard, alpha intact.
 */
export async function writePngToSystemClipboard(dataUrl) {
  const bridge = globalThis.window?.vooElectron ?? globalThis.vooElectron;
  if (typeof bridge?.writeClipboardImage === "function") {
    try {
      await bridge.writeClipboardImage(dataUrl);
      return true;
    } catch {
      // Native write failed (e.g. rejected payload) — try the web path.
    }
  }
  const blob = pngDataUrlToBlob(dataUrl);
  if (!blob) return false;
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard?.write ||
    !globalThis.ClipboardItem
  ) {
    return false;
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    // Clipboard unavailable outside a user gesture; the in-app clipboard
    // still holds the layers, so the copy is not lost.
    return false;
  }
}
