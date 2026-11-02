import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { decodeVooBinary } from "../../src/canvas/store/voo_binary.js";

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

/** Validate the actual downloaded archive, not a reconstructed test envelope. */
export function verifyGeneratedSnapshot(bytes, expected) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (
    end >= Math.max(0, bytes.length - 65557) &&
    view.getUint32(end, true) !== 0x06054b50
  )
    end--;
  assert.ok(end >= 0, "A downloaded ZIP must have an end record");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const members = [];
  for (let index = 0; index < count; index++) {
    assert.equal(
      view.getUint32(offset, true),
      0x02014b50,
      "Real central-directory member",
    );
    const nameLength = view.getUint16(offset + 28, true);
    const local = view.getUint32(offset + 42, true);
    assert.equal(
      view.getUint32(local, true),
      0x04034b50,
      "Real local ZIP header",
    );
    members.push({
      path: new TextDecoder().decode(
        bytes.subarray(offset + 46, offset + 46 + nameLength),
      ),
      method: view.getUint16(offset + 10, true),
      crc32: view.getUint32(offset + 16, true),
      compressedBytes: view.getUint32(offset + 20, true),
      unpackedBytes: view.getUint32(offset + 24, true),
      dataOffset:
        local +
        30 +
        view.getUint16(local + 26, true) +
        view.getUint16(local + 28, true),
    });
    offset +=
      46 +
      nameLength +
      view.getUint16(offset + 30, true) +
      view.getUint16(offset + 32, true);
  }
  assert.equal(
    offset,
    end,
    "Snapshot directory ends at the archive end record",
  );
  const files = new Map();
  for (const entry of members) {
    const compressed = bytes.subarray(
      entry.dataOffset,
      entry.dataOffset + entry.compressedBytes,
    );
    const decoded =
      entry.method === 0
        ? compressed
        : inflateRawSync(compressed, {
            maxOutputLength: entry.unpackedBytes + 1,
          });
    assert.equal(
      decoded.length,
      entry.unpackedBytes,
      `${entry.path}: real unpacked bytes`,
    );
    assert.equal(
      crc32(decoded),
      entry.crc32,
      `${entry.path}: CRC32 must match`,
    );
    files.set(entry.path, decoded);
  }
  assert.ok(files.has("document.voo"));
  assert.ok(files.has("manifest.json"));
  const manifest = JSON.parse(
    new TextDecoder().decode(files.get("manifest.json")),
  );
  assert.equal(manifest.format, "voo-snapshot");
  assert.equal(manifest.version, 1);
  const document = decodeVooBinary(files.get("document.voo"));
  assert.equal(document.format, "voo-editor");
  const layer = document.document.nodes.find((node) => node.id === expected.id);
  assert.ok(layer, "The actual edited layer must be inside the saved document");
  for (const key of ["x", "y", "width", "height", "imageId"])
    assert.equal(layer[key], expected.node[key]);
  assert.deepEqual(
    layer.adjustments.brightness,
    expected.node.adjustments.brightness,
  );
  assert.ok(
    document.assets[layer.imageId],
    "The edited image must retain an embedded source asset",
  );
  if (files.has("preview.png"))
    assert.deepEqual(
      [...files.get("preview.png").subarray(0, 8)],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
  return members.map(({ path, crc32, unpackedBytes }) => ({
    path,
    crc32,
    unpackedBytes,
  }));
}
