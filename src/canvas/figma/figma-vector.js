import { figmaArray, figmaNumber, figmaObject, } from "./figma-value.js";
function compact(value) {
    return Math.abs(value) < 0.005
        ? "0"
        : Number.parseFloat(value.toFixed(2)).toString();
}
function partial(parts) {
    return parts.length > 1 ? parts.join(" ") : null;
}
export function decodeFigmaPathBlob(blob) {
    if (blob.length < 9)
        return null;
    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    const parts = [];
    let offset = 0;
    while (offset < blob.length) {
        const command = blob[offset++];
        const read = (count) => {
            if (offset + count * 4 > blob.length)
                return null;
            const values = Array.from({ length: count }, () => {
                const value = view.getFloat32(offset, true);
                offset += 4;
                return value;
            });
            return values;
        };
        if (command === 0) {
            parts.push("Z");
        }
        else if (command === 1 || command === 2) {
            const values = read(2);
            if (!values)
                return partial(parts);
            parts.push(`${command === 1 ? "M" : "L"}${values.map(compact).join(" ")}`);
        }
        else if (command === 3) {
            const values = read(4);
            if (!values)
                return partial(parts);
            parts.push(`Q${values.map(compact).join(" ")}`);
        }
        else if (command === 4) {
            const values = read(6);
            if (!values)
                return partial(parts);
            parts.push(`C${values.map(compact).join(" ")}`);
        }
        else {
            return partial(parts);
        }
    }
    return partial(parts);
}
const HEADER_BYTES = 16;
const VERTEX_BYTES = 12;
const SEGMENT_BYTES_WITH_STYLE_ID = 28;
const SEGMENT_BYTES = 24;
export function decodeFigmaVector(node, blobs) {
    const geometries = [
        ...figmaArray(node.fillGeometry),
        ...figmaArray(node.strokeGeometry),
    ];
    const paths = [];
    for (const geometryValue of geometries) {
        const geometry = figmaObject(geometryValue);
        if (!geometry)
            continue;
        const index = figmaNumber(geometry.commandsBlob, -1);
        const blobValue = index >= 0 ? blobs[index] : undefined;
        const blob = blobValue instanceof Uint8Array
            ? blobValue
            : figmaObject(blobValue)?.bytes;
        if (!(blob instanceof Uint8Array))
            continue;
        const path = decodeFigmaPathBlob(blob);
        if (path)
            paths.push(path);
    }
    // Flattened geometry is already in the node's own pixel space. It used to be
    // scaled by size / normalizedSize, which is the transform the *vector
    // network* needs — applying it here shrank every vector whose network was
    // authored in a larger space to a fraction of its bounds. It went unnoticed
    // because the two sizes agree for most vectors, making the scale 1.
    return paths.length > 0 ? paths.join(" ") : null;
}
/**
 * Fallback for vectors Figma exported without flattened geometry: rebuild the
 * path from the editable vector network.
 *
 * Blob layout, confirmed against the 169 vectors in a real .fig that carry
 * both representations:
 *   header    4 × u32   vertex count, segment count, region count, reserved
 *   vertices  12 bytes  x: f32, y: f32, styleID: u32
 *   segments  28 bytes  start: u32, start tangent x/y: f32,
 *                       end: u32, end tangent x/y: f32, styleID: u32
 *
 * Tangents are relative to their vertex, and a segment with four zero tangents
 * is a straight line. Unlike the flattened geometry, network coordinates live
 * in `normalizedSize` space and have to be scaled into the node's bounds.
 *
 * A sub-path whose last segment lands back on its first vertex is closed and
 * must emit `Z`: the canvas only fills a path it knows is closed, and paints
 * an open one with its stroke alone — so a filled, strokeless icon rebuilt
 * without the marker rendered as nothing at all.
 */
export function decodeFigmaVectorNetwork(node, blobs) {
    const vectorData = figmaObject(node.vectorData);
    if (!vectorData)
        return null;
    const index = figmaNumber(vectorData.vectorNetworkBlob, -1);
    const blobValue = index >= 0 ? blobs[index] : undefined;
    const blob = blobValue instanceof Uint8Array
        ? blobValue
        : figmaObject(blobValue)?.bytes;
    if (!(blob instanceof Uint8Array) || blob.length < HEADER_BYTES)
        return null;
    const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
    const vertexCount = view.getUint32(0, true);
    const segmentCount = view.getUint32(4, true);
    const segmentsAt = HEADER_BYTES + vertexCount * VERTEX_BYTES;
    if (vertexCount === 0 || segmentCount === 0)
        return null;
    const segmentStride = resolveSegmentStride(view, segmentsAt, blob.length, segmentCount, vertexCount);
    if (!segmentStride)
        return null;
    const [scaleX, scaleY] = networkScale(node, vectorData);
    const xs = [];
    const ys = [];
    for (let i = 0; i < vertexCount; i++) {
        const at = HEADER_BYTES + i * VERTEX_BYTES;
        xs.push(view.getFloat32(at, true) * scaleX);
        ys.push(view.getFloat32(at + 4, true) * scaleY);
    }
    const parts = [];
    let previousEnd = -1;
    let subPathStart = -1;
    const closeSubPathIfLooped = () => {
        if (subPathStart >= 0 && previousEnd === subPathStart)
            parts.push("Z");
    };
    for (let i = 0; i < segmentCount; i++) {
        const at = segmentsAt + i * segmentStride;
        const start = view.getUint32(at, true);
        const end = view.getUint32(at + 12, true);
        if (start >= vertexCount || end >= vertexCount)
            return null;
        const startTangentX = view.getFloat32(at + 4, true) * scaleX;
        const startTangentY = view.getFloat32(at + 8, true) * scaleY;
        const endTangentX = view.getFloat32(at + 16, true) * scaleX;
        const endTangentY = view.getFloat32(at + 20, true) * scaleY;
        // A segment that does not continue the previous one starts a sub-path.
        if (start !== previousEnd) {
            closeSubPathIfLooped();
            parts.push(`M${compact(xs[start])} ${compact(ys[start])}`);
            subPathStart = start;
        }
        if (startTangentX === 0 &&
            startTangentY === 0 &&
            endTangentX === 0 &&
            endTangentY === 0) {
            parts.push(`L${compact(xs[end])} ${compact(ys[end])}`);
        }
        else {
            parts.push(`C${compact(xs[start] + startTangentX)} ${compact(ys[start] + startTangentY)} ` +
                `${compact(xs[end] + endTangentX)} ${compact(ys[end] + endTangentY)} ` +
                `${compact(xs[end])} ${compact(ys[end])}`);
        }
        previousEnd = end;
    }
    closeSubPathIfLooped();
    return parts.length > 1 ? parts.join(" ") : null;
}
/**
 * Figma has shipped both segment records with a trailing style id (28 bytes)
 * and the current compact record without it (24 bytes). Geometry decoding
 * only needs the first 24 bytes; tolerate trailing network metadata.
 */
function resolveSegmentStride(view, segmentsAt, blobLength, segmentCount, vertexCount) {
    const candidates = [SEGMENT_BYTES_WITH_STYLE_ID, SEGMENT_BYTES]
        .map((stride) => ({
        stride,
        score: segmentLayoutScore(view, segmentsAt, blobLength, segmentCount, vertexCount, stride),
    }))
        .filter((candidate) => candidate.score !== null);
    if (candidates.length === 0)
        return null;
    return candidates.reduce((best, candidate) => candidate.score > best.score ? candidate : best).stride;
}
/**
 * Newer Figma payloads may omit the final segment's unused style id. Checking
 * only the total byte count would therefore mistake that layout for compact
 * 24-byte records. Validate the segment indices before choosing a stride.
 */
function segmentLayoutScore(view, segmentsAt, blobLength, segmentCount, vertexCount, stride) {
    let score = 0;
    let previousEnd = -1;
    for (let index = 0; index < segmentCount; index++) {
        const at = segmentsAt + index * stride;
        if (at + SEGMENT_BYTES > blobLength)
            return null;
        const start = view.getUint32(at, true);
        const end = view.getUint32(at + 12, true);
        if (start >= vertexCount || end >= vertexCount)
            return null;
        if (start === previousEnd)
            score += segmentCount + 1;
        if (start !== end)
            score += 1;
        previousEnd = end;
    }
    return score;
}
function networkScale(node, vectorData) {
    const normalized = figmaObject(vectorData.normalizedSize);
    const size = figmaObject(node.size);
    if (!normalized || !size)
        return [1, 1];
    const width = figmaNumber(normalized.x, 0);
    const height = figmaNumber(normalized.y, 0);
    if (width === 0 || height === 0)
        return [1, 1];
    return [figmaNumber(size.x, width) / width, figmaNumber(size.y, height) / height];
}
