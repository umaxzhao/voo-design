import * as UZIP from "uzip";
import { extractFigZip } from "./fig-zip-reader.js";
import { isFigContainer, parseFigContainer, } from "./fig-kiwi.js";
import { serializeFigContainer } from "./fig-kiwi-writer.js";
import { base64ToBytes, bytesToBase64 } from "../../shared/base64.js";
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const TRANSPARENT_PNG = base64ToBytes("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==");
// Current Figma desktop exports use Kiwi container version 106. Version 0 is
// not a valid native document version and makes Figma reject the archive.
export const FIGMA_KIWI_VERSION = 106;
function hasMagic(bytes, magic) {
    return (bytes.length >= magic.length &&
        magic.every((value, index) => bytes[index] === value));
}
export function isFigmaFileName(fileName) {
    return /\.fig(?:ma)?$/i.test(fileName);
}
export async function parseFigFile(bytes) {
    if (bytes.byteLength === 0)
        throw new Error("The Figma file is empty");
    let canvas = bytes;
    let images = new Map();
    if (hasMagic(bytes, ZIP_MAGIC)) {
        const archive = await extractFigZip(bytes);
        canvas = archive.canvas;
        images = archive.images;
    }
    if (!isFigContainer(canvas)) {
        throw new Error("Unsupported file: expected a native Figma .fig document");
    }
    const parsed = await parseFigContainer(canvas);
    return { ...parsed, images };
}
/** Serialize a decoded native document back to an editable fig-kiwi file. */
export async function serializeFigFile(document) {
    return serializeFigContainer(document);
}
export async function serializeFigArchive(document, metadata) {
    const canvas = await serializeFigFile(document);
    const meta = new TextEncoder().encode(JSON.stringify({
        // Match the metadata envelope written by Figma itself. The desktop app
        // reads this alongside canvas.fig when opening a native archive.
        client_meta: {
            background_color: { r: 1, g: 1, b: 1, a: 1 },
            thumbnail_size: { width: 1, height: 1 },
            render_coordinates: { x: 0, y: 0, width: 1, height: 1 },
        },
        file_name: metadata.name,
        developer_related_links: [],
        exported_at: new Date().toISOString(),
    }));
    const files = {
        "canvas.fig": canvas,
        "meta.json": meta,
        "thumbnail.png": TRANSPARENT_PNG,
    };
    for (const image of metadata.images?.values?.() ?? []) {
        if (!image.hashHex || !(image.bytes instanceof Uint8Array))
            throw new Error("fig-image-asset-invalid");
        files[`images/${image.hashHex}`] = image.bytes;
    }
    const encodeZip = UZIP.encode ?? UZIP.default?.encode;
    if (typeof encodeZip !== "function")
        throw new Error("fig-zip-encoder-unavailable");
    const archive = encodeZip(files);
    return new Uint8Array(archive);
}
export function detectImageMimeType(bytes) {
    if (hasMagic(bytes, [0x89, 0x50, 0x4e, 0x47]))
        return "image/png";
    if (hasMagic(bytes, [0xff, 0xd8, 0xff]))
        return "image/jpeg";
    if (hasMagic(bytes, [0x47, 0x49, 0x46, 0x38]))
        return "image/gif";
    if (bytes.length >= 12 &&
        String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
        return "image/webp";
    }
    return "application/octet-stream";
}
export function imageBytesToDataUrl(bytes) {
    return `data:${detectImageMimeType(bytes)};base64,${bytesToBase64(bytes)}`;
}
