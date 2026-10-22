// fig-kiwi.test — round-trip the generic kiwi decoder against fixtures
// built by the minimal test-only ENCODER (testing/byte-writer.ts). If the
// decoder disagrees with that encoder about varints / varfloats / schema
// layout, real Figma payloads would fail identically, so the encoder
// doubles as a format contract.
import { describe, expect, it } from "vitest";
import { ByteReader, decodeBinarySchema, decodeMessage, isFigContainer, parseFigContainer, } from "../../../src/canvas/figma/fig-kiwi.js";
import { buildFigContainer, ByteWriter } from "./testing/byte-writer.js";
// Schema fixture mirroring the Figma shapes we rely on:
//   enum NodeType { FRAME=1, TEXT=2 }
//   struct GUID { uint sessionID; uint localID; }
//   struct Color { float r; float g; float b; float a; }
//   message NodeChange { GUID guid=1; NodeType type=2; string name=3;
//                        Color[] colors=4; }
//   message Message { NodeChange[] nodeChanges=1; }
function buildSchemaBytes() {
    const w = new ByteWriter();
    w.varUint(5);
    w.string("NodeType").byte(0).varUint(2);
    w.string("FRAME").varInt(0).byte(0).varUint(1);
    w.string("TEXT").varInt(0).byte(0).varUint(2);
    w.string("GUID").byte(1).varUint(2);
    w.string("sessionID").varInt(-4).byte(0).varUint(0);
    w.string("localID").varInt(-4).byte(0).varUint(0);
    w.string("Color").byte(1).varUint(4);
    w.string("r").varInt(-5).byte(0).varUint(0);
    w.string("g").varInt(-5).byte(0).varUint(0);
    w.string("b").varInt(-5).byte(0).varUint(0);
    w.string("a").varInt(-5).byte(0).varUint(0);
    w.string("NodeChange").byte(2).varUint(4);
    w.string("guid").varInt(1).byte(0).varUint(1);
    w.string("type").varInt(0).byte(0).varUint(2);
    w.string("name").varInt(-6).byte(0).varUint(3);
    w.string("colors").varInt(2).byte(1).varUint(4);
    w.string("Message").byte(2).varUint(1);
    w.string("nodeChanges").varInt(3).byte(1).varUint(1);
    return w.toUint8Array();
}
function buildMessageBytes() {
    const w = new ByteWriter();
    // Message { nodeChanges: [1 item] }
    w.varUint(1).varUint(1);
    // NodeChange fields:
    w.varUint(1); // field guid
    w.varUint(7).varUint(42); // GUID struct in order
    w.varUint(2).varUint(2); // field type = TEXT
    w.varUint(3).string("Hello"); // field name
    w.varUint(4).varUint(1); // field colors, length 1
    w.varFloat(1).varFloat(0.5).varFloat(0).varFloat(1);
    w.varUint(0); // end of NodeChange message
    w.varUint(0); // end of outer Message
    return w.toUint8Array();
}
describe("ByteReader primitives", () => {
    it("reads varuints across the multi-byte boundary", () => {
        const w = new ByteWriter().varUint(0).varUint(127).varUint(128).varUint(300000);
        const r = new ByteReader(w.toUint8Array());
        expect(r.readVarUint()).toBe(0);
        expect(r.readVarUint()).toBe(127);
        expect(r.readVarUint()).toBe(128);
        expect(r.readVarUint()).toBe(300000);
    });
    it("round-trips zigzag varints including negatives", () => {
        const w = new ByteWriter().varInt(0).varInt(-1).varInt(1).varInt(-123456);
        const r = new ByteReader(w.toUint8Array());
        expect(r.readVarInt()).toBe(0);
        expect(r.readVarInt()).toBe(-1);
        expect(r.readVarInt()).toBe(1);
        expect(r.readVarInt()).toBe(-123456);
    });
    it("round-trips varfloats (zero fast path + real values)", () => {
        const w = new ByteWriter().varFloat(0).varFloat(1).varFloat(-2.5).varFloat(0.25);
        const r = new ByteReader(w.toUint8Array());
        expect(r.readVarFloat()).toBe(0);
        expect(r.readVarFloat()).toBeCloseTo(1);
        expect(r.readVarFloat()).toBeCloseTo(-2.5);
        expect(r.readVarFloat()).toBeCloseTo(0.25);
    });
    it("reads null-terminated utf8 strings", () => {
        const w = new ByteWriter().string("fig-kiwi ✓").string("");
        const r = new ByteReader(w.toUint8Array());
        expect(r.readString()).toBe("fig-kiwi ✓");
        expect(r.readString()).toBe("");
    });
    it("throws on truncated input instead of looping", () => {
        const r = new ByteReader(new Uint8Array([0x80]));
        expect(() => r.readVarUint()).toThrow(/end of buffer/);
    });
});
describe("decodeBinarySchema + decodeMessage", () => {
    it("decodes the schema definitions with kinds and fields", () => {
        const schema = decodeBinarySchema(buildSchemaBytes());
        expect(schema.definitions.map((d) => d.name)).toEqual([
            "NodeType",
            "GUID",
            "Color",
            "NodeChange",
            "Message",
        ]);
        expect(schema.definitions[0].kind).toBe("ENUM");
        expect(schema.definitions[1].kind).toBe("STRUCT");
        expect(schema.definitions[3].kind).toBe("MESSAGE");
        expect(schema.definitions[3].fields[3]).toMatchObject({
            name: "colors",
            isArray: true,
            value: 4,
        });
    });
    it("decodes a message: structs in order, enums to names, arrays, floats", () => {
        const schema = decodeBinarySchema(buildSchemaBytes());
        const message = decodeMessage(schema, "Message", buildMessageBytes());
        const changes = message.nodeChanges;
        expect(changes).toHaveLength(1);
        expect(changes[0].guid).toEqual({ sessionID: 7, localID: 42 });
        expect(changes[0].type).toBe("TEXT");
        expect(changes[0].name).toBe("Hello");
        const colors = changes[0].colors;
        expect(colors[0].r).toBeCloseTo(1);
        expect(colors[0].g).toBeCloseTo(0.5);
        expect(colors[0].a).toBeCloseTo(1);
    });
    it("throws on unknown message field ids (schema mismatch surfaces loudly)", () => {
        const schema = decodeBinarySchema(buildSchemaBytes());
        const bogus = new ByteWriter().varUint(9).toUint8Array();
        expect(() => decodeMessage(schema, "NodeChange", bogus)).toThrow(/unknown field id 9/);
    });
});
describe("parseFigContainer", () => {
    function buildContainer() {
        return buildFigContainer(buildSchemaBytes(), buildMessageBytes());
    }
    it("detects the magic header", async () => {
        expect(isFigContainer(await buildContainer())).toBe(true);
        expect(isFigContainer(new TextEncoder().encode("not-a-fig"))).toBe(false);
    });
    it("parses version, inflates chunks, and decodes the root Message", async () => {
        const container = await parseFigContainer(await buildContainer());
        expect(container.version).toBe(15);
        const changes = container.message.nodeChanges;
        expect(changes[0].name).toBe("Hello");
        expect(changes[0].type).toBe("TEXT");
    });
    it("rejects buffers without the magic header", async () => {
        await expect(parseFigContainer(new TextEncoder().encode("garbage-bytes-here"))).rejects.toThrow(/magic/);
    });
});
