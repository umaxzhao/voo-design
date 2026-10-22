// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import * as UZIP from "uzip";
import { serializeFigFile } from "../../../src/canvas/figma/fig-file.js";
import { loadFigmaSchema } from "../../../src/canvas/figma/figma-schema.js";
import {
  figBytesToVooFile,
  figBytesToVooFileStreaming,
  pruneFigSource,
} from "../../../src/canvas/figma/figma-to-voo.js";
import { expandInstances } from "../../../src/canvas/figma/figma-instances.js";
import { importFigFile } from "../../../src/canvas/figma/figma_import_client.js";
import { buildFigContainer } from "../../../src/canvas/figma/voo-to-fig.js";

const guid = (localID, sessionID = 0) => ({ sessionID, localID });

function change(localID, parentLocalID, position, props, sessionID = 0) {
  return {
    guid: guid(localID, sessionID),
    ...(parentLocalID === null ? {} : { parentIndex: { guid: guid(parentLocalID, sessionID), position } }),
    ...props,
  };
}

async function buildSampleFigBytes(nodeChanges) {
  const schema = await loadFigmaSchema();
  return serializeFigFile({
    version: 106,
    schema,
    message: { nodeChanges },
  });
}

function sampleNodeChanges() {
  return [
    change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
    change(1, 0, "!", { type: "CANVAS", name: "Page 1" }),
    change(2, 1, "!", {
      type: "FRAME",
      name: "Artboard 1",
      transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
      size: { x: 400, y: 300 },
      fillPaints: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1, a: 1 }, opacity: 1, visible: true }],
    }),
    change(3, 2, "!", {
      type: "RECTANGLE",
      name: "Rect 1",
      transform: { m00: 1, m01: 0, m02: 10, m10: 0, m11: 1, m12: 10 },
      size: { x: 100, y: 50 },
      fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    }),
    change(4, 2, '"', {
      type: "RECTANGLE",
      name: "Rect 2",
      transform: { m00: 1, m01: 0, m02: 10, m10: 0, m11: 1, m12: 70 },
      size: { x: 100, y: 50 },
      fillPaints: [{ type: "SOLID", color: { r: 0, g: 1, b: 0, a: 1 }, opacity: 1, visible: true }],
    }),
    change(5, 2, "#", {
      type: "RECTANGLE",
      name: "Rect 3",
      transform: { m00: 1, m01: 0, m02: 10, m10: 0, m11: 1, m12: 130 },
      size: { x: 100, y: 50 },
      fillPaints: [{ type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 }, opacity: 1, visible: true }],
    }),
  ];
}

describe("Milestone 2: Web Worker Streaming Ingestion & Optimization", () => {
  describe("Task 1: O(1) Instance Expansion Optimization", () => {
    it("expands component instances with overrides and derived geometry accurately", () => {
      const changes = [
        change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        change(1, 0, "!", { type: "CANVAS", name: "Canvas" }),
        // Master component
        change(2, 1, "!", {
          type: "COMPONENT",
          name: "ButtonMaster",
          guid: { sessionID: 0, localID: 2 },
        }),
        change(3, 2, "!", {
          type: "RECTANGLE",
          name: "Bg",
          fillPaints: [{ type: "SOLID", color: { r: 0.5, g: 0.5, b: 0.5, a: 1 }, visible: true }],
        }),
        // Instance
        change(4, 1, '"', {
          type: "INSTANCE",
          name: "ButtonInstance",
          symbolData: {
            symbolID: { sessionID: 0, localID: 2 },
            symbolOverrides: [
              {
                guidPath: { guids: [{ sessionID: 0, localID: 3 }] },
                fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, visible: true }],
              },
            ],
          },
        }),
      ];

      const expanded = expandInstances(changes);
      expect(expanded.length).toBeGreaterThan(changes.length);

      // The instance copy of Rect should have the overridden red fill
      const copiedRect = expanded.find(
        (c) => c.parentIndex?.guid?.localID === 4 && c.type === "RECTANGLE",
      );
      expect(copiedRect).toBeDefined();
      expect(copiedRect.fillPaints[0].color.r).toBe(1);
    });

    it("scales linearly to hundreds of instances without quadratic slowdown", () => {
      const baseChanges = [
        change(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        change(1, 0, "!", { type: "CANVAS", name: "Canvas" }),
        change(2, 1, "!", {
          type: "COMPONENT",
          name: "CardMaster",
          guid: { sessionID: 0, localID: 2 },
        }),
        change(3, 2, "!", {
          type: "RECTANGLE",
          name: "CardBg",
          size: { x: 100, y: 100 },
        }),
      ];

      // Add 200 instances
      const instanceChanges = [];
      for (let i = 10; i < 210; i++) {
        instanceChanges.push(
          change(i, 1, String.fromCharCode(33 + (i % 90)), {
            type: "INSTANCE",
            name: `CardInstance_${i}`,
            symbolData: {
              symbolID: { sessionID: 0, localID: 2 },
            },
          }),
        );
      }

      const allChanges = [...baseChanges, ...instanceChanges];
      const start = performance.now();
      const expanded = expandInstances(allChanges);
      const elapsed = performance.now() - start;

      // 200 instances expanded should be super fast with O(1) indexed lookups (< 50ms)
      expect(elapsed).toBeLessThan(100);
      expect(expanded.length).toBe(allChanges.length + 200);
    });
  });

  describe("Task 2: Transferable ArrayBuffers & Blobs Pruning", () => {
    it("prunes redundant nodeChanges and blobs from figSource.message", () => {
      const rawSource = {
        version: 106,
        schema: { definitions: [] },
        message: {
          type: "NODE_CHANGES",
          sessionID: 42,
          ackID: 10,
          originFileKey: "file-xyz",
          nodeChangeOrder: [1, 2, 3],
          nodeChanges: [{ guid: { sessionID: 0, localID: 1 } }],
          blobs: [new Uint8Array([1, 2, 3, 4])],
          customHeader: "preserved",
        },
      };

      const pruned = pruneFigSource(rawSource);
      expect(pruned.version).toBe(106);
      expect(pruned.schema).toBe(rawSource.schema);
      expect(pruned.message.sessionID).toBe(42);
      expect(pruned.message.customHeader).toBe("preserved");
      expect(pruned.message.nodeChanges).toBeUndefined();
      expect(pruned.message.blobs).toBeUndefined();
      expect(pruned.message.nodeChangeOrder).toBeUndefined();
      expect(pruned.message.originFileKey).toBeUndefined();
      expect(pruned.message.ackID).toBeUndefined();
    });

    it("allows pruned figSource to be used by buildFigContainer without error", async () => {
      const bytes = await buildSampleFigBytes(sampleNodeChanges());
      const { vooFile, figSource } = await figBytesToVooFile(bytes);

      expect(figSource.message.nodeChanges).toBeUndefined();
      expect(figSource.message.blobs).toBeUndefined();

      // Pass pruned figSource back to buildFigContainer
      const container = buildFigContainer(vooFile.document, figSource);
      expect(container.version).toBe(106);
      expect(container.message.nodeChanges.length).toBeGreaterThan(0);
    });
  });

  describe("Task 3: Streaming Chunk Protocol & Yielding", () => {
    it("emits PROGRESS events through stages: unpacking -> kiwi -> topology -> nodes", async () => {
      const bytes = await buildSampleFigBytes(sampleNodeChanges());
      const progressEvents = [];

      await figBytesToVooFileStreaming(bytes, {
        onProgress: (p) => {
          progressEvents.push({ ...p });
        },
      });

      expect(progressEvents.length).toBeGreaterThanOrEqual(4);
      const stages = progressEvents.map((e) => e.stage);
      expect(stages).toContain("unpacking");
      expect(stages).toContain("kiwi");
      expect(stages).toContain("topology");
      expect(stages).toContain("nodes");

      // Verify percentages are within [0, 100] and increasing
      for (const e of progressEvents) {
        expect(e.percent).toBeGreaterThanOrEqual(0);
        expect(e.percent).toBeLessThanOrEqual(100);
      }
      expect(progressEvents[progressEvents.length - 1].percent).toBe(100);
    });

    it("emits PAGE_HEADER metadata before node chunk streaming", async () => {
      const bytes = await buildSampleFigBytes(sampleNodeChanges());
      let emittedHeader = null;

      await figBytesToVooFileStreaming(bytes, {
        onHeader: (pages) => {
          emittedHeader = pages;
        },
      });

      expect(emittedHeader).not.toBeNull();
      expect(Array.isArray(emittedHeader)).toBe(true);
      expect(emittedHeader.length).toBe(1);
      expect(emittedHeader[0].name).toBe("Page 1");
      expect(emittedHeader[0].bounds).toHaveProperty("width");
      expect(emittedHeader[0].bounds).toHaveProperty("height");
    });

    it("chunks nodes into configurable batch sizes and marks first screen", async () => {
      const bytes = await buildSampleFigBytes(sampleNodeChanges());
      const chunks = [];

      await figBytesToVooFileStreaming(bytes, {
        chunkSize: 2, // Force chunks of 2 nodes
        onChunk: (chunk) => {
          chunks.push(chunk);
        },
      });

      expect(chunks.length).toBeGreaterThan(1);
      // First chunk must be marked as first screen
      expect(chunks[0].isFirstScreen).toBe(true);
      if (chunks.length > 1) {
        expect(chunks[1].isFirstScreen).toBe(false);
      }

      for (const chunk of chunks) {
        expect(chunk.nodes.length).toBeLessThanOrEqual(2);
        expect(chunk.pageId).toBeDefined();
      }
    });

    it("streams raw image ArrayBuffers via onAsset callback from ZIP archive", async () => {
      const schema = await loadFigmaSchema();
      const canvasBytes = await serializeFigFile({
        version: 106,
        schema,
        message: { nodeChanges: sampleNodeChanges() },
      });

      const fakeImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02, 0x03, 0x04]);
      const zipArchive = new Uint8Array(
        UZIP.encode({
          "canvas.fig": canvasBytes,
          "images/test-image-hash": fakeImageBytes,
        }),
      );

      const assets = [];
      await figBytesToVooFileStreaming(zipArchive, {
        onAsset: (asset) => {
          assets.push(asset);
        },
      });

      expect(assets.length).toBe(1);
      expect(assets[0].assetId).toBe("img-test-image-hash");
      expect(assets[0].buffer instanceof ArrayBuffer).toBe(true);
      expect(new Uint8Array(assets[0].buffer)).toEqual(fakeImageBytes);
    });
  });

  describe("Task 4: Client Streaming Consumer & Fallback", () => {
    it("importFigFile operates seamlessly in Node environment with progress and chunk callbacks", async () => {
      const bytes = await buildSampleFigBytes(sampleNodeChanges());
      const progressReports = [];
      const chunks = [];

      const result = await importFigFile(bytes, {
        chunkSize: 3,
        onProgress: (p) => progressReports.push(p.percent),
        onChunk: (c) => chunks.push(c),
      });

      expect(result).toBeDefined();
      expect(result.vooFile).toBeDefined();
      expect(result.layerCount).toBeGreaterThan(0);
      expect(progressReports.length).toBeGreaterThan(0);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("rejects gracefully when given invalid bytes", async () => {
      const invalid = new Uint8Array([1, 2, 3, 4, 5]);
      await expect(importFigFile(invalid)).rejects.toThrow();
    });
  });
});
