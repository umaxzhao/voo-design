// byte-writer — TEST-ONLY minimal kiwi encoder.
//
// Mirrors the kiwi wire format (github.com/evanw/kiwi) so decoder tests can
// build binary fixtures from scratch. Never import from production code —
// voo-canvas only ever DECODES Figma payloads.
export class ByteWriter {
    bytes = [];
    toUint8Array() {
        return new Uint8Array(this.bytes);
    }
    byte(value) {
        this.bytes.push(value & 0xff);
        return this;
    }
    varUint(value) {
        let v = value >>> 0;
        do {
            let byte = v & 0x7f;
            v >>>= 7;
            if (v !== 0)
                byte |= 0x80;
            this.bytes.push(byte);
        } while (v !== 0);
        return this;
    }
    varInt(value) {
        return this.varUint(((value << 1) ^ (value >> 31)) >>> 0);
    }
    varFloat(value) {
        if (value === 0)
            return this.byte(0);
        const buffer = new Float32Array(1);
        buffer[0] = value;
        let bits = new Int32Array(buffer.buffer)[0];
        // Inverse of the decoder's rotation: exponent moved into the low bits.
        bits = (bits >>> 23) | (bits << 9);
        return this.byte(bits & 0xff)
            .byte((bits >> 8) & 0xff)
            .byte((bits >> 16) & 0xff)
            .byte((bits >> 24) & 0xff);
    }
    string(value) {
        for (const b of new TextEncoder().encode(value))
            this.bytes.push(b);
        this.bytes.push(0);
        return this;
    }
}
export async function deflateRaw(bytes) {
    const source = new ReadableStream({
        start(controller) {
            controller.enqueue(bytes.slice());
            controller.close();
        },
    });
    // Same BufferSource-vs-Uint8Array cast rationale as fig-kiwi.ts inflateRaw.
    const deflated = source.pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(deflated).arrayBuffer());
}
/** Wrap schema + message bytes in a fig-kiwi container (deflate-raw chunks). */
export async function buildFigContainer(schemaBytes, messageBytes, version = 15) {
    const schema = await deflateRaw(schemaBytes);
    const data = await deflateRaw(messageBytes);
    const header = new TextEncoder().encode("fig-kiwi");
    const out = new Uint8Array(header.length + 4 + 4 + schema.length + 4 + data.length);
    const view = new DataView(out.buffer);
    out.set(header, 0);
    let offset = header.length;
    view.setUint32(offset, version, true);
    offset += 4;
    view.setUint32(offset, schema.length, true);
    offset += 4;
    out.set(schema, offset);
    offset += schema.length;
    view.setUint32(offset, data.length, true);
    offset += 4;
    out.set(data, offset);
    return out;
}
