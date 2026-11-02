import { workspaceStorage } from "../../services/workspace_storage.js";
import { decodeVooBinary, encodeVooBinary, isVooBinary } from "../store/voo_binary.js";
import { normalizeVooFile, isValidVooFile, imageIdsOfDocument } from "../../../electron/voo_format.js";

export const RESOURCE_FOLDER = "Resources";
const MAX_RESOURCE_BYTES = 50 * 1024 * 1024;

export async function listWorkspaceResources() {
  const files = await workspaceStorage.scanFiles();
  return files.filter(file => file.folder === RESOURCE_FOLDER && file.extension === "voo");
}

export function decodeResource(bytes) {
  if (bytes.byteLength > MAX_RESOURCE_BYTES) throw new Error("resource-too-large");
  const file = normalizeVooFile(isVooBinary(bytes) ? decodeVooBinary(bytes) : JSON.parse(new TextDecoder().decode(bytes)));
  if (!isValidVooFile(file) || !Array.isArray(file.document?.nodes) || !file.document.nodes.length) throw new Error("resource-empty");
  return file;
}

export function isolateResourceAssets(file) {
  const assets = file.assets ?? file.images ?? {};
  const remap = new Map(Object.keys(assets).map(id => [id, crypto.randomUUID()]));
  for (const id of imageIdsOfDocument(file.document, "design")) {
    if (!remap.has(id)) throw new Error("resource-asset-missing");
  }
  const rewrite = value => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key,
      ["imageId", "maskId", "sourceImageId", "textureImageId", "bitmapId"].includes(key) && remap.has(entry)
        ? remap.get(entry) : rewrite(entry)]));
  };
  const nextAssets = Object.fromEntries(Object.entries(assets).map(([id, data]) => [remap.get(id), data]));
  return { ...file, document: rewrite(file.document), assets: nextAssets, images: nextAssets };
}

export async function readWorkspaceResource(item) {
  if (item.size > MAX_RESOURCE_BYTES) throw new Error("resource-too-large");
  return isolateResourceAssets(decodeResource(await workspaceStorage.readFileBytes(item.path || item.id)));
}

/** Physical Resources directory for mounted workspaces; virtual folder in browsers. */
export async function saveWorkspaceResource(file, name) {
  const bytes = encodeVooBinary(file);
  if (bytes.byteLength > MAX_RESOURCE_BYTES) throw new Error("resource-too-large");
  const driver = workspaceStorage.getDriver();
  const folders = await workspaceStorage.listFolders();
  if (!folders.some(folder => folder.name === RESOURCE_FOLDER)) {
    const result = await workspaceStorage.createFolder(RESOURCE_FOLDER);
    if (!result.ok && result.error !== "already_exists") throw new Error("resource-folder-failed");
  }
  const safeName = String(name || "Resource").replace(/\.(voo|png|jpe?g|webp|svg)$/i, "").replace(/[\s\\/:*?"<>|]+/g, "").slice(0, 80) || "Resource";
  // Unique filenames keep repeated imports from overwriting existing library items.
  const filename = `${safeName}-${crypto.randomUUID().slice(0, 8)}.voo`;
  if (workspaceStorage.getDriver() !== driver) throw new Error("resource-workspace-changed");
  const result = await workspaceStorage.writeFileBytes(filename, bytes, {
    folder: RESOURCE_FOLDER, preview: file.preview ?? null,
  });
  if (!result.ok) throw new Error("resource-write-failed");
  if (workspaceStorage.getDriver() !== driver) throw new Error("resource-workspace-changed");
  // Native drivers may write at the root even when a folder option is supplied.
  // Route through their existing move API so every backend has the same home.
  if (result.folder !== RESOURCE_FOLDER) {
    const moved = await workspaceStorage.moveToFolder(result.path || result.id, RESOURCE_FOLDER);
    if (!moved.ok) throw new Error("resource-move-failed");
    return { ...result, ...moved.file, folder: RESOURCE_FOLDER };
  }
  return result;
}

export async function packageResource(document, preview = null) {
  const { readRequiredAsset } = await import("../store/project_io.js");
  const assets = Object.fromEntries(await Promise.all([...imageIdsOfDocument(document, "design")]
    .map(async id => [id, await readRequiredAsset(id)])));
  return { format: "voo", version: 1, document, images: assets, ...(preview ? { preview } : {}) };
}

export async function importResourceFile(file) {
  const driver = workspaceStorage.getDriver();
  if (file.size > MAX_RESOURCE_BYTES) throw new Error("resource-too-large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let resource;
  if (/\.voo$/i.test(file.name)) resource = decodeResource(bytes);
  else if (/\.svg$/i.test(file.name)) {
    const { svgBytesToVooFile } = await import("../store/svg_document_io.js");
    resource = await svgBytesToVooFile(bytes, file.name);
  } else if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
    const bitmap = await createImageBitmap(file);
    try {
      const { createDocument, createImageNode } = await import("../editor/scene_model.js");
      const id = crypto.randomUUID();
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file);
      });
      const document = createDocument(bitmap.width, bitmap.height, "transparent");
      document.resourceSelection = true;
      document.nodes = [createImageNode({ x: 0, y: 0, imageId: id, width: bitmap.width, height: bitmap.height, name: file.name })];
      resource = { format: "voo", version: 1, document, images: { [id]: dataUrl }, preview: dataUrl };
    } finally { bitmap.close(); }
  } else throw new Error("resource-format-unsupported");
  if (workspaceStorage.getDriver() !== driver) throw new Error("resource-workspace-changed");
  return saveWorkspaceResource(resource, file.name);
}
