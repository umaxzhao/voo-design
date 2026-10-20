/** Input adapters only: every caller still parses through parseExternalSkill. */
import {
  MAX_SKILL_PACKAGE_BYTES,
  MAX_SKILL_RESOURCE_BYTES,
  validateSkillFiles,
} from "./skill_descriptors.js";

const TEXT_RESOURCE_PATTERN =
  /\.(?:md|markdown|txt|json|ya?ml|js|jsx|ts|tsx|py|sh|css|html|xml|svg|csv|toml|sql)$/i;

function resourceMimeType(path) {
  const extension = path.split(".").at(-1)?.toLowerCase();
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      gif: "image/gif",
      svg: "image/svg+xml",
      pdf: "application/pdf",
      json: "application/json",
    }[extension] ??
    (TEXT_RESOURCE_PATTERN.test(path)
      ? "text/plain"
      : "application/octet-stream")
  );
}

function encodeBase64(bytes) {
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    encoded += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(encoded);
}

function entryBytes(entry) {
  if (entry.bytes) return entry.bytes;
  if (typeof entry.base64 === "string") {
    return Uint8Array.from(atob(entry.base64), (character) =>
      character.charCodeAt(0),
    );
  }
  return new TextEncoder().encode(entry.text ?? "");
}

async function inflateBounded(bytes, expectedSize) {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("unsupportedResource");
  }
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  let complete = false;
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      complete = done;
      if (complete) break;
      length += value.byteLength;
      if (length > expectedSize || length > MAX_SKILL_RESOURCE_BYTES) {
        throw new Error("tooLarge");
      }
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

/** Keep resources scoped to their SKILL.md directory, with safe relative paths. */
export function buildSkillPackageInputs(entries) {
  const files = entries.map((entry) => ({
    name: entry.name,
    size: entry.size ?? entryBytes(entry).byteLength,
  }));
  const validation = validateSkillFiles(files);
  if (!validation.ok) {
    return [{ name: "SKILL.md", error: validation.error.code }];
  }
  const manifests = entries.filter((entry) =>
    /(^|\/)SKILL\.md$/i.test(entry.name),
  );
  return manifests.map((manifest) => {
    const prefix = manifest.name.slice(0, manifest.name.lastIndexOf("/") + 1);
    const resources = entries
      .filter((entry) => {
        if (entry === manifest || !entry.name.startsWith(prefix)) return false;
        if (/^SKILL\.md$/i.test(entry.name.slice(prefix.length))) return false;
        return !manifests.some((other) => {
          if (other === manifest) return false;
          const otherPrefix = other.name.slice(
            0,
            other.name.lastIndexOf("/") + 1,
          );
          return (
            otherPrefix.length > prefix.length &&
            entry.name.startsWith(otherPrefix)
          );
        });
      })
      .map((entry) => {
        const path = entry.name.slice(prefix.length);
        const bytes = entryBytes(entry);
        const isText = TEXT_RESOURCE_PATTERN.test(path);
        return {
          path,
          mimeType: resourceMimeType(path),
          encoding: isText ? "utf8" : "base64",
          content: isText
            ? new TextDecoder("utf-8", { fatal: true }).decode(bytes)
            : encodeBase64(bytes),
          size: bytes.byteLength,
        };
      });
    return {
      name: manifest.name,
      text: new TextDecoder("utf-8", { fatal: true }).decode(
        entryBytes(manifest),
      ),
      resources,
    };
  });
}

/**
 * Unpack files from a ZIP ArrayBuffer using standard DecompressionStream.
 * Handles both uncompressed (method 0) and Deflate-compressed (method 8) entries.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<Array<{ name: string, bytes: Uint8Array, size: number }>>}
 */
export async function extractZipEntries(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // Scan backwards for End of Central Directory (EOCD) signature: 0x06054b50
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return [];

  const totalEntries = view.getUint16(eocd + 10, true);
  if (totalEntries > 1000) throw new Error("tooLarge");
  const cdOffset = view.getUint32(eocd + 16, true);
  const entries = [];
  let totalBytes = 0;
  let pos = cdOffset;

  for (let i = 0; i < totalEntries && pos + 46 <= bytes.length; i += 1) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x02014b50) break;

    const method = view.getUint16(pos + 10, true);
    const compSize = view.getUint32(pos + 20, true);
    const rawSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const unixMode = view.getUint32(pos + 38, true) >>> 16;

    const rawName = new TextDecoder().decode(
      bytes.subarray(pos + 46, pos + 46 + nameLen),
    );
    pos += 46 + nameLen + extraLen + commentLen;

    if (rawName.split("/").some((part) => part === "." || part === "..")) {
      throw new Error("pathTraversal");
    }

    // Ignore directory markers, macOS metadata, and hidden files
    if (
      rawName.endsWith("/") ||
      rawName.includes("__MACOSX/") ||
      /(^|\/)\.[^/]/.test(rawName) ||
      (unixMode & 0o170000) === 0o120000
    ) {
      continue;
    }

    // Read local header to get precise data offset
    if (localOffset + 30 > bytes.length) continue;
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    if (dataStart + compSize > bytes.length) continue;

    if (rawSize > MAX_SKILL_RESOURCE_BYTES) throw new Error("tooLarge");
    totalBytes += rawSize;
    if (totalBytes > MAX_SKILL_PACKAGE_BYTES) throw new Error("tooLarge");
    const compData = bytes.subarray(dataStart, dataStart + compSize);
    let content;
    try {
      if (method === 0) {
        content = new Uint8Array(compData);
      } else if (method === 8) {
        content = await inflateBounded(compData, rawSize);
      } else {
        throw new Error("unsupportedResource");
      }
    } catch (error) {
      if (error.message === "tooLarge") throw error;
      throw new Error("unsupportedResource");
    }
    if (content.byteLength !== rawSize) throw new Error("unsupportedResource");
    entries.push({ name: rawName, bytes: content, size: rawSize });
  }

  return entries;
}

export async function readBrowserSkillFiles(fileList) {
  const results = [];
  for (const file of fileList) {
    results.push(...(await readSkillFile(file)));
  }
  return results;
}

/**
 * Read one user-picked Skill file into records ready for parseExternalSkill.
 *
 * Bundles are ZIP containers, but they ship under several extensions — `.skill`
 * in particular is a ZIP that is not named `.zip`. The container is therefore
 * detected by its magic bytes rather than by filename, so a `.skill` bundle is
 * unpacked instead of being decoded as text and failing to parse.
 *
 * @param {{ name?: string, text?: Function, arrayBuffer?: Function }} file
 * @returns {Promise<Array<{ name: string, text: string } | { name: string, error: string }>>}
 */
export async function readSkillFile(file) {
  const name = file?.name || "";

  let buffer = null;
  try {
    if (typeof file?.arrayBuffer === "function")
      buffer = await file.arrayBuffer();
  } catch {
    buffer = null;
  }

  const head = buffer
    ? new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
    : null;
  if (head && head[0] === 0x50 && head[1] === 0x4b) {
    try {
      return buildSkillPackageInputs(await extractZipEntries(buffer));
    } catch (error) {
      const code = ["tooLarge", "pathTraversal"].includes(error.message)
        ? error.message
        : "notText";
      return [{ name, error: code }];
    }
  }

  if (name !== "SKILL.md") {
    return [{ name, error: "skillFileRequired" }];
  }
  try {
    return [{ name, text: await file.text() }];
  } catch {
    return [{ name, error: "notText" }];
  }
}

export async function readElectronSkillDirectory(desktopBridge) {
  if (typeof desktopBridge?.chooseSkillDirectory !== "function") return null;
  const result = await desktopBridge.chooseSkillDirectory();
  if (!result || result.canceled) return [];
  return buildSkillPackageInputs(result.files ?? []);
}
