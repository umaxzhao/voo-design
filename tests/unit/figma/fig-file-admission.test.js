// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as UZIP from "uzip";
import { parseFigFile } from "../../../src/canvas/figma/fig-file.js";
vi.mock("uzip", async (importOriginal) => {
    const original = await importOriginal();
    const actual = original.default ?? original;
    return { ...actual, parse: vi.fn(actual.parse) };
});
function archive() {
    return new Uint8Array(UZIP.encode({ "canvas.fig": new Uint8Array([1, 2, 3]) }));
}
function directoryOffset(bytes) {
    return new DataView(bytes.buffer).getUint32(bytes.length - 6, true);
}
function preventLegacyExpansion() {
    vi.mocked(UZIP.parse).mockImplementation(() => {
        throw new Error("Unsafe full-archive expansion was reached");
    });
}
beforeEach(() => {
    vi.mocked(UZIP.parse).mockReset();
});
describe("Figma archive admission before expansion", () => {
    it("rejects a missing end record without entering an unbounded ZIP scan", async () => {
        const bytes = archive().subarray(0, 33);
        preventLegacyExpansion();
        await expect(parseFigFile(bytes)).rejects.toThrow("end record");
        expect(UZIP.parse).not.toHaveBeenCalled();
    });
});
