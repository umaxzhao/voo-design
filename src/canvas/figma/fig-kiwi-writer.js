const FIG_MAGIC = new TextEncoder().encode("fig-kiwi");
const textEncoder = new TextEncoder();
class ByteWriter {
    bytes = [];
    writeByte(value) {
        this.bytes.push(value & 0xff);
    }
    writeBytes(value) {
        for (const byte of value)
            this.bytes.push(byte);
    }
    writeVarUint(value) {
        let remaining = value >>> 0;
        do {
            let byte = remaining & 0x7f;
            remaining >>>= 7;
            if (remaining !== 0)
                byte |= 0x80;
            this.writeByte(byte);
        } while (remaining !== 0);
    }
    writeVarInt(value) {
        this.writeVarUint(((value << 1) ^ (value >> 31)) >>> 0);
    }
    writeVarUint64(value) {
        let remaining = value;
        const mask = BigInt(0x7f);
        do {
            let byte = Number(remaining & mask);
            remaining >>= BigInt(7);
            if (remaining !== BigInt(0))
                byte |= 0x80;
            this.writeByte(byte);
        } while (remaining !== BigInt(0));
    }
    writeVarInt64(value) {
        this.writeVarUint64((value << BigInt(1)) ^ (value >> BigInt(63)));
    }
    writeVarFloat(value) {
        if (value === 0) {
            this.writeByte(0);
            return;
        }
        const float = new Float32Array([value]);
        let bits = new Int32Array(float.buffer)[0];
        bits = (bits >>> 23) | (bits << 9);
        this.writeByte(bits);
        this.writeByte(bits >> 8);
        this.writeByte(bits >> 16);
        this.writeByte(bits >> 24);
    }
    writeString(value) {
        this.writeBytes(textEncoder.encode(value));
        this.writeByte(0);
    }
    toUint8Array() {
        return new Uint8Array(this.bytes);
    }
}
function writeSingle(writer, schema, type, value) {
    if (type === -1)
        writer.writeByte(value ? 1 : 0);
    else if (type === -2)
        writer.writeByte(Number(value));
    else if (type === -3)
        writer.writeVarInt(Number(value));
    else if (type === -4)
        writer.writeVarUint(Number(value));
    else if (type === -5)
        writer.writeVarFloat(Number(value));
    else if (type === -6)
        writer.writeString(String(value));
    else if (type === -7)
        writer.writeVarInt64(BigInt(value));
    else if (type === -8)
        writer.writeVarUint64(BigInt(value));
    else {
        const definition = schema.definitions[type];
        if (!definition)
            throw new Error(`fig-kiwi: bad type reference ${type}`);
        if (definition.kind === "ENUM") {
            const enumValue = typeof value === "string"
                ? definition.fields.find((field) => field.name === value)?.value
                : Number(value);
            if (enumValue === undefined || !Number.isFinite(enumValue)) {
                throw new Error(`fig-kiwi: invalid ${definition.name} enum value`);
            }
            writer.writeVarUint(enumValue);
            return;
        }
        writeDefinition(writer, schema, definition, value);
    }
}
function writeField(writer, schema, field, value) {
    if (!field.isArray) {
        writeSingle(writer, schema, field.type, value);
        return;
    }
    if (field.type === -2 && value instanceof Uint8Array) {
        writer.writeVarUint(value.byteLength);
        writer.writeBytes(value);
        return;
    }
    if (!Array.isArray(value)) {
        throw new Error(`fig-kiwi: ${field.name} must be an array`);
    }
    writer.writeVarUint(value.length);
    value.forEach((item) => writeSingle(writer, schema, field.type, item));
}
function valueRecord(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("fig-kiwi: expected an object value");
    }
    return value;
}
function writeDefinition(writer, schema, definition, value) {
    const record = valueRecord(value);
    if (definition.kind === "STRUCT") {
        definition.fields.forEach((field) => {
            const fieldValue = record[field.name];
            if (fieldValue === undefined) {
                throw new Error(`fig-kiwi: missing required ${definition.name}.${field.name}`);
            }
            writeField(writer, schema, field, fieldValue);
        });
        return;
    }
    definition.fields.forEach((field) => {
        const fieldValue = record[field.name];
        if (fieldValue === undefined || fieldValue === null)
            return;
        writer.writeVarUint(field.value);
        writeField(writer, schema, field, fieldValue);
    });
    writer.writeVarUint(0);
}
export function encodeBinarySchema(schema) {
    const writer = new ByteWriter();
    writer.writeVarUint(schema.definitions.length);
    schema.definitions.forEach((definition) => {
        writer.writeString(definition.name);
        writer.writeByte(definition.kind === "ENUM" ? 0 : definition.kind === "STRUCT" ? 1 : 2);
        writer.writeVarUint(definition.fields.length);
        definition.fields.forEach((field) => {
            writer.writeString(field.name);
            writer.writeVarInt(field.type);
            writer.writeByte(field.isArray ? 1 : 0);
            writer.writeVarUint(field.value);
        });
    });
    return writer.toUint8Array();
}
export function encodeKiwiMessage(schema, rootType, message) {
    const definition = schema.definitions.find((item) => item.name === rootType);
    if (!definition || definition.kind !== "MESSAGE") {
        throw new Error(`fig-kiwi: schema has no message named ${rootType}`);
    }
    const writer = new ByteWriter();
    writeDefinition(writer, schema, definition, message);
    return writer.toUint8Array();
}
async function deflateRaw(bytes) {
    const source = new ReadableStream({
        start(controller) {
            controller.enqueue(bytes.slice());
            controller.close();
        },
    });
    const compressed = source.pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(compressed).arrayBuffer());
}
export async function serializeFigContainer(container) {
    const schema = await deflateRaw(encodeBinarySchema(container.schema));
    const message = await deflateRaw(encodeKiwiMessage(container.schema, "Message", container.message));
    const bytes = new Uint8Array(FIG_MAGIC.length + 4 + 4 + schema.length + 4 + message.length);
    const view = new DataView(bytes.buffer);
    bytes.set(FIG_MAGIC, 0);
    let offset = FIG_MAGIC.length;
    view.setUint32(offset, container.version, true);
    offset += 4;
    view.setUint32(offset, schema.length, true);
    offset += 4;
    bytes.set(schema, offset);
    offset += schema.length;
    view.setUint32(offset, message.length, true);
    offset += 4;
    bytes.set(message, offset);
    return bytes;
}
