// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { importFigFile } from "../../src/canvas/figma/figma_import_client.js";
import { serializeFigFile } from "../../src/canvas/figma/fig-file.js";
import { loadFigmaSchema } from "../../src/canvas/figma/figma-schema.js";

afterEach(() => vi.unstubAllGlobals());

async function sampleBytes() {
  const node = (id, type, parent) => ({ guid: { sessionID: 0, localID: id }, type,
    name: `Node ${id}`, ...(parent === null ? {} : { parentIndex: {
      guid: { sessionID: 0, localID: parent }, position: String.fromCharCode(33 + id),
    } }), size: { x: 40, y: 40 },
    transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 } });
  return serializeFigFile({ version: 106, schema: await loadFigmaSchema(), message: {
    nodeChanges: [node(0, "DOCUMENT", null), node(1, "CANVAS", 0),
      node(2, "RECTANGLE", 1), node(3, "RECTANGLE", 1)],
  } });
}

async function runWorker(options) {
  const messages = [];
  const scope = { postMessage: data => messages.push(data) };
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await import("../../src/canvas/figma/figma_import_worker.js");
  await scope.onmessage({ data: { bytes: (await sampleBytes()).buffer, options } });
  expect(messages.find(message => message.type === "ERROR")).toBeUndefined();
  return messages;
}

describe("Figma worker chunk subscriptions", () => {
  it("omits unconsumed chunks while retaining progress and complete scene", async () => {
    const messages = await runWorker({ chunkSize: 1, emitChunks: false });
    expect(messages.filter(message => message.type === "CHUNK_NODES")).toHaveLength(0);
    expect(messages.some(message => message.type === "PROGRESS")).toBe(true);
    expect(messages.at(-1).type).toBe("COMPLETE");
    expect(messages.at(-1).result.layerCount).toBe(2);
    expect(messages.at(-1).result.vooFile.document.pages[0].sceneDoc.nodes).toHaveLength(2);
  });

  it.each([true, undefined])("retains subscribed and legacy chunk delivery (%s)", async emitChunks => {
    const messages = await runWorker({ chunkSize: 1, emitChunks });
    const chunks = messages.filter(message => message.type === "CHUNK_NODES");
    expect(chunks).toHaveLength(2);
    expect(chunks.map(chunk => chunk.isFirstScreen)).toEqual([true, false]);
    expect(chunks.flatMap(chunk => chunk.nodes)).toEqual(messages.at(-1).result.vooFile.document.nodes);
  });

  it.each([false, true])("negotiates from the actual consumer, overriding stale options (%s)", async subscribed => {
    const requests = [];
    class WorkerProbe {
      terminate() {}
      postMessage(request) {
        requests.push(request);
        queueMicrotask(() => this.onmessage({ data: { type: "COMPLETE", result: { layerCount: 2 } } }));
      }
    }
    vi.stubGlobal("Worker", WorkerProbe);
    await importFigFile(new Uint8Array([1, 2, 3]), {
      options: { emitChunks: !subscribed },
      ...(subscribed ? { onChunk: () => {} } : {}),
    });
    expect(requests[0].options.emitChunks).toBe(subscribed);
  });
});
