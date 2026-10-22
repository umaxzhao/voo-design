// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as UZIP from "uzip";
import { readFigZipDirectory } from "../../../src/canvas/figma/fig-zip-directory.js";
import { extractFigZip } from "../../../src/canvas/figma/fig-zip-reader.js";
const payload = new TextEncoder().encode("Synthetic canvas bytes");
const zip = (entries, stored = false) => new Uint8Array(UZIP.encode(entries, stored));
const directory = (bytes) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(bytes.length - 6, true);
function changeSize(bytes, size) {
    const view = new DataView(bytes.buffer);
    view.setUint32(22, size, true);
    view.setUint32(directory(bytes) + 24, size, true);
}
function descriptorArchive(signed) {
    const original = zip({ "canvas.fig": payload });
    const oldView = new DataView(original.buffer);
    const oldDirectory = directory(original);
    const crc = oldView.getUint32(oldDirectory + 16, true);
    const compressed = oldView.getUint32(oldDirectory + 20, true);
    const unpacked = oldView.getUint32(oldDirectory + 24, true);
    const length = signed ? 16 : 12;
    const bytes = new Uint8Array(original.length + length);
    bytes.set(original.subarray(0, oldDirectory));
    bytes.set(original.subarray(oldDirectory), oldDirectory + length);
    const view = new DataView(bytes.buffer);
    let descriptor = oldDirectory;
    if (signed) {
        view.setUint32(descriptor, 0x08074b50, true);
        descriptor += 4;
    }
    [crc, compressed, unpacked].forEach((value, index) => view.setUint32(descriptor + index * 4, value, true));
    view.setUint16(6, 8, true);
    [14, 18, 22].forEach((offset) => view.setUint32(offset, 0, true));
    view.setUint16(oldDirectory + length + 8, 8, true);
    view.setUint32(bytes.length - 6, oldDirectory + length, true);
    return bytes;
}
describe("bounded native Figma ZIP extraction", () => {
    it.each([false, true])("reads stored=%s document and exact image bytes", async (stored) => {
        const image = new Uint8Array([137, 80, 78, 71]);
        const result = await extractFigZip(zip({
            "canvas.fig": payload,
            "images/abc": image,
            "images/": new Uint8Array(),
            "meta.json": new TextEncoder().encode('{"source":"synthetic"}'),
        }, stored));
        expect(result.canvas).toEqual(payload);
        expect([...result.images]).toEqual([["abc", image]]);
    });
    it.each([0, 1, 7, 8, 9, 31, 16385, 65539])("verifies CRC across block and tail boundaries for %s bytes", async (size) => {
        const data = Uint8Array.from({ length: size }, (_, index) => ((index * 73) ^ (index >>> 3)) & 0xff);
        for (const stored of [false, true]) {
            const bytes = zip({ "canvas.fig": data }, stored);
            expect((await extractFigZip(bytes)).canvas).toEqual(data);
        }
    });
    it("respects the source view's byte offset without copying the whole archive", async () => {
        const source = zip({ "canvas.fig": payload });
        const buffer = new Uint8Array(source.length + 40);
        buffer.set(source, 20);
        expect((await extractFigZip(buffer.subarray(20, 20 + source.length))).canvas).toEqual(payload);
    });
    it.each([false, true])("accepts a signed=%s data descriptor", async (signed) => {
        expect((await extractFigZip(descriptorArchive(signed))).canvas).toEqual(payload);
    });
    it("accepts an archive comment containing a non-terminal signature", async () => {
        const source = zip({ "canvas.fig": payload });
        const comment = new Uint8Array([80, 75, 5, 6, 1, 2, 3]);
        const bytes = new Uint8Array(source.length + comment.length);
        bytes.set(source);
        bytes.set(comment, source.length);
        new DataView(bytes.buffer).setUint16(source.length - 2, comment.length, true);
        expect((await extractFigZip(bytes)).canvas).toEqual(payload);
    });
    it("accepts a comment ending in a complete EOCD-shaped empty archive", async () => {
        const source = zip({ "canvas.fig": payload });
        const bytes = new Uint8Array(source.length + 22);
        bytes.set(source);
        const view = new DataView(bytes.buffer);
        view.setUint16(source.length - 2, 22, true);
        view.setUint32(source.length, 0x06054b50, true);
        view.setUint32(source.length + 16, source.length, true);
        expect((await extractFigZip(bytes)).canvas).toEqual(payload);
    });
    it("rejects local/directory checksum disagreement", async () => {
        const bytes = zip({ "canvas.fig": payload });
        bytes[14] ^= 1;
        await expect(extractFigZip(bytes)).rejects.toThrow("checksums disagree");
    });
    it("checks actual CRC even when the two declared checksums agree", async () => {
        const bytes = zip({ "canvas.fig": payload }, true);
        bytes[readFigZipDirectory(bytes)[0].dataOffset] ^= 1;
        await expect(extractFigZip(bytes)).rejects.toThrow("CRC32 mismatch");
    });
    it("validates CRC of unused metadata rather than silently discarding corruption", async () => {
        const bytes = zip({ "canvas.fig": payload, "meta.json": new Uint8Array([1, 2, 3]) }, true);
        bytes[readFigZipDirectory(bytes)[1].dataOffset] ^= 1;
        await expect(extractFigZip(bytes)).rejects.toThrow("CRC32 mismatch");
    });
    it("stops native decompression when actual output exceeds the declared size", async () => {
        const bytes = zip({ "canvas.fig": new Uint8Array(64 * 1024) });
        changeSize(bytes, 1);
        await expect(extractFigZip(bytes)).rejects.toThrow("exceeds its declared unpacked size");
    });
    it("rejects a truncated decoded entry", async () => {
        const bytes = zip({ "canvas.fig": payload });
        changeSize(bytes, payload.length + 1);
        await expect(extractFigZip(bytes)).rejects.toThrow("unpacked size does not match");
    });
    it("does not retain a large unreferenced metadata payload", async () => {
        const result = await extractFigZip(zip({
            "canvas.fig": payload,
            "thumbnail.png": new Uint8Array(1024 * 1024),
        }));
        expect(Object.keys(result)).toEqual(["canvas", "images"]);
        expect(result.canvas).toEqual(payload);
        expect(result.images.size).toBe(0);
    });
});
describe("complete ZIP directory admission", () => {
    it.each([1, 0x40, 0x2000])("rejects encrypted flags %s", (flags) => {
        const bytes = zip({ "canvas.fig": payload });
        new DataView(bytes.buffer).setUint16(directory(bytes) + 8, flags, true);
        expect(() => readFigZipDirectory(bytes)).toThrow("encrypted");
    });
    it("rejects unsupported compression explicitly", () => {
        const bytes = zip({ "canvas.fig": payload });
        new DataView(bytes.buffer).setUint16(directory(bytes) + 10, 93, true);
        expect(() => readFigZipDirectory(bytes)).toThrow("unsupported ZIP compression");
    });
    it("rejects inconsistent stored lengths", () => {
        const bytes = zip({ "canvas.fig": payload }, true);
        changeSize(bytes, payload.length + 1);
        expect(() => readFigZipDirectory(bytes)).toThrow("stored ZIP entry sizes disagree");
    });
    it("rejects duplicate central and local names", () => {
        const bytes = zip({
            "canvas.fig": payload,
            "images/a": new Uint8Array([1]),
            "images/b": new Uint8Array([2]),
        });
        const entry = readFigZipDirectory(bytes)[2];
        const view = new DataView(bytes.buffer);
        let central = directory(bytes);
        for (let i = 0; i < 2; i++)
            central += 46 + view.getUint16(central + 28, true);
        bytes[central + 46 + "images/".length] = 97;
        bytes[entry.dataOffset - 1] = 97;
        expect(() => readFigZipDirectory(bytes)).toThrow("duplicate ZIP entry");
    });
    it("rejects the central name differing from the local name", () => {
        const bytes = zip({ "canvas.fig": payload });
        bytes[30] = 120;
        expect(() => readFigZipDirectory(bytes)).toThrow("names disagree");
    });
    it("rejects overlapping local data even when each range fits the archive", () => {
        const bytes = zip({ "canvas.fig": payload, "meta.json": payload }, true);
        const view = new DataView(bytes.buffer);
        const first = directory(bytes);
        const secondData = readFigZipDirectory(bytes)[1].dataOffset;
        const size = secondData - readFigZipDirectory(bytes)[0].dataOffset;
        view.setUint32(first + 20, size, true);
        view.setUint32(first + 24, size, true);
        view.setUint32(18, size, true);
        view.setUint32(22, size, true);
        expect(() => readFigZipDirectory(bytes)).toThrow("overlap");
    });
    it("rejects offsets pointing outside the payload area", () => {
        const bytes = zip({ "canvas.fig": payload });
        new DataView(bytes.buffer).setUint32(directory(bytes) + 42, bytes.length, true);
        expect(() => readFigZipDirectory(bytes)).toThrow("bounds");
    });
    it("rejects mismatched data descriptors", () => {
        const bytes = descriptorArchive(true);
        bytes[directory(bytes) - 4] ^= 1;
        expect(() => readFigZipDirectory(bytes)).toThrow("data descriptor");
    });
    it("rejects split archives", () => {
        const bytes = zip({ "canvas.fig": payload });
        new DataView(bytes.buffer).setUint16(bytes.length - 18, 1, true);
        expect(() => readFigZipDirectory(bytes)).toThrow("split ZIP");
    });
    it("reports unsupported ZIP64 without interpreting its sizes as allocations", () => {
        const bytes = zip({ "canvas.fig": payload });
        new DataView(bytes.buffer).setUint32(directory(bytes) + 24, 0xffffffff, true);
        expect(() => readFigZipDirectory(bytes)).toThrow("ZIP64");
    });
});
