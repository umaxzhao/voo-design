import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  bytesToBase64,
} from "../../../src/shared/base64.js";
import { loadFigmaSchema } from "../../../src/canvas/figma/figma-schema.js";

describe("base64 helpers", () => {
  it("round-trips bytes without a Buffer global", () => {
    const bytes = Uint8Array.from([0, 1, 127, 128, 254, 255]);

    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("pads the last group exactly as the standard alphabet does", () => {
    expect(bytesToBase64(Uint8Array.from([]))).toBe("");
    expect(bytesToBase64(Uint8Array.from([1]))).toBe("AQ==");
    expect(bytesToBase64(Uint8Array.from([1, 2]))).toBe("AQI=");
    expect(bytesToBase64(Uint8Array.from([1, 2, 3]))).toBe("AQID");
  });

  it("matches btoa on arbitrary bytes", () => {
    const bytes = new Uint8Array(4099).map((_, index) => (index * 37) % 256);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);

    expect(bytesToBase64(bytes)).toBe(btoa(binary));
  });

  it("encodes large arrays without exceeding the argument limit", () => {
    const bytes = new Uint8Array(300_000).map((_, index) => index % 251);

    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe("loadFigmaSchema", () => {
  it("decodes the bundled Figma Kiwi protocol with a Message definition", async () => {
    const schema = await loadFigmaSchema();

    expect(schema.definitions.length).toBeGreaterThan(100);
    expect(schema.definitions.some((item) => item.name === "Message")).toBe(
      true,
    );
  });
});
