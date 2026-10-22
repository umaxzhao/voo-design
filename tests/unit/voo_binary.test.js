import { describe, expect, it } from "vitest";
import {
  decodeVooBinary,
  encodeVooBinary,
  isVooBinary,
  sniffImageMime,
} from "../../src/canvas/store/voo_binary.js";
import { base64ToBytes, bytesToBase64 } from "../../src/shared/base64.js";

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngBytes(length) {
  const bytes = new Uint8Array(length);
  bytes.set(PNG_HEADER, 0);
  for (let index = PNG_HEADER.length; index < length; index += 1) {
    bytes[index] = (index * 131) % 256;
  }
  return bytes;
}

function pngDataUrl(bytes) {
  return `data:image/png;base64,${bytesToBase64(bytes)}`;
}

function envelope(assets, extra = {}) {
  return {
    format: "voo-editor",
    version: 2,
    kind: "design",
    document: { pages: [], nodes: [{ kind: "image", imageId: "a" }] },
    assets,
    ...extra,
  };
}

describe("binary .voo container", () => {
  it("round-trips data-URL and byte assets, keeping the preview", () => {
    const original = pngBytes(1024);
    const vooFile = envelope(
      { a: pngDataUrl(original), b: original.slice() },
      { preview: pngDataUrl(pngBytes(64)) },
    );

    const decoded = decodeVooBinary(encodeVooBinary(vooFile));

    expect(decoded.document).toEqual(vooFile.document);
    expect(decoded.assets.a).toBe(pngDataUrl(original));
    expect(decoded.assets.b).toBe(pngDataUrl(original));
    expect(decoded.preview).toBe(pngDataUrl(pngBytes(64)));
  });

  it("keeps the v1 images key for v1 envelopes", () => {
    const vooFile = {
      format: "voo-editor",
      version: 1,
      document: { nodes: [] },
      images: { a: pngDataUrl(pngBytes(32)) },
    };

    const decoded = decodeVooBinary(encodeVooBinary(vooFile));

    expect(decoded.version).toBe(1);
    expect(decoded.images.a).toBe(pngDataUrl(pngBytes(32)));
  });

  it("is recognised by its magic and rejects JSON text", () => {
    const bytes = encodeVooBinary(envelope({}));

    expect(isVooBinary(bytes)).toBe(true);
    expect(isVooBinary(new TextEncoder().encode('{"format":"voo-editor"}'))).toBe(false);
  });

  it("refuses bytes that are not a binary container", () => {
    expect(() => decodeVooBinary(new TextEncoder().encode("{}"))).toThrow("voo-binary-magic-missing");
  });

  it("stores image bytes without base64 expansion", () => {
    const image = pngBytes(300_000);
    const vooFile = envelope({ a: pngDataUrl(image) });

    const binarySize = encodeVooBinary(vooFile).length;
    const jsonSize = JSON.stringify(vooFile).length;

    expect(binarySize).toBeLessThan(jsonSize);
    expect(binarySize).toBeLessThan(image.length + 2_000);
  });

  it("names the MIME type from the image signature", () => {
    expect(sniffImageMime(pngBytes(16))).toBe("image/png");
    expect(sniffImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageMime(Uint8Array.from([1, 2, 3, 4]))).toBe("application/octet-stream");
  });
});

describe("base64 decoding", () => {
  it("decodes padded and unpadded text to the same bytes as the encoder read", () => {
    expect(base64ToBytes("AQ==")).toEqual(Uint8Array.from([1]));
    expect(base64ToBytes("AQI=")).toEqual(Uint8Array.from([1, 2]));
    expect(base64ToBytes("AQID")).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it("round-trips every length modulo three", () => {
    for (let length = 0; length < 12; length += 1) {
      const bytes = new Uint8Array(length).map((_, index) => (index * 97 + 13) % 256);

      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });
});
