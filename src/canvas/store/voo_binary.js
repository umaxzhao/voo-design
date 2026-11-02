/**
 * Binary `.voo` container: a JSON header followed by the raw image bytes.
 *
 * Layout:
 *   magic        8 bytes   "VOOBIN01"
 *   header size  u32 LE    byte length of the header
 *   header       UTF-8 JSON: the document envelope, with the asset map replaced
 *                by an index of { offset, length, mime } into the payload
 *   payload      each asset's bytes, back to back, in their own encoding
 *                (PNG, JPEG, video, ...) rather than base64 text
 *
 * Images in a JSON `.voo` are base64 strings, which add a third to their size
 * and then get escaped inside the JSON. Storing the bytes directly makes the
 * file the size of its images. Older JSON `.voo` files stay readable: the
 * magic tells the two apart.
 */

import { base64ToBytes, bytesToBase64 } from "../../shared/base64.js";

export const VOO_BINARY_MAGIC = "VOOBIN01";
const MAGIC_BYTES = new TextEncoder().encode(VOO_BINARY_MAGIC);
const HEADER_LENGTH_OFFSET = MAGIC_BYTES.length;
const PAYLOAD_PREFIX_BYTES = MAGIC_BYTES.length + 4;
/** Key of the flattened preview PNG inside the asset index. */
const PREVIEW_ASSET_ID = "__preview";
const DATA_URL_PATTERN = /^data:([^;,]+);base64,(.*)$/s;

export function isVooBinary(bytes) {
  if (bytes.length < PAYLOAD_PREFIX_BYTES) return false;
  return MAGIC_BYTES.every((byte, index) => bytes[index] === byte);
}

/** MIME type of raw image bytes, from their signature. */
export function sniffImageMime(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return isWebp ? "image/webp" : "application/octet-stream";
}

/** Raw bytes and MIME type of one asset, whether it is a data URL or bytes already. */
function assetBytes(id, value) {
  if (value instanceof Uint8Array) return { bytes: value, mime: sniffImageMime(value) };
  if (typeof value === "string") {
    const match = DATA_URL_PATTERN.exec(value);
    if (!match) throw new Error(`voo-asset-not-base64-data-url:${id}`);
    return { bytes: base64ToBytes(match[2]), mime: match[1] };
  }
  throw new Error(`voo-asset-unsupported:${id}`);
}

/** The asset map of an envelope: `assets` for v2, `images` for v1. */
function assetMapOf(vooFile) {
  return vooFile.version === 1 ? vooFile.images ?? {} : vooFile.assets ?? {};
}

/**
 * Serialises a `.voo` envelope (v1 or v2) to the binary container.
 *
 * @param {object} vooFile the envelope from `buildVooFile`
 * @returns {Uint8Array}
 */
export function encodeVooBinary(vooFile) {
  const envelope = { ...vooFile };
  const { preview } = envelope;
  delete envelope.assets;
  delete envelope.images;
  delete envelope.preview;
  const entries = Object.entries(assetMapOf(vooFile));
  if (preview) entries.push([PREVIEW_ASSET_ID, preview]);

  const index = {};
  const parts = [];
  let payloadBytes = 0;
  for (const [id, value] of entries) {
    const { bytes, mime } = assetBytes(id, value);
    index[id] = { offset: payloadBytes, length: bytes.length, mime };
    parts.push(bytes);
    payloadBytes += bytes.length;
  }

  const header = new TextEncoder().encode(
    JSON.stringify({ ...envelope, assetIndex: index }),
  );
  const out = new Uint8Array(PAYLOAD_PREFIX_BYTES + header.length + payloadBytes);
  out.set(MAGIC_BYTES, 0);
  new DataView(out.buffer).setUint32(HEADER_LENGTH_OFFSET, header.length, true);
  out.set(header, PAYLOAD_PREFIX_BYTES);
  let cursor = PAYLOAD_PREFIX_BYTES + header.length;
  for (const bytes of parts) {
    out.set(bytes, cursor);
    cursor += bytes.length;
  }
  return out;
}

/**
 * Parses a binary container back into a `.voo` envelope. Assets come back as
 * data URLs, the form the editor's image store and hydration already use.
 */
export function decodeVooBinary(bytes) {
  if (!isVooBinary(bytes)) throw new Error("voo-binary-magic-missing");
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
    HEADER_LENGTH_OFFSET,
    true,
  );
  const payloadStart = PAYLOAD_PREFIX_BYTES + headerLength;
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(PAYLOAD_PREFIX_BYTES, payloadStart)));
  const { assetIndex, ...envelope } = header;

  const assets = {};
  let preview = null;
  for (const [id, entry] of Object.entries(assetIndex ?? {})) {
    const start = payloadStart + entry.offset;
    const end = start + entry.length;
    if (end > bytes.length) throw new Error(`voo-asset-out-of-range:${id}`);
    const dataUrl = `data:${entry.mime};base64,${bytesToBase64(bytes.subarray(start, end))}`;
    if (id === PREVIEW_ASSET_ID) preview = dataUrl;
    else assets[id] = dataUrl;
  }

  const assetKey = envelope.version === 1 ? "images" : "assets";
  return { ...envelope, [assetKey]: assets, ...(preview ? { preview } : {}) };
}
