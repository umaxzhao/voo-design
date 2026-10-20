const encoder = new TextEncoder();
const ZIP_LIMIT = 0xffffffff;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = ZIP_LIMIT;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ ZIP_LIMIT) >>> 0;
}

/** OOXML media is already compressed; ZIP Store avoids a compression dependency. */
export function packPresentationPptx(entries) {
  if (entries.length > 65535)
    throw new Error("Presentation PPTX has too many parts");
  const names = new Set();
  let localSize = 0;
  let centralSize = 0;
  const parts = entries.map(([path, value]) => {
    if (
      !path ||
      path.startsWith("/") ||
      path.includes("..") ||
      names.has(path)
    ) {
      throw new Error(
        "Presentation PPTX contains an invalid or duplicate part",
      );
    }
    names.add(path);
    const name = encoder.encode(path);
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    if (
      !(bytes instanceof Uint8Array) ||
      name.length > 65535 ||
      bytes.length >= ZIP_LIMIT
    ) {
      throw new Error(
        "Presentation PPTX contains an invalid or oversized part",
      );
    }
    const part = { name, bytes, crc: crc32(bytes), offset: localSize };
    localSize += 30 + name.length + bytes.length;
    centralSize += 46 + name.length;
    return part;
  });
  if (localSize + centralSize + 22 >= ZIP_LIMIT) {
    throw new Error("Presentation PPTX exceeds ZIP32 size limits");
  }
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  const u16 = (at, value) => view.setUint16(at, value, true);
  const u32 = (at, value) => view.setUint32(at, value, true);
  let centralOffset = localSize;
  for (const part of parts) {
    const { offset, name, bytes, crc } = part;
    u32(offset, 0x04034b50);
    u16(offset + 4, 20);
    u16(offset + 6, 0x800);
    u16(offset + 12, 0x21);
    u32(offset + 14, crc);
    u32(offset + 18, bytes.length);
    u32(offset + 22, bytes.length);
    u16(offset + 26, name.length);
    output.set(name, offset + 30);
    output.set(bytes, offset + 30 + name.length);
    u32(centralOffset, 0x02014b50);
    u16(centralOffset + 4, 20);
    u16(centralOffset + 6, 20);
    u16(centralOffset + 8, 0x800);
    u16(centralOffset + 14, 0x21);
    u32(centralOffset + 16, crc);
    u32(centralOffset + 20, bytes.length);
    u32(centralOffset + 24, bytes.length);
    u16(centralOffset + 28, name.length);
    u32(centralOffset + 42, offset);
    output.set(name, centralOffset + 46);
    centralOffset += 46 + name.length;
  }
  u32(centralOffset, 0x06054b50);
  u16(centralOffset + 8, parts.length);
  u16(centralOffset + 10, parts.length);
  u32(centralOffset + 12, centralSize);
  u32(centralOffset + 16, localSize);
  return output;
}
