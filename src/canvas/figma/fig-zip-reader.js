import { FigArchiveError, readFigZipDirectory, } from "./fig-zip-directory.js";
function createCrc32Tables() {
    const tables = [
        Uint32Array.from({ length: 256 }, (_, index) => {
            let value = index;
            for (let bit = 0; bit < 8; bit++) {
                value = (value >>> 1) ^ ((value & 1) === 0 ? 0 : 0xedb88320);
            }
            return value >>> 0;
        }),
    ];
    // Table n advances one input byte through n additional CRC recurrence steps.
    for (let step = 1; step < 8; step++) {
        tables.push(Uint32Array.from(tables[step - 1], (value) => tables[0][value & 0xff] ^ (value >>> 8)));
    }
    return tables;
}
const CRC32_TABLES = createCrc32Tables();
function updateCrc32(crc, bytes) {
    let offset = 0;
    // Combine eight independent table contributions instead of serializing the
    // CRC dependency for every byte. The tail keeps the ordinary byte recurrence.
    for (; offset + 8 <= bytes.byteLength; offset += 8) {
        const word = crc ^
            (bytes[offset] |
                (bytes[offset + 1] << 8) |
                (bytes[offset + 2] << 16) |
                (bytes[offset + 3] << 24));
        crc =
            CRC32_TABLES[7][word & 0xff] ^
                CRC32_TABLES[6][(word >>> 8) & 0xff] ^
                CRC32_TABLES[5][(word >>> 16) & 0xff] ^
                CRC32_TABLES[4][word >>> 24] ^
                CRC32_TABLES[3][bytes[offset + 4]] ^
                CRC32_TABLES[2][bytes[offset + 5]] ^
                CRC32_TABLES[1][bytes[offset + 6]] ^
                CRC32_TABLES[0][bytes[offset + 7]];
    }
    for (; offset < bytes.byteLength; offset++) {
        crc = CRC32_TABLES[0][(crc ^ bytes[offset]) & 0xff] ^ (crc >>> 8);
    }
    return crc;
}
async function decodeEntry(compressed, entry, retain) {
    let crc = 0xffffffff;
    if (entry.method === 0) {
        crc = updateCrc32(crc, compressed);
        if ((crc ^ 0xffffffff) >>> 0 !== entry.crc32)
            throw new Error("ZIP entry CRC32 mismatch");
        return retain ? compressed.slice() : undefined;
    }
    // Native streaming decompression bounds each read. A dishonest size cannot
    // grow a full-archive buffer before the declared limit is checked.
    const source = new ReadableStream({
        start(controller) {
            controller.enqueue(compressed);
            controller.close();
        },
    });
    const stream = source.pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader();
    const output = retain ? new Uint8Array(entry.unpackedBytes) : undefined;
    let offset = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (offset + value.byteLength > entry.unpackedBytes)
                throw new Error("ZIP entry exceeds its declared unpacked size");
            crc = updateCrc32(crc, value);
            output?.set(value, offset);
            offset += value.byteLength;
        }
        if (offset !== entry.unpackedBytes)
            throw new Error("ZIP entry unpacked size does not match its directory");
        if ((crc ^ 0xffffffff) >>> 0 !== entry.crc32)
            throw new Error("ZIP entry CRC32 mismatch");
        return output;
    }
    catch (error) {
        await reader.cancel(error);
        throw error;
    }
    finally {
        reader.releaseLock();
    }
}
/** Verify every entry; retain only the editable document and embedded images. */
export async function extractFigZip(bytes, onProgress) {
    const entries = readFigZipDirectory(bytes);
    let canvas;
    const images = new Map();
    try {
        const total = entries.length;
        for (let i = 0; i < total; i++) {
            const entry = entries[i];
            const isCanvas = entry.path === "canvas.fig";
            const isImage = entry.path.startsWith("images/") && entry.unpackedBytes > 0;
            const compressed = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedBytes);
            const value = await decodeEntry(compressed, entry, isCanvas || isImage);
            if (isCanvas)
                canvas = value;
            else if (isImage && value)
                images.set(entry.path.slice("images/".length), value);
            if (typeof onProgress === "function") {
                onProgress({ current: i + 1, total, path: entry.path });
            }
        }
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : "ZIP decoding failed";
        throw new FigArchiveError("invalid", detail, { cause: error });
    }
    if (!canvas)
        throw new FigArchiveError("invalid", "canvas.fig is missing");
    return { canvas, images };
}
