/**
 * Triggers a browser download for an image URL, inferring the extension.
 * Accepts both data URLs and `blob:` object URLs — the in-memory image mirror
 * holds the latter, so the MIME type has to be read from the Blob itself.
 */
export async function downloadDataUrl(url, filename) {
  if (!url) return;
  let mime = "image/png";
  if (url.startsWith("blob:")) {
    const blob = await (await fetch(url)).blob();
    if (blob.type) mime = blob.type;
  } else {
    mime = /data:([^;]+)/.exec(url)?.[1] ?? mime;
  }
  let extension = "png";
  if (
    url.startsWith("data:model/gltf-binary") ||
    url.startsWith("data:model/glb")
  ) {
    extension = "glb";
  } else if (
    url.startsWith("data:model/gltf+json") ||
    url.startsWith("data:model/gltf")
  ) {
    extension = "gltf";
  } else {
    const rawSubtype = mime
      .split("/")[1]
      ?.split(";")[0]
      ?.replace("jpeg", "jpg");
    if (rawSubtype === "x-msvideo") {
      extension = "avi";
    } else if (rawSubtype === "gltf-binary") {
      extension = "glb";
    } else if (rawSubtype === "gltf+json") {
      extension = "gltf";
    } else if (rawSubtype) {
      extension = rawSubtype;
    }
  }

  // Model assets may be stored as application/octet-stream. Preserve their
  // explicit filename extension when the Blob MIME type is generic.
  const hasModelExtension = /\.(?:glb|gltf)$/i.test(filename);
  const downloadName =
    hasModelExtension || filename.toLowerCase().endsWith(`.${extension}`)
      ? filename
      : `${filename}.${extension}`;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = downloadName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

/** Converts a browser-decoded image Blob to PNG for clipboard compatibility. */
async function toPngBlob(blob) {
  if (blob.type === "image/png") return blob;
  if (!globalThis.document || !globalThis.Image || !globalThis.URL) {
    throw new Error("clipboardImageConversionUnavailable");
  }

  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("clipboardImageDecodeFailed"));
      element.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) {
      throw new Error("clipboardImageConversionUnavailable");
    }
    context.drawImage(image, 0, 0);
    const png = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!png) throw new Error("clipboardImageConversionFailed");
    return png;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/** Copies an image as PNG, the interoperable browser clipboard image format. */
export async function copyImageToClipboard(url) {
  if (!url || !navigator.clipboard?.write || !globalThis.ClipboardItem) {
    throw new Error("clipboardUnavailable");
  }
  const blob = await (await fetch(url)).blob();
  const png = await toPngBlob(blob);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

/**
 * Triggers one download per media entry, staggered so a batch of many files
 * is not mistaken for a pop-up flood. The first download starts immediately
 * (still inside the user gesture); each following one waits `delayMs`.
 *
 * @param {Array<{url: string, name: string}>} entries
 * @returns {Promise<number>} how many downloads were triggered
 */
export async function downloadMediaEntries(entries, { delayMs = 150 } = {}) {
  let triggered = 0;
  for (const [index, entry] of entries.entries()) {
    if (index > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    if (entry?.url) {
      await downloadDataUrl(entry.url, entry.name);
      triggered += 1;
    }
  }
  return triggered;
}

/** Saves an arbitrary object as a pretty-printed JSON file. */
export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filename}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Reads a user-picked file as parsed JSON. */
export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch {
        reject(new Error("invalid-json"));
      }
    };
    reader.onerror = () => reject(new Error("file-read-failed"));
    reader.readAsText(file);
  });
}

export function isWorkflowJsonFile(file) {
  return Boolean(
    file &&
    (file.type === "application/json" ||
      file.name?.toLowerCase().endsWith(".json")),
  );
}

export function assertWorkflowDocument(document) {
  if (
    !document ||
    typeof document !== "object" ||
    !Array.isArray(document.nodes) ||
    !Array.isArray(document.edges)
  ) {
    throw new Error("invalid-workflow-json");
  }
  return document;
}
