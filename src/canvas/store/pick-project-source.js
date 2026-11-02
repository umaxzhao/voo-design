/** Lets the user pick one file through a hidden input when no native picker is available. */
function pickFileFromInput() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".voo,.zip,.json,.psd,.fig,.svg,.pen";
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
          name: "VOO Design Document / PSD / Figma / SVG / Pen",
          extensions: ["voo", "zip", "json", "psd", "fig", "svg", "pen"],
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
              "VOO Design Document / PSD / Figma / SVG / Pen (*.voo, *.json, *.psd, *.fig, *.svg, *.pen)",
            accept: {
              "application/json": [".voo", ".json", ".pen"],
              "image/vnd.adobe.photoshop": [".psd"],
              "application/octet-stream": [".fig"],
              "image/svg+xml": [".svg"],
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
