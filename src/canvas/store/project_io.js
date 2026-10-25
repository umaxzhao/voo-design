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
import { useDesignStore } from "../../store/design_store.js";
import { addRecentFile } from "./recent_files.js";
import { isSvgFileName, svgBytesToVooFile } from "./svg_document_io.js";
import { buildFigContainer } from "../figma/voo-to-fig.js";
import { serializeFigArchive } from "../figma/fig-file.js";
import {
  SAVE_FORMATS,
  formatSaveLosses,
  isPenFileName,
  isPsdFileName,
  replaceDocumentExtension,
  saveFormatOf,
} from "./save_formats.js";
import { penBytesToVooFile } from "../pen/pen_import_client.js";
import { renderEngineSvg } from "../components/editor_hooks/export_editor_image.js";
import { documentToSvg } from "../editor/editor_svg.js";
import { workspaceStorage } from "../../services/workspace_storage.js";
import { t } from "../../shared/i18n.js";
import { decodeVooBinary, encodeVooBinary, isVooBinary } from "./voo_binary.js";
import { importFigFile } from "../figma/figma_import_client.js";
import {
  VOO_FILE_FORMAT,
  VOO_FILE_VERSION,
  imageIdsOfDocument,
  isValidVooFile,
  normalizeVooFile,
} from "../../../electron/voo_format.js";
import { flushEditorPendingWrites } from "../components/editor_hooks/editor-autosave.js";

export async function readRequiredAsset(id) {
  // Check memory store first
  const memoryImage = useDesignStore.getState?.()?.images?.[id];
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
    useDesignStore.getState().putImageState?.(id, dataUrl);
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
/**
 * Asks before a save that would drop content. Returns false when the user
 * declines, so the document stays as it is instead of losing content silently.
 */
function confirmSaveLosses(losses) {
  const lines = losses.map((loss) => `• ${t(loss.key, loss.params)}`).join("\n");
  return window.confirm(`${t("save.loss.intro")}\n${lines}\n\n${t("save.loss.confirm")}`);
}

/** Encodes the document in the format its file name asks for. */
async function encodeForFormat(format, { vooFile, engine, sceneDoc, figSource, pageName, fileName }) {
  if (format === "svg") {
    return new TextEncoder().encode(engine ? renderEngineSvg(engine) : documentToSvg(sceneDoc));
  }
  if (format === "psd") {
    if (!engine) throw new Error("psd-save-needs-live-engine");
    return new Uint8Array(await engine.exportPsd());
  }
  if (format === "fig") {
    // Only a `.fig` that was opened has the schema a Figma file needs.
    if (!figSource) throw new Error("fig-save-needs-source");
    const container = buildFigContainer(sceneDoc, figSource, { pageName });
    return serializeFigArchive(container, { name: fileName });
  }
  return encodeVooBinary(vooFile);
}

export async function saveVooProject({
  store = useDesignStore.getState(),
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
    const entry = enginesRef?.current?.get(node.id);
    let sceneDoc;
    // Readiness belongs to the registry entry, not the engine instance.
    if (entry?.ready && entry.engine) {
      sceneDoc = entry.engine.serialise();
    } else if (snapshotsRef?.current?.get(node.id)?.doc) {
      sceneDoc = snapshotsRef.current.get(node.id).doc;
    } else {
      sceneDoc = node.data?.editorDoc ?? node.data?.sceneDoc ?? {};
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

  // The file name decides the format: a `.svg` or `.psd` document saves back as itself.
  const format = saveFormatOf(store.fileName);
  const losses = formatSaveLosses(format, { pageCount: pages.length, sceneDoc: primaryDoc });
  if (losses.length > 0 && !confirmSaveLosses(losses)) return { canceled: true };
  const fileBytes = await encodeForFormat(format, {
    vooFile,
    engine: focusedEngine,
    sceneDoc: primaryDoc,
    figSource: store.figSource,
    pageName: primaryPage?.label,
    fileName: store.fileName,
  });

  const rawSuggestedName =
    store.fileName ||
    (pageTitle
      ? `${pageTitle()}.voo`
      : `${primaryPage?.label || "Untitled"}.voo`);
  const finalSuggestedName = replaceDocumentExtension(rawSuggestedName, SAVE_FORMATS[format].extension);

  // 1. Electron Desktop
  if (window.electronAPI?.saveFileDialog && window.electronAPI?.writeFileBytes) {
    let targetPath = store.filePath;
    if (saveAs || !targetPath) {
      const defaultPath = await resolveWorkspaceDefaultSavePath(finalSuggestedName);
      targetPath = await window.electronAPI.saveFileDialog({
        defaultPath,
        filters: [SAVE_FORMATS[format].electronFilter],
      });
      if (!targetPath) return { canceled: true };
    }
    await window.electronAPI.writeFileBytes(targetPath, fileBytes);
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
        const pickerOptions = {
          suggestedName: finalSuggestedName,
          types: [SAVE_FORMATS[format].pickerType],
        };
        const driver =
          typeof workspaceStorage?.getDriver === "function"
            ? workspaceStorage.getDriver()
            : null;
        if (driver?.dirHandle) {
          pickerOptions.startIn = driver.dirHandle;
        }
        handle = await window.showSaveFilePicker(pickerOptions);
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
      await writable.write(fileBytes);
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
  const blob = new Blob([fileBytes], { type: SAVE_FORMATS[format].mime });
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
/** PSD is binary, so it is read as bytes; `.voo` / `.json` stay text. */
function isBinaryDesignName(name) {
  return /\.(psd|fig)$/i.test(name ?? "");
}

/** Converts a picked PSD or Figma file to a `.voo` envelope, by extension. */
async function binaryDesignToVooFile(bytes, sourceName, callbacks = {}) {
  if (/\.fig$/i.test(sourceName)) {
    const { vooFile, fonts, figSource } = await importFigFile(bytes, callbacks);
    return { vooFile, fonts, figSource };
  }
  const { psdBytesToVooFile } = await import("./psd_to_voo.js");
  return { vooFile: psdBytesToVooFile(bytes), fonts: [], figSource: null };
}

/** Opens a picked PSD as a new, unsaved design: its layers become editable nodes. */
async function openBinaryDesignSource({ store, bytes, sourceName, sourcePath, handle, onProgress: userOnProgress, onChunk }) {
  const onProgress = (p) => {
    if (/\.fig$/i.test(sourceName)) {
      const pct = typeof p?.percent === "number" ? Math.round(p.percent) : null;
      const baseLabel = t("loading.importingFigma");
      const progressLabel = pct !== null ? `${baseLabel} (${pct}%)` : baseLabel;
      store.setDocumentLoading?.(progressLabel);
    }
    userOnProgress?.(p);
  };
  if (/\.fig$/i.test(sourceName)) {
    store.setDocumentLoading?.(t("loading.importingFigma"));
  }
  const { vooFile, fonts, figSource } = await binaryDesignToVooFile(bytes, sourceName, {
    onProgress,
    onChunk,
  });
  await hydrateVooImages(vooFile);
  // A PSD keeps its name and location, so saving writes it back in place.
  // A Figma file saves as a copy: its name gets a "(VOO)" suffix and no filePath,
  // so saving asks for a location and never overwrites the source.
  const keepsSource = isPsdFileName(sourceName);
  const fileName = keepsSource
    ? sourceName
    : `${sourceName.replace(/\.fig$/i, "")} (VOO).fig`;
  store.loadVooProject?.({
    vooData: vooFile,
    filePath: keepsSource ? sourcePath : null,
    fileName,
    fileHandle: keepsSource ? handle : null,
    figSource,
  });
  addRecentFile({ name: sourceName, path: sourcePath, preview: null });
  // Families the editor does not ship: they show in the design with a fallback face.
  const missingFonts = fonts.filter((font) => !font.available);
  return { success: true, fileName, filePath: keepsSource ? sourcePath : null, missingFonts };
}

/** Lets the user pick one file through a hidden input when no native picker is available. */
function pickFileFromInput() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".voo,.json,.psd,.fig,.svg,.pen";
    input.onchange = (e) => resolve(e.target.files?.[0] ?? null);
    input.click();
  });
}

/** Bytes of a file-like value, whatever the host hands back. */
function toBytes(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

/**
 * Opens a `.voo` (binary or legacy JSON), a PSD or a Figma file from a picked
 * file, a recent path, or the native dialog.
 */
/**
 * Waits for the document to reach the screen before the overlay lifts. Frames
 * are preferred, but browsers pause requestAnimationFrame in hidden or occluded
 * windows, so a timer caps the wait: the overlay must never stay up for good.
 */
function waitForPaint() {
  const frames = new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      resolve();
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
  const cap = new Promise((resolve) => setTimeout(resolve, 150));
  return Promise.race([frames, cap]);
}

/**
 * Opens a document behind a loading overlay. The overlay stays up while the file
 * is read, converted (a Figma import can take seconds) and loaded, and lifts only
 * after the canvas has painted, so a half-imported document is never shown.
 */
export async function openVooProject(options = {}) {
  const store = options.store ?? useDesignStore.getState();
  store.setDocumentLoading?.(t("loading.openingDocument"));
  try {
    return await openVooProjectUnlocked(options);
  } finally {
    await waitForPaint();
    store.setDocumentLoading?.(null);
  }
}

async function openVooProjectUnlocked({
  store = useDesignStore.getState(),
  fileOrPath = null,
} = {}) {
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
    if (!window.electronAPI?.readFileBytes) return { canceled: true };
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
          extensions: ["voo", "json", "psd", "fig", "svg", "pen"],
        },
      ],
    });
    if (!result?.bytes) return { canceled: true };
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
      if (!handle) return { canceled: true };
      const file = await handle.getFile();
      source = {
        bytes: new Uint8Array(await file.arrayBuffer()),
        name: file.name,
        path: null,
        handle,
      };
    } catch (err) {
      if (err.name === "AbortError") return { canceled: true };
      console.warn("[VOO] showOpenFilePicker failed, falling back to input:", err);
    }
  }

  if (!source && typeof document !== "undefined") {
    const file = await pickFileFromInput();
    if (!file) return { canceled: true };
    source = {
      bytes: new Uint8Array(await file.arrayBuffer()),
      name: file.name,
      path: null,
      handle: null,
    };
  }
  if (!source) return { canceled: true };

  return openVooSource({ store, ...source });
}

/**
 * Opens an SVG as an editable design. It keeps the `.svg` name and its file
 * location, so saving writes back to the same file.
 */
async function openSvgSource({ store, bytes, name, path, handle }) {
  const vooFile = svgBytesToVooFile(bytes);
  store.loadVooProject?.({
    vooData: vooFile,
    filePath: path,
    fileName: name,
    fileHandle: handle,
  });
  addRecentFile({ name, path, preview: null });
  return { success: true, fileName: name, filePath: path };
}

/**
 * Opens a Pen `.pen` document as a new, unsaved VOO design. The source name
 * keeps a "(Pen)" suffix (and the `.pen` extension) so Save As proposes a
 * `.voo` beside it and never writes over the Pen file itself.
 */
async function openPenSource({ store, bytes, name, path, handle }) {
  // `penImport.*` ships in its own dictionary slice; before that slice is
  // wired into the locale, keep showing the generic opening label.
  const importing = t("penImport.importing");
  store.setDocumentLoading?.(
    importing === "penImport.importing" ? t("loading.openingDocument") : importing,
  );
  const base = name.replace(/\.pen$/i, "").trim() || "Pen Import";
  const result = await penBytesToVooFile(bytes, {
    fileName: name,
    filePath: path,
    dirHandle: handle?.kind === "directory" ? handle : null,
    fileHandle: handle?.kind === "file" ? handle : null,
    pageLabel: base,
  });
  await hydrateVooImages(result.vooFile);
  const fileName = `${base} (Pen).pen`;
  store.loadVooProject?.({
    vooData: result.vooFile,
    filePath: null,
    fileName,
    fileHandle: null,
  });
  addRecentFile({ name, path, preview: null });
  return {
    success: true,
    fileName,
    filePath: null,
    warnings: result.warnings,
    missingFonts: result.missingFonts,
  };
}

/** Loads one already-read file: PSD, Figma and Pen convert; `.voo` parses by its format. */
async function openVooSource({ store, bytes, name, path, handle }) {
  if (isSvgFileName(name)) {
    return openSvgSource({ store, bytes, name, path, handle });
  }
  if (isPenFileName(name)) {
    return openPenSource({ store, bytes, name, path, handle });
  }
  if (isBinaryDesignName(name)) {
    return openBinaryDesignSource({ store, bytes, sourceName: name, sourcePath: path, handle });
  }

  const raw = isVooBinary(bytes)
    ? decodeVooBinary(bytes)
    : JSON.parse(new TextDecoder().decode(bytes));
  // Early 1.0 builds wrote the envelope tag as "voo"; upgrade it in memory so
  // those files open (and the next save writes the current tag).
  const parsed = normalizeVooFile(raw);
  if (!isValidVooFile(parsed)) {
    throw new Error("Invalid .voo file format");
  }

  await hydrateVooImages(parsed);

  store.loadVooProject?.({
    vooData: parsed,
    filePath: path,
    fileName: name || "Untitled.voo",
    fileHandle: handle,
  });

  addRecentFile({
    name: name || "Untitled.voo",
    path,
    preview: parsed?.preview || null,
  });

  return {
    success: true,
    fileName: name || "Untitled.voo",
    filePath: path,
  };
}

/** Whether this build can touch local files at all. */
export function localFilesAvailable() {
  return true;
}

/**
 * Resolves the default save path inside the active workspace directory.
 */
export async function resolveWorkspaceDefaultSavePath(suggestedName) {
  try {
    const config = await workspaceStorage.getConfig();
    if (config?.type === "electron" && config?.path) {
      const sep = config.path.includes("\\") ? "\\" : "/";
      const trimmed = config.path.endsWith(sep)
        ? config.path.slice(0, -1)
        : config.path;
      return `${trimmed}${sep}${suggestedName}`;
    }
    if (
      config?.path &&
      config.type !== "web-idb" &&
      config.type !== "web-fsa" &&
      !config.path.startsWith("Virtual") &&
      !config.path.startsWith("Browser")
    ) {
      const sep = config.path.includes("\\") ? "\\" : "/";
      const trimmed = config.path.endsWith(sep)
        ? config.path.slice(0, -1)
        : config.path;
      return `${trimmed}${sep}${suggestedName}`;
    }
  } catch {}
  return suggestedName;
}

