import { mediaExportFormat } from "../../shared/media-export.js";

/** Choose the same source name for the preview and the eventual export. */
export function exportTargetName(documentName, range, nodes = [], selectedIds = []) {
  if (range !== "selection") return documentName;
  if (selectedIds.length !== 1) return "Selection";
  const node = nodes.find((entry) => entry.id === selectedIds[0]);
  return node?.name || node?.label || "Selection";
}

/** Portable filename, capped at 120 UTF-8 bytes including suffix and extension. */
export function exportFilename(name, format, scale = 1) {
  const { extension } = mediaExportFormat(format);
  let stem = (typeof name === "string" ? name : "")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "")
    .replace(/\.(?:png|jpe?g|webp|svg|psd|pdf)$/i, "")
    .replace(/[. ]+$/g, "");
  if (!stem) stem = "Untitled";
  // Windows reserves device names even when followed by another extension.
  if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(stem))
    stem = `_${stem}`;
  const suffix = `${Number.isFinite(scale) && scale > 1 ? `@${scale}x` : ""}.${extension}`;
  const budget = 120 - new TextEncoder().encode(suffix).length;
  let truncated = "";
  let bytes = 0;
  for (const char of stem) {
    bytes += new TextEncoder().encode(char).length;
    if (bytes > budget) break;
    truncated += char;
  }
  return `${truncated.replace(/[. ]+$/g, "") || "Untitled"}${suffix}`;
}
