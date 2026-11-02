/**
 * Portable snapshot package (`.zip`): one self-contained file holding the
 * `.voo` document, a manifest and the preview, so a design can be handed to
 * someone without a workspace. Uses the same store-only ZIP as the Figma
 * container (no compression dependency).
 *
 * A plain `.voo` already embeds its assets; the snapshot adds a stable
 * envelope for sharing/archival and the metadata around it.
 */

import * as UZIPModule from "uzip";

// Vite hands the CJS module as named exports; plain Node exposes it as default.
const UZIP = UZIPModule.encode ? UZIPModule : UZIPModule.default;
import { encodeVooBinary } from "./voo_binary.js";

export const SNAPSHOT_FORMAT = "voo-snapshot";
export const SNAPSHOT_VERSION = 1;
export const SNAPSHOT_DOCUMENT = "document.voo";
export const SNAPSHOT_MANIFEST = "manifest.json";
export const SNAPSHOT_PREVIEW = "preview.png";

const MAGIC = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

export function isSnapshotZipName(name) {
  return /\.zip$/i.test(String(name ?? ""));
}

export function isZipBytes(bytes) {
  return Boolean(
    bytes &&
      bytes.length >= MAGIC.length &&
      MAGIC.every((value, index) => bytes[index] === value),
  );
}

/** Data URL → bytes (only what the preview needs; other values are ignored). */
export function dataUrlBytes(dataUrl) {
  const match = /^data:[^;]+;base64,(.+)$/i.exec(String(dataUrl ?? ""));
  if (!match) return null;
  try {
    const binary = atob(match[1]);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Builds the snapshot archive.
 *
 * @param {object} input
 * @param {object} input.vooFile  v2 `.voo` envelope (document + assets)
 * @param {string} [input.name]   document name without extension
 * @param {string|null} [input.preview] preview data URL
 * @param {string|null} [input.appVersion]
 * @returns {Uint8Array}
 */
export function buildSnapshotZip({ vooFile, name = "Untitled", preview = null, appVersion = null } = {}) {
  if (!vooFile) throw new Error("snapshot-needs-document");
  const encoder = new TextEncoder();
  const entries = {
    [SNAPSHOT_DOCUMENT]: encodeVooBinary(vooFile),
    [SNAPSHOT_MANIFEST]: encoder.encode(
      JSON.stringify(
        {
          format: SNAPSHOT_FORMAT,
          version: SNAPSHOT_VERSION,
          name,
          createdAt: new Date().toISOString(),
          ...(appVersion ? { appVersion } : {}),
        },
        null,
        2,
      ),
    ),
  };
  const previewBytes = dataUrlBytes(preview);
  if (previewBytes) entries[SNAPSHOT_PREVIEW] = previewBytes;
  return new Uint8Array(UZIP.encode(entries));
}

/**
 * Reads a snapshot archive. Returns `{name, vooBytes, manifest}` or null when
 * the zip has no `.voo` member.
 */
export function extractSnapshotZip(bytes) {
  // A truncated header makes the ZIP parser loop; require a minimal archive.
  if (!isZipBytes(bytes) || bytes.length < 22) return null;
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  let files;
  try {
    files = UZIP.parse(buffer);
  } catch {
    return null;
  }
  const names = Object.keys(files ?? {});
  const vooName =
    names.find((entry) => entry === SNAPSHOT_DOCUMENT) ??
    names.find((entry) => /\.voo$/i.test(entry));
  if (!vooName) return null;
  let manifest = null;
  if (files[SNAPSHOT_MANIFEST]) {
    try {
      manifest = JSON.parse(new TextDecoder().decode(files[SNAPSHOT_MANIFEST]));
    } catch {
      manifest = null;
    }
  }
  const derivedName =
    manifest && typeof manifest.name === "string" && manifest.name.trim()
      ? `${manifest.name.trim()}.voo`
      : vooName.split("/").pop();
  return {
    name: derivedName,
    vooBytes: new Uint8Array(files[vooName]),
    manifest,
    previewBytes: files[SNAPSHOT_PREVIEW] ?? null,
  };
}
