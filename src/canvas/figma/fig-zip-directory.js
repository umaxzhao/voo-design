/** ZIP32 admission follows PKWARE APPNOTE 6.3.10, sections 4.3.7–4.3.16. */
const END_RECORD_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const CENTRAL_HEADER_BYTES = 46;
const LOCAL_HEADER_BYTES = 30;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const ENCRYPTION_FLAGS = 0x0001 | 0x0040 | 0x2000;
export class FigArchiveError extends Error {
    code;
    constructor(kind, detail, options) {
        super(`Invalid .fig archive: ${detail}`, options);
        this.name = "FigArchiveError";
        this.code = `fig-archive-${kind}`;
    }
}
function invalid(detail, kind = "invalid") {
    throw new FigArchiveError(kind, detail);
}
function requireRange(offset, size, limit) {
    if (offset < 0 || size < 0 || offset + size > limit) {
        invalid("ZIP record exceeds the archive bounds");
    }
}
function hasDirectoryShape(view, end) {
    const count = view.getUint16(end + 10, true);
    const size = view.getUint32(end + 12, true);
    const offset = view.getUint32(end + 16, true);
    if (count === 0 ||
        size === 0xffffffff ||
        offset === 0xffffffff ||
        offset + size !== end)
        return false;
    let cursor = offset;
    for (let index = 0; index < count; index++) {
        if (cursor + CENTRAL_HEADER_BYTES > end ||
            view.getUint32(cursor, true) !== 0x02014b50)
            return false;
        cursor +=
            CENTRAL_HEADER_BYTES +
                view.getUint16(cursor + 28, true) +
                view.getUint16(cursor + 30, true) +
                view.getUint16(cursor + 32, true);
        if (cursor > end)
            return false;
    }
    if (cursor === end)
        return true;
    return (cursor + 6 <= end &&
        view.getUint32(cursor, true) === 0x05054b50 &&
        cursor + 6 + view.getUint16(cursor + 4, true) === end);
}
function findEndRecord(view) {
    // A ZIP comment is bounded. Do not scan indefinitely when EOCD is missing.
    let fallback;
    const first = Math.max(0, view.byteLength - END_RECORD_BYTES - MAX_ZIP_COMMENT_BYTES);
    for (let offset = view.byteLength - END_RECORD_BYTES; offset >= first; offset--) {
        if (view.getUint32(offset, true) === 0x06054b50 &&
            offset + END_RECORD_BYTES + view.getUint16(offset + 20, true) ===
                view.byteLength) {
            // Comments are opaque bytes and may contain a complete EOCD signature.
            // Prefer a candidate whose counted directory has a consistent shape.
            fallback ??= offset;
            if (hasDirectoryShape(view, offset))
                return offset;
        }
    }
    // Preserve precise malformed/unsupported diagnostics when no candidate is valid.
    return fallback ?? invalid("ZIP end record is missing or truncated");
}
function readPath(bytes) {
    let path;
    try {
        path = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    }
    catch {
        return invalid("ZIP entry name is not valid UTF-8");
    }
    if (!path ||
        /[\0\\]/.test(path) ||
        path.startsWith("/") ||
        path.split("/").includes("..")) {
        invalid("ZIP entry name is invalid");
    }
    return path;
}
function checkDescriptor(view, offset, entry, limit) {
    requireRange(offset, 12, limit);
    // Both signed and unsigned ZIP32 descriptors are valid. Test the unsigned
    // form first because its CRC may itself equal the optional signature.
    const matches = (start) => view.getUint32(start, true) === entry.crc32 &&
        view.getUint32(start + 4, true) === entry.compressedBytes &&
        view.getUint32(start + 8, true) === entry.unpackedBytes;
    if (matches(offset))
        return offset + 12;
    requireRange(offset, 16, limit);
    if (view.getUint32(offset, true) === 0x08074b50 && matches(offset + 4))
        return offset + 16;
    return invalid("ZIP data descriptor does not match its directory entry");
}
function readLocalEntry(bytes, view, offset, limit, flags, entry) {
    requireRange(offset, LOCAL_HEADER_BYTES, limit);
    if (view.getUint32(offset, true) !== 0x04034b50)
        invalid("ZIP local header is missing");
    if (view.getUint16(offset + 6, true) !== flags ||
        view.getUint16(offset + 8, true) !== entry.method) {
        invalid("ZIP local and directory headers disagree");
    }
    const nameBytes = view.getUint16(offset + 26, true);
    const extraBytes = view.getUint16(offset + 28, true);
    const dataOffset = offset + LOCAL_HEADER_BYTES + nameBytes + extraBytes;
    requireRange(offset, dataOffset - offset, limit);
    const localPath = readPath(bytes.subarray(offset + LOCAL_HEADER_BYTES, offset + LOCAL_HEADER_BYTES + nameBytes));
    if (localPath !== entry.path)
        invalid("ZIP local and directory names disagree");
    const localValues = [
        view.getUint32(offset + 14, true),
        view.getUint32(offset + 18, true),
        view.getUint32(offset + 22, true),
    ];
    const expected = [entry.crc32, entry.compressedBytes, entry.unpackedBytes];
    const hasDescriptor = (flags & DATA_DESCRIPTOR_FLAG) !== 0;
    if (localValues.some((value, index) => value !== expected[index] && !(hasDescriptor && value === 0))) {
        invalid("ZIP local and directory sizes or checksums disagree");
    }
    requireRange(dataOffset, entry.compressedBytes, limit);
    entry.dataOffset = dataOffset;
    let end = dataOffset + entry.compressedBytes;
    if (hasDescriptor)
        end = checkDescriptor(view, end, entry, limit);
    return { start: offset, end };
}
/** Read and admit all directory records before allocating any decoded payload. */
export function readFigZipDirectory(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = findEndRecord(view);
    const count = view.getUint16(end + 10, true);
    const size = view.getUint32(end + 12, true);
    const offset = view.getUint32(end + 16, true);
    if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
        invalid("ZIP64 archives are unsupported by this bounded import path", "unsupported");
    }
    if (view.getUint16(end + 4, true) !== 0 ||
        view.getUint16(end + 6, true) !== 0 ||
        view.getUint16(end + 8, true) !== count) {
        invalid("split ZIP archives are unsupported", "unsupported");
    }
    requireRange(offset, size, end);
    if (offset + size !== end)
        invalid("ZIP directory length does not match its end record");
    const entries = [];
    const paths = new Set();
    const ranges = [];
    let cursor = offset;
    for (let index = 0; index < count; index++) {
        requireRange(cursor, CENTRAL_HEADER_BYTES, end);
        if (view.getUint32(cursor, true) !== 0x02014b50)
            invalid("ZIP directory header is missing");
        const flags = view.getUint16(cursor + 8, true);
        const method = view.getUint16(cursor + 10, true);
        if ((flags & ENCRYPTION_FLAGS) !== 0)
            invalid("encrypted ZIP entries are unsupported", "unsupported");
        if (method !== 0 && method !== 8)
            invalid("unsupported ZIP compression method", "unsupported");
        const compressedBytes = view.getUint32(cursor + 20, true);
        const declaredBytes = view.getUint32(cursor + 24, true);
        const localOffset = view.getUint32(cursor + 42, true);
        if ([compressedBytes, declaredBytes, localOffset].includes(0xffffffff))
            invalid("ZIP64 entries are unsupported by this bounded import path", "unsupported");
        if (view.getUint16(cursor + 34, true) !== 0)
            invalid("split ZIP entries are unsupported", "unsupported");
        const nameBytes = view.getUint16(cursor + 28, true);
        const recordBytes = CENTRAL_HEADER_BYTES +
            nameBytes +
            view.getUint16(cursor + 30, true) +
            view.getUint16(cursor + 32, true);
        requireRange(cursor, recordBytes, end);
        const path = readPath(bytes.subarray(cursor + CENTRAL_HEADER_BYTES, cursor + CENTRAL_HEADER_BYTES + nameBytes));
        if (paths.has(path))
            invalid("duplicate ZIP entry name");
        paths.add(path);
        if (method === 0 && compressedBytes !== declaredBytes)
            invalid("stored ZIP entry sizes disagree");
        const entry = {
            path,
            method,
            crc32: view.getUint32(cursor + 16, true),
            compressedBytes,
            unpackedBytes: declaredBytes,
            dataOffset: 0,
        };
        ranges.push(readLocalEntry(bytes, view, localOffset, offset, flags, entry));
        entries.push(entry);
        cursor += recordBytes;
    }
    // Optional central-directory digital signature does not describe a payload.
    if (cursor < end) {
        requireRange(cursor, 6, end);
        if (view.getUint32(cursor, true) !== 0x05054b50)
            invalid("unexpected ZIP directory records");
        cursor += 6 + view.getUint16(cursor + 4, true);
    }
    if (cursor !== end)
        invalid("ZIP directory entry count or length is inconsistent");
    ranges.sort((left, right) => left.start - right.start);
    for (let index = 1; index < ranges.length; index++) {
        if (ranges[index].start < ranges[index - 1].end)
            invalid("ZIP local entries overlap");
    }
    if (!paths.has("canvas.fig"))
        invalid("canvas.fig is missing");
    return entries;
}
