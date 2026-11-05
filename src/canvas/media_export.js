import { mediaExportFilename } from "../shared/media-export.js";
import { dataUrlToBlob } from "../shared/db_wire.js";

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
  const bridge = globalThis.window?.vooElectron
    ?? globalThis.window?.electronAPI
    ?? globalThis.window?.bridge?.media;
  let path = null;
  if (bridge?.chooseExportPath && bridge.writeImageFile) {
    path = await bridge.chooseExportPath({ name: filename, format, title });
    // A native dialog may resolve after its editor was closed or replaced.
    // Cancellation must be checked before any bytes reach the selected path.
    signal?.throwIfAborted();
    if (!path) return null;
    await bridge.writeImageFile(path, dataUrl);
  } else {
    // Chromium ignores `download` for some oversized data URLs, which makes the
    // save dialog title fall back to the data:image/png;base64 payload. A Blob
    // URL keeps the chosen filename and avoids holding the whole base64 string
    // in the navigation path.
    const objectUrl = typeof globalThis.URL?.createObjectURL === "function"
      ? globalThis.URL.createObjectURL(dataUrlToBlob(dataUrl))
      : null;
    const link = document.createElement("a");
    link.href = objectUrl ?? dataUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    if (objectUrl) setTimeout(() => globalThis.URL.revokeObjectURL(objectUrl), 1000);
  }
  signal?.throwIfAborted();
  const receipt = { path, name: path?.split(/[\\/]/).pop() || filename };
  window.dispatchEvent(
    new CustomEvent("voo:export-complete", { detail: receipt }),
  );
  return receipt;
}
