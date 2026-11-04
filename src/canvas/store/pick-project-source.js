/** Raster formats the editor can place as an image layer. */
export const BITMAP_SOURCE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif", "ico"];

/** Whether a picked file is a bitmap to place on the canvas rather than a document to open. */
export function isBitmapSourceName(name) {
  return BITMAP_SOURCE_EXTENSIONS.some((extension) =>
    String(name ?? "").toLowerCase().endsWith(`.${extension}`),
  );
}

const BITMAP_ACCEPT = BITMAP_SOURCE_EXTENSIONS.map((extension) => `.${extension}`);

/** Lets the user pick one file through a hidden input when no native picker is available. */
function pickFileFromInput() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = [".voo", ".zip", ".json", ".psd", ".fig", ".svg", ".pen", ...BITMAP_ACCEPT].join(",");
    input.onchange = (e) => resolve(e.target.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Bytes of a file-like value, whatever the host hands back. */
function toBytes(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

/** Start native selection before any parser import can consume user activation. */
export async function pickProjectSource({ fileOrPath = null } = {}) {
  let source = null;

  if (
    (typeof File !== "undefined" && fileOrPath instanceof File) ||
    (typeof Blob !== "undefined" && fileOrPath instanceof Blob) ||
    (fileOrPath && typeof fileOrPath.arrayBuffer === "function")
  ) {
    source = {
      bytes: new Uint8Array(await fileOrPath.arrayBuffer()),
      name: fileOrPath.name || "Untitled.voo",
      path: null,
      handle: null,
    };
  } else if (typeof fileOrPath === "string") {
    if (!window.electronAPI?.readFileBytes) return null;
    source = {
      bytes: toBytes(await window.electronAPI.readFileBytes(fileOrPath)),
      name: fileOrPath.split(/[/\\]/).pop(),
      path: fileOrPath,
      handle: null,
    };
  } else if (window.electronAPI?.openFileDialog) {
    const result = await window.electronAPI.openFileDialog({
      filters: [
        {
          name: "VOO Design Document / PSD / Figma / SVG / Pen / Images",
          extensions: ["voo", "zip", "json", "psd", "fig", "svg", "pen", ...BITMAP_SOURCE_EXTENSIONS],
        },
      ],
    });
    if (!result?.bytes) return null;
    source = {
      bytes: toBytes(result.bytes),
      name: result.filePath.split(/[/\\]/).pop(),
      path: result.filePath,
      handle: null,
    };
  } else if (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function"
  ) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description:
              "VOO Design Document / PSD / Figma / SVG / Pen / Images (*.voo, *.json, *.psd, *.fig, *.svg, *.pen, *.png, *.jpg, *.jpeg, *.webp, *.gif, *.bmp, *.avif, *.ico)",
            accept: {
              "application/json": [".voo", ".json", ".pen"],
              "image/vnd.adobe.photoshop": [".psd"],
              "application/octet-stream": [".fig"],
              "image/svg+xml": [".svg"],
              "image/png": [".png"],
              "image/jpeg": [".jpg", ".jpeg"],
              "image/webp": [".webp"],
              "image/gif": [".gif"],
              "image/bmp": [".bmp"],
              "image/avif": [".avif"],
              "image/x-icon": [".ico"],
            },
          },
        ],
      });
      if (!handle) return null;
      const file = await handle.getFile();
      source = {
        bytes: new Uint8Array(await file.arrayBuffer()),
        name: file.name,
        path: null,
        handle,
      };
    } catch (err) {
      if (err.name === "AbortError") return null;
      console.warn("[VOO] showOpenFilePicker failed, falling back to input:", err);
    }
  }

  if (!source && typeof document !== "undefined") {
    const file = await pickFileFromInput();
    if (!file) return null;
    source = {
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
      path: null,
      handle: null,
    };
  }
  return source;
}
