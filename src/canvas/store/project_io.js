/**
 * Moving a picture-editor document between the canvas and local `.voo` files.
 *
 * A `.voo` file is one editor node the way a PSD is one document: the editor
 * document (layers, regions, transforms) plus the image bytes every layer
 * references, embedded as data URLs so the file is self-contained. These
 * helpers build and hydrate that shape on the canvas side; the actual disk
 * I/O and dialogs live in the Electron main process behind `window.vooElectron`.
 *
 * The format envelope is shared with the main process — electron/voo_format.js
 * is pure JS with no electron imports, so both ends validate the same shape.
 */

import { getImageDataUrl, putImage } from "./db.js";
import { dataUrlToBlob } from "../../shared/db_wire.js";
import { useWorkflowStore } from "./workflow_store.js";
import { addRecentFile } from "./recent_files.js";
import {
  VOO_FILE_FORMAT,
  VOO_FILE_VERSION,
  imageIdsOfDocument,
  isValidVooFile,
} from "../../../electron/voo_format.js";
import { flushEditorPendingWrites } from "../components/editor_hooks/editor-autosave.js";

export async function readRequiredAsset(id) {
  // Check memory store first
  const memoryImage = useWorkflowStore.getState?.()?.images?.[id];
  if (typeof memoryImage === "string" && memoryImage.startsWith("data:")) {
    return memoryImage;
  }
  let url;
  try {
    url = await getImageDataUrl(id);
  } catch (cause) {
    if (typeof memoryImage === "string" && memoryImage.startsWith("data:")) {
      return memoryImage;
    }
    const error = new Error(`asset-unavailable:${id}`, { cause });
    error.code = "asset-unavailable";
    throw error;
  }
  if (typeof url !== "string" || !url.startsWith("data:")) {
    if (typeof memoryImage === "string" && memoryImage.startsWith("data:")) {
      return memoryImage;
    }
    const error = new Error(`asset-unavailable:${id}`);
    error.code = "asset-unavailable";
    throw error;
  }
  return url;
}

/**
 * The asset bytes a document references, as data URLs.
 *
 * Every document stores only its asset identifiers; the pixels / media live in
 * IndexedDB. This resolves each id the document mentions so the `.voo` file carries
 * everything it needs to be reopened elsewhere.
 */
export async function collectDocumentAssets(document, kind = "design") {
  const ids = imageIdsOfDocument(document, kind);
  const assets = {};
  for (const id of ids) {
    try {
      assets[id] = await readRequiredAsset(id);
    } catch (err) {
      console.warn(`[VOO] Asset ${id} missing or unreadable during package:`, err);
    }
  }
  return assets;
}

/** Backward-compatible alias for collectDocumentAssets. */
export async function collectDocumentImages(document, kind = "design") {
  return collectDocumentAssets(document, kind);
}

/**
 * Builds a `.voo` file object from an editor document and its assets.
 * When kind is provided (or version === 2), constructs a v2 multi-document envelope.
 * Otherwise defaults to v1 envelope for backward compatibility.
 */
export async function buildVooFile({
  document,
  kind = null,
  preview = null,
  version = null,
}) {
  const effectiveKind = kind ?? document?.kind ?? null;
  const effectiveVersion = version ?? (effectiveKind ? 2 : 1);

  if (effectiveVersion === 1) {
    const images = await collectDocumentAssets(document, "design");
    return {
      format: VOO_FILE_FORMAT,
      version: 1,
      document,
      images,
      ...(preview ? { preview } : {}),
    };
  }

  const assetsKind = effectiveKind ?? "design";
  const assets = await collectDocumentAssets(document, assetsKind);
  return {
    format: VOO_FILE_FORMAT,
    version: VOO_FILE_VERSION,
    kind: assetsKind,
    document,
    assets,
    ...(preview ? { preview } : {}),
  };
}

/**
 * Stores every asset a `.voo` file carries into IndexedDB, so opening the
 * document's editor can resolve the identifiers it references. Every kind
 * stores its assets the same way; only the Design editor can open them now.
 */
export async function hydrateVooImages(vooFile, publication) {
  const files = Array.isArray(vooFile) ? vooFile : [vooFile];
  for (const file of files) {
    const assets = file?.assets ?? file?.images ?? {};
    for (const id of imageIdsOfDocument(file?.document, file?.kind)) {
      if (!Object.hasOwn(assets, id)) {
        console.warn(`[VOO] Warning: asset ${id} not found in .voo package`);
      }
    }
  }
  const assetsById = new Map();
  for (const file of files) {
    for (const [id, dataUrl] of Object.entries(
      file?.assets ?? file?.images ?? {},
    )) {
      if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
        continue;
      }
      if (assetsById.has(id) && assetsById.get(id) !== dataUrl) {
        continue;
      }
      assetsById.set(id, dataUrl);
    }
  }
  const entries = [...assetsById];
  for (const [id, dataUrl] of entries) {
    useWorkflowStore.getState().putImageState?.(id, dataUrl);
  }
  if (entries.length === 0) return async () => {};
  const { deleteImages, getImageBlobMap } = await import("./db.js");
  const previous = await getImageBlobMap(entries.map(([id]) => id));
  const attempted = [];
  const restore = async () => {
    const added = attempted.filter((id) => !previous.has(id));
    const rollbackErrors = [];
    try {
      if (added.length) await deleteImages(added);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    for (const id of attempted.filter((item) => previous.has(item))) {
      try {
        await putImage(id, previous.get(id), publication);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError(rollbackErrors, "asset-import-rollback-failed");
    }
  };
  try {
    for (const [id, dataUrl] of entries) {
      // A rejected IPC acknowledgement may still represent a committed write.
      attempted.push(id);
      await putImage(id, dataUrlToBlob(dataUrl), publication);
    }
  } catch (error) {
    try {
      await restore();
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "asset-import-rollback-failed",
      );
    }
    throw error;
  }
  return restore;
}

export const hydrateVooAssets = hydrateVooImages;

/**
 * The main picture a design `.voo` document opens as: its first image node.
 * Returns null for a document with no image at all.
 */
export function vooMainImageId(document) {
  return (
    document?.nodes?.find((node) => node.kind === "image" && node.imageId)
      ?.imageId ?? null
  );
}

/**
 * Saves the entire VOO Design project as a .voo file to the user's computer (Photoshop-like).
 * In Electron: uses dialog:saveFile / fs:writeFile, remembering filePath.
 * In Web: uses showSaveFilePicker if available (writing to FileSystemFileHandle), or falls back to file download.
 */
export async function saveVooProject({
  store = useWorkflowStore.getState(),
  enginesRef = null,
  snapshotsRef = null,
  saveAs = false,
  pageTitle = null,
} = {}) {
  const nodes = store.nodes || [];
  const focusedId = store.editingNodeId;

  // Flush pending writes on all live engines
  if (enginesRef?.current) {
    for (const node of nodes) {
      const live = enginesRef.current.get(node.id)?.engine;
      if (live) {
        await flushEditorPendingWrites(live, { commitSelection: true }).catch(() => {});
        await live.prepareFrame?.(live.getPlaybackState?.().time ?? 0).catch(() => {});
      }
    }
  }

  // Get preview from focused engine or first available engine
  let primaryPreview = null;
  const focusedEngine =
    enginesRef?.current?.get(focusedId)?.engine ||
    enginesRef?.current?.values()?.next()?.value?.engine;
  if (focusedEngine) {
    try {
      primaryPreview =
        (await focusedEngine.exportFullResPng?.()) ?? focusedEngine.exportPng();
    } catch (e) {
      console.warn("[VOO] Failed to generate preview PNG for .voo", e);
    }
  }

  const pages = nodes.map((node) => {
    const live = enginesRef?.current?.get(node.id)?.engine;
    let sceneDoc;
    if (live?.ready) {
      sceneDoc = live.serialise();
    } else if (snapshotsRef?.current?.get(node.id)?.doc) {
      sceneDoc = snapshotsRef.current.get(node.id).doc;
    } else {
      sceneDoc = node.data?.sceneDoc || {};
    }
    return {
      id: node.id,
      label: node.data?.label || "Page",
      canvasType: node.data?.canvasType || "design",
      sceneDoc,
      layout: store.editorArtboardLayouts?.[node.id] || null,
    };
  });

  const primaryPage = pages.find((p) => p.id === focusedId) || pages[0] || null;
  const primaryDoc = primaryPage?.sceneDoc || {
    version: 1,
    width: 1200,
    height: 800,
    nodes: [],
  };

  const compositeDocument = {
    ...primaryDoc,
    pages,
    editorArtboardLayouts: store.editorArtboardLayouts || {},
    editorCamera: store.editorCamera || { panX: 0, panY: 0, zoom: 1 },
    editingNodeId: focusedId,
  };

  const vooFile = await buildVooFile({
    document: compositeDocument,
    preview: primaryPreview,
    kind: "design",
    version: 2,
  });

  const jsonContent = JSON.stringify(vooFile, null, 2);

  const rawSuggestedName =
    store.fileName ||
    (pageTitle
      ? `${pageTitle()}.voo`
      : `${primaryPage?.label || "Untitled"}.voo`);
  const finalSuggestedName = rawSuggestedName.endsWith(".voo")
    ? rawSuggestedName
    : `${rawSuggestedName}.voo`;

  // 1. Electron Desktop
  if (window.electronAPI?.saveFileDialog && window.electronAPI?.writeFile) {
    let targetPath = store.filePath;
    if (saveAs || !targetPath) {
      targetPath = await window.electronAPI.saveFileDialog({
        defaultPath: finalSuggestedName,
        filters: [{ name: "VOO Design Document", extensions: ["voo"] }],
      });
      if (!targetPath) return { canceled: true };
    }
    await window.electronAPI.writeFile(targetPath, jsonContent);
    const fileName = targetPath.split(/[/\\]/).pop();
    store.setFilePath?.(targetPath);
    store.setFileName?.(fileName);
    store.setIsDirty?.(false);

    if (enginesRef?.current) {
      for (const entry of enginesRef.current.values()) {
        entry?.engine?.markApplied?.();
      }
    }
    addRecentFile({ name: fileName, path: targetPath, preview: primaryPreview });
    return { success: true, filePath: targetPath, fileName };
  }

  // 2. Modern Web Browser (File System Access API)
  if (
    typeof window !== "undefined" &&
    typeof window.showSaveFilePicker === "function"
  ) {
    let handle = store.fileHandle;
    if (saveAs || !handle) {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: finalSuggestedName,
          types: [
            {
              description: "VOO Design Document (*.voo)",
              accept: { "application/json": [".voo"] },
            },
          ],
        });
      } catch (err) {
        if (err.name === "AbortError") return { canceled: true };
        console.warn(
          "[VOO] showSaveFilePicker failed, falling back to download:",
          err,
        );
      }
    }
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(jsonContent);
      await writable.close();

      store.setFileHandle?.(handle);
      store.setFileName?.(handle.name);
      store.setIsDirty?.(false);

      if (enginesRef?.current) {
        for (const entry of enginesRef.current.values()) {
          entry?.engine?.markApplied?.();
        }
      }
      addRecentFile({ name: handle.name, path: null, preview: primaryPreview });
      return { success: true, fileName: handle.name };
    }
  }

  // 3. Fallback Web Browser Download
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = finalSuggestedName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  store.setFileName?.(finalSuggestedName);
  store.setIsDirty?.(false);
  if (enginesRef?.current) {
    for (const entry of enginesRef.current.values()) {
      entry?.engine?.markApplied?.();
    }
  }
  addRecentFile({ name: finalSuggestedName, path: null, preview: primaryPreview });
  return { success: true, fileName: finalSuggestedName };
}

/**
 * Opens a .voo file into the current VOO Design application.
 */
export async function openVooProject({
  store = useWorkflowStore.getState(),
  fileOrPath = null,
} = {}) {
  let fileContent = null;
  let targetPath = null;
  let targetName = null;
  let fileHandle = null;

  if (
    (typeof File !== "undefined" && fileOrPath instanceof File) ||
    (typeof Blob !== "undefined" && fileOrPath instanceof Blob) ||
    (fileOrPath && typeof fileOrPath.text === "function")
  ) {
    fileContent = await fileOrPath.text();
    targetName = fileOrPath.name || "Untitled.voo";
  } else if (typeof fileOrPath === "string") {
    if (window.electronAPI?.readFile) {
      fileContent = await window.electronAPI.readFile(fileOrPath);
      targetPath = fileOrPath;
      targetName = fileOrPath.split(/[/\\]/).pop();
    }
  } else if (window.electronAPI?.openFileDialog) {
    const result = await window.electronAPI.openFileDialog({
      filters: [{ name: "VOO Design Document", extensions: ["voo", "json"] }],
    });
    if (!result || !result.content) return { canceled: true };
    fileContent = result.content;
    targetPath = result.filePath;
    targetName = result.filePath.split(/[/\\]/).pop();
  } else if (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function"
  ) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: "VOO Design Document (*.voo, *.json)",
            accept: { "application/json": [".voo", ".json"] },
          },
        ],
      });
      if (!handle) return { canceled: true };
      const file = await handle.getFile();
      fileContent = await file.text();
      fileHandle = handle;
      targetName = file.name;
    } catch (err) {
      if (err.name === "AbortError") return { canceled: true };
      console.warn(
        "[VOO] showOpenFilePicker failed, falling back to input:",
        err,
      );
    }
  }

  if (!fileContent && typeof document !== "undefined") {
    fileContent = await new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".voo,.json";
      input.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return resolve(null);
        targetName = file.name;
        const text = await file.text();
        resolve(text);
      };
      input.click();
    });
    if (!fileContent) return { canceled: true };
  }

  if (!fileContent) return { canceled: true };

  const parsed = JSON.parse(fileContent);
  if (!isValidVooFile(parsed)) {
    throw new Error("Invalid .voo file format");
  }

  await hydrateVooImages(parsed);

  store.loadVooProject?.({
    vooData: parsed,
    filePath: targetPath,
    fileName: targetName || "Untitled.voo",
    fileHandle,
  });

  addRecentFile({
    name: targetName || "Untitled.voo",
    path: targetPath,
    preview: parsed?.preview || null,
  });

  return {
    success: true,
    fileName: targetName || "Untitled.voo",
    filePath: targetPath,
  };
}

/** Whether this build can touch local files at all. */
export function localFilesAvailable() {
  return true;
}
