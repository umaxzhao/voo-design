import { mediaExportFilename } from "../shared/media-export.js";

/** Save a media file; a cancelled native dialog produces no success receipt. */
export async function saveMediaExport({
  dataUrl,
  name,
  format,
  title,
  signal,
}) {
  signal?.throwIfAborted();
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("EXPORT_DATA_INVALID");
  }
  const filename = mediaExportFilename(name, format);
  const bridge = globalThis.window?.vooElectron;
  let path = null;
  if (bridge?.chooseExportPath && bridge.writeImageFile) {
    path = await bridge.chooseExportPath({ name: filename, format, title });
    // A native dialog may resolve after its editor was closed or replaced.
    // Cancellation must be checked before any bytes reach the selected path.
    signal?.throwIfAborted();
    if (!path) return null;
    await bridge.writeImageFile(path, dataUrl);
  } else {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  }
  signal?.throwIfAborted();
  const receipt = { path, name: path?.split(/[\\/]/).pop() || filename };
  window.dispatchEvent(
    new CustomEvent("voo:export-complete", { detail: receipt }),
  );
  return receipt;
}
