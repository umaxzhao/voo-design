/** Picker and drop share the browser-decodable image formats, including files
 * whose OS supplies no MIME type. PSD uses the existing document importer. */
export const EDITOR_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "svg", "gif", "bmp", "avif", "ico"];
export const EDITOR_MEDIA_ACCEPT = [
  "image/*", ...EDITOR_IMAGE_EXTENSIONS.map((ext) => `.${ext}`),
  ".psd", "audio/*", "video/*", ".glb", ".obj",
].join(",");

export function isEditorImageFile(file) {
  return !!file?.type?.startsWith("image/") ||
    EDITOR_IMAGE_EXTENSIONS.some((ext) => file?.name?.toLowerCase().endsWith(`.${ext}`));
}

export async function importPickedEditorFile(engine, file, { point, openDocument, importMedia }) {
  if (/\.psd$/i.test(file.name ?? "")) return openDocument(file);
  if (!isEditorImageFile(file)) return importMedia(file);
  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name ?? "")) {
    try {
      return await engine.insertSvg(await file.text(), point);
    } catch {
      // Match drop behavior: fall back to the image decoder for malformed SVG.
    }
  }
  return engine.insertImage(file, point);
}
