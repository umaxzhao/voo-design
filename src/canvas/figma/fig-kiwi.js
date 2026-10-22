// fig-kiwi — minimal Kiwi binary decoder for Figma .fig payloads.
//
// Figma's clipboard buffer and .fig files share one container format:
//
//   "fig-kiwi" magic (8 ascii bytes)
//   uint32 LE version
//   repeated chunks: uint32 LE byteLength + payload
//
// Chunk 0 is a deflate-raw-compressed Kiwi *binary schema*; chunk 1 is the
// deflate-raw-compressed *message data* (root type "Message"). Kiwi is
// self-describing here — the schema ships with every payload — so a generic
// runtime decoder is enough; we never hardcode Figma's node fields.
//
// Kiwi reference: github.com/evanw/kiwi (binary-schema + value encodings).
// OPENPENCIL_ALIGNMENT.md items A1/A2 track this capability.
import { decompressFigChunk } from "./fig-compression.js";
const TYPE_BOOL = -1;
const TYPE_BYTE = -2;
const TYPE_INT = -3;
const TYPE_UINT = -4;
const TYPE_FLOAT = -5;
const TYPE_STRING = -6;
const TYPE_INT64 = -7;
const TYPE_UINT64 = -8;
const DEFINITION_KINDS = ["ENUM", "STRUCT", "MESSAGE"];
const utf8Decoder = new TextDecoder();
const float32Scratch = new Float32Array(1);
const int32Scratch = new Int32Array(float32Scratch.buffer);
export class ByteReader {
    data;
    index = 0;
    constructor(data) {
        this.data = data;
    }
    get remaining() {
        return this.data.length - this.index;
    }
    readByte() {
        if (this.index >= this.data.length) {
            throw new Error("fig-kiwi: unexpected end of buffer");
        }
        return this.data[this.index++];
    }
    readBytes(length) {
        if (this.index + length > this.data.length) {
            throw new Error("fig-kiwi: unexpected end of buffer");
        }
        const slice = this.data.subarray(this.index, this.index + length);
        this.index += length;
        return slice;
    }
    readVarUint() {
        let shift = 0;
        let result = 0;
        while (true) {
            const byte = this.readByte();
            result |= (byte & 0x7f) << shift;
            shift += 7;
            if ((byte & 0x80) === 0)
                break;
            if (shift >= 35)
                throw new Error("fig-kiwi: varuint overflow");
        }
        return result >>> 0;
    }
    readVarInt() {
        const value = this.readVarUint();
        // Zigzag: 0,1,2,3… → 0,-1,1,-2…
        return (value >>> 1) ^ -(value & 1);
    }
    readVarUint64() {
        // BigInt() constructor calls (not literals) — tsconfig targets < ES2020
        // syntax while the runtime (Node 18+/evergreen browsers) has BigInt.
        const seven = BigInt(7);
        let shift = BigInt(0);
        let result = BigInt(0);
        while (true) {
            const byte = this.readByte();
            result |= BigInt(byte & 0x7f) << shift;
            shift += seven;
            if ((byte & 0x80) === 0)
                break;
            if (shift >= BigInt(70))
                throw new Error("fig-kiwi: varuint64 overflow");
        }
        return result;
    }
    readVarInt64() {
        const value = this.readVarUint64();
        return (value >> BigInt(1)) ^ -(value & BigInt(1));
    }
    /** Kiwi's compact float: single 0x00 byte for 0, else 4 bytes with the
     *  exponent rotated so common small floats stay short-prefix friendly. */
    readVarFloat() {
        const first = this.readByte();
        if (first === 0)
            return 0;
        if (this.index + 3 > this.data.length) {
            throw new Error("fig-kiwi: unexpected end of buffer in float");
        }
        const data = this.data;
        let bits = first |
            (data[this.index] << 8) |
            (data[this.index + 1] << 16) |
            (data[this.index + 2] << 24);
        this.index += 3;
        bits = (bits << 23) | (bits >>> 9);
        int32Scratch[0] = bits;
        return float32Scratch[0];
    }
    /** Null-terminated UTF-8. */
    readString() {
        const start = this.index;
        while (this.index < this.data.length && this.data[this.index] !== 0) {
            this.index++;
        }
        if (this.index >= this.data.length) {
            throw new Error("fig-kiwi: unterminated string");
        }
        const value = utf8Decoder.decode(this.data.subarray(start, this.index));
        this.index++; // consume the null terminator
        return value;
    }
}
export function decodeBinarySchema(bytes) {
    const reader = new ByteReader(bytes);
    const definitionCount = reader.readVarUint();
    const definitions = [];
    for (let i = 0; i < definitionCount; i++) {
        const name = reader.readString();
        const kindByte = reader.readByte();
        const kind = DEFINITION_KINDS[kindByte];
        if (!kind) {
            throw new Error(`fig-kiwi: unknown definition kind ${kindByte}`);
        }
        const fieldCount = reader.readVarUint();
        const fields = [];
        for (let j = 0; j < fieldCount; j++) {
            fields.push({
                name: reader.readString(),
                type: reader.readVarInt(),
                isArray: (reader.readByte() & 1) === 1,
                value: reader.readVarUint(),
            });
        }
        definitions.push({ name, kind, fields });
    }
    return { definitions };
}
function decodeValue(schema, reader, field) {
    if (field.isArray) {
        // byte[] is special-cased as a length-prefixed raw block.
        if (field.type === TYPE_BYTE) {
            const length = reader.readVarUint();
            // Copy: the backing buffer outlives the reader in caller hands.
            return new Uint8Array(reader.readBytes(length));
        }
        const length = reader.readVarUint();
        const items = [];
        for (let i = 0; i < length; i++) {
            items.push(decodeSingle(schema, reader, field.type));
        }
        return items;
    }
    return decodeSingle(schema, reader, field.type);
}
function decodeSingle(schema, reader, type) {
    switch (type) {
        case TYPE_BOOL:
            return reader.readByte() !== 0;
        case TYPE_BYTE:
            return reader.readByte();
        case TYPE_INT:
            return reader.readVarInt();
        case TYPE_UINT:
            return reader.readVarUint();
        case TYPE_FLOAT:
            return reader.readVarFloat();
        case TYPE_STRING:
            return reader.readString();
        case TYPE_INT64:
            return reader.readVarInt64();
        case TYPE_UINT64:
            return reader.readVarUint64();
        default: {
            const definition = schema.definitions[type];
            if (!definition) {
                throw new Error(`fig-kiwi: bad type reference ${type}`);
            }
            return decodeDefinition(schema, reader, definition);
        }
    }
}
function decodeDefinition(schema, reader, definition) {
    if (definition.kind === "ENUM") {
        const value = reader.readVarUint();
        const match = definition.fields.find((f) => f.value === value);
        // Unknown enum values pass through numerically — newer Figma exports
        // may carry variants this schema copy predates.
        return match ? match.name : value;
    }
    if (definition.kind === "STRUCT") {
        const result = {};
        for (const field of definition.fields) {
            result[field.name] = decodeValue(schema, reader, field);
        }
        return result;
    }
    // MESSAGE: field-id-tagged, 0 terminates.
    const result = {};
    while (true) {
        const id = reader.readVarUint();
        if (id === 0)
            return result;
        const field = definition.fields.find((f) => f.value === id);
        if (!field) {
            throw new Error(`fig-kiwi: unknown field id ${id} in message ${definition.name}`);
        }
        result[field.name] = decodeValue(schema, reader, field);
    }
}
export function decodeMessage(schema, rootType, bytes) {
    const definition = schema.definitions.find((d) => d.name === rootType);
    if (!definition) {
        throw new Error(`fig-kiwi: schema has no definition named ${rootType}`);
    }
    const value = decodeDefinition(schema, new ByteReader(bytes), definition);
    return value;
}
// ---------------------------------------------------------------------------
// fig container
// ---------------------------------------------------------------------------
const FIG_MAGIC = "fig-kiwi";
export function isFigContainer(bytes) {
    if (bytes.length < FIG_MAGIC.length)
        return false;
    for (let i = 0; i < FIG_MAGIC.length; i++) {
        if (bytes[i] !== FIG_MAGIC.charCodeAt(i))
            return false;
    }
    return true;
}
export async function parseFigContainer(bytes) {
    if (!isFigContainer(bytes)) {
        throw new Error("fig-kiwi: missing fig-kiwi magic header");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = FIG_MAGIC.length;
    const version = view.getUint32(offset, true);
    offset += 4;
    const chunks = [];
    while (offset + 4 <= bytes.length && chunks.length < 2) {
        const size = view.getUint32(offset, true);
        offset += 4;
        if (offset + size > bytes.length) {
            throw new Error("fig-kiwi: chunk size exceeds buffer");
        }
        chunks.push(bytes.subarray(offset, offset + size));
        offset += size;
    }
    if (chunks.length < 2) {
        throw new Error("fig-kiwi: expected schema + data chunks");
    }
    const schema = decodeBinarySchema(await decompressFigChunk(chunks[0]));
    const message = decodeMessage(schema, "Message", await decompressFigChunk(chunks[1]));
    return { version, schema, message };
}
