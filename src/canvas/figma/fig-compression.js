import { decompress as decompressZstd } from "fzstd";
const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
function isZstd(bytes) {
    return (bytes.length >= ZSTD_MAGIC.length &&
        ZSTD_MAGIC.every((value, index) => bytes[index] === value));
}
async function inflateRaw(bytes) {
    const source = new ReadableStream({
        start(controller) {
            controller.enqueue(bytes.slice());
            controller.close();
        },
    });
    const inflated = source.pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(inflated).arrayBuffer());
}
/** Figma currently emits deflate-raw and zstd chunks. Raw chunks are valid. */
export async function decompressFigChunk(bytes) {
    if (isZstd(bytes))
        return decompressZstd(bytes);
    try {
        return await inflateRaw(bytes);
    }
    catch {
        try {
            return decompressZstd(bytes);
        }
        catch {
            return bytes;
        }
    }
}
