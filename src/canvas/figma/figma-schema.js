import { base64ToBytes } from "../../shared/base64.js";
import { decompressFigChunk } from "./fig-compression.js";
import { decodeBinarySchema } from "./fig-kiwi.js";
import { FIGMA_SCHEMA_DEFLATE_BASE64 } from "./figma-schema-data.js";
let schemaPromise = null;
/**
 * The bundled OpenPencil schema predates the ordering metadata emitted by
 * current Figma desktop builds. Figma can decode the self-describing schema,
 * but needs this field to deterministically build a document from a complete
 * NODE_CHANGES message.
 */
function addNativeExportFields(schema) {
    const messageIndex = schema.definitions.findIndex((definition) => definition.name === "Message");
    if (messageIndex === -1) {
        throw new Error("Figma Kiwi schema has no Message definition");
    }
    const message = schema.definitions[messageIndex];
    if (message.fields.some((field) => field.name === "nodeChangeOrder")) {
        return schema;
    }
    const nodeChangeOrderIndex = schema.definitions.length;
    return {
        definitions: [
            ...schema.definitions.map((definition, index) => index === messageIndex
                ? {
                    ...definition,
                    fields: [
                        ...definition.fields,
                        {
                            name: "nodeChangeOrder",
                            type: nodeChangeOrderIndex,
                            isArray: false,
                            value: 48,
                        },
                    ],
                }
                : definition),
            {
                name: "NodeChangeOrder",
                kind: "ENUM",
                fields: [
                    { name: "GUID", type: 0, isArray: false, value: 0 },
                    { name: "PREORDER", type: 0, isArray: false, value: 1 },
                    { name: "TOPOLOGICAL", type: 0, isArray: false, value: 2 },
                ],
            },
        ],
    };
}
/**
 * Decode the full Figma Kiwi protocol once per process. Keeping the bundled
 * resource compressed avoids shipping the 68 KB binary schema as source data.
 */
export function loadFigmaSchema() {
    schemaPromise ??= decompressFigChunk(base64ToBytes(FIGMA_SCHEMA_DEFLATE_BASE64))
        .then(decodeBinarySchema)
        .then(addNativeExportFields);
    return schemaPromise;
}
