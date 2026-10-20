/** File format contract shared by the renderer and native export dialog. */
const FORMATS = Object.freeze({
  png: { extension: "png", mime: "image/png" },
  jpeg: { extension: "jpg", mime: "image/jpeg" },
  jpg: { extension: "jpg", mime: "image/jpeg" },
  webp: { extension: "webp", mime: "image/webp" },
  svg: { extension: "svg", mime: "image/svg+xml" },
  psd: { extension: "psd", mime: "image/vnd.adobe.photoshop" },
  pdf: { extension: "pdf", mime: "application/pdf" },
  html: { extension: "html", mime: "text/html" },
  glb: { extension: "glb", mime: "model/gltf-binary" },
  pptx: {
    extension: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
});

export function mediaExportFormat(format) {
  if (!Object.hasOwn(FORMATS, format))
    throw new Error("EXPORT_FORMAT_UNSUPPORTED");
  return FORMATS[format];
}

export function mediaExportFilename(name, format) {
  const { extension } = mediaExportFormat(format);
  const basename = String(name || "export")
    .split(/[\\/]/)
    .pop();
  return `${basename.replace(/\.(?:png|jpe?g|webp|svg|psd|pdf|html|glb|pptx)$/i, "")}.${extension}`;
}

export function bytesToDataUrl(bytes, mime) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
