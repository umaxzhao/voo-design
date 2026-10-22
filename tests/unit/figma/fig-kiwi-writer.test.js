import { describe, expect, it } from "vitest";
import { parseFigContainer } from "../../../src/canvas/figma/fig-kiwi.js";
import { encodeBinarySchema, encodeKiwiMessage, serializeFigContainer, } from "../../../src/canvas/figma/fig-kiwi-writer.js";
const schema = {
    definitions: [
        {
            name: "Kind",
            kind: "ENUM",
            fields: [
                { name: "TEXT", type: 0, isArray: false, value: 1 },
                { name: "FRAME", type: 0, isArray: false, value: 2 },
            ],
        },
        {
            name: "Guid",
            kind: "STRUCT",
            fields: [
                { name: "sessionID", type: -4, isArray: false, value: 0 },
                { name: "localID", type: -4, isArray: false, value: 0 },
            ],
        },
        {
            name: "Node",
            kind: "MESSAGE",
            fields: [
                { name: "guid", type: 1, isArray: false, value: 1 },
                { name: "type", type: 0, isArray: false, value: 2 },
                { name: "name", type: -6, isArray: false, value: 3 },
                { name: "data", type: -2, isArray: true, value: 4 },
            ],
        },
        {
            name: "Message",
            kind: "MESSAGE",
            fields: [
                { name: "nodeChanges", type: 2, isArray: true, value: 4 },
                { name: "sequence", type: -8, isArray: false, value: 5 },
            ],
        },
    ],
};
const message = {
    nodeChanges: [
        {
            guid: { sessionID: 7, localID: 9 },
            type: "TEXT",
            name: "Heading",
            data: new Uint8Array([1, 2, 3]),
        },
    ],
    sequence: BigInt(42),
};
describe("fig kiwi writer", () => {
    it("encodes schemas and messages accepted by the production decoder", async () => {
        expect(encodeBinarySchema(schema).byteLength).toBeGreaterThan(20);
        expect(encodeKiwiMessage(schema, "Message", message).byteLength).toBeGreaterThan(8);
        const bytes = await serializeFigContainer({ version: 101, schema, message });
        const parsed = await parseFigContainer(bytes);
        expect(parsed.version).toBe(101);
        expect(parsed.schema).toEqual(schema);
        expect(parsed.message).toEqual(message);
    });
    it("fails fast when a required struct field is missing", () => {
        expect(() => encodeKiwiMessage(schema, "Message", {
            nodeChanges: [{ guid: { sessionID: 1 }, type: "FRAME" }],
        })).toThrow(/missing required Guid.localID/);
    });
});
