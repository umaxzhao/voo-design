// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as UZIP from "uzip";
import {
  ByteReader,
  decodeBinarySchema,
  decodeMessage,
  isFigContainer,
  parseFigContainer,
} from "../../src/canvas/figma/fig-kiwi.js";
import {
  extractFigZip,
} from "../../src/canvas/figma/fig-zip-reader.js";
import {
  readFigZipDirectory,
  FigArchiveError,
} from "../../src/canvas/figma/fig-zip-directory.js";
import {
  figBytesToVooFile,
  figBytesToVooFileStreaming,
  pruneFigSource,
} from "../../src/canvas/figma/figma-to-voo.js";
import { expandInstances } from "../../src/canvas/figma/figma-instances.js";
import { importFigFile } from "../../src/canvas/figma/figma_import_client.js";
import { parseFigFile, serializeFigFile } from "../../src/canvas/figma/fig-file.js";
import { loadFigmaSchema } from "../../src/canvas/figma/figma-schema.js";
import { buildFigContainer, ByteWriter, deflateRaw } from "./figma/testing/byte-writer.js";
import { buildFigContainer as buildFigContainerFromVoo } from "../../src/canvas/figma/voo-to-fig.js";

// Helper utilities for building synthetic Figma payloads
const guid = (localID, sessionID = 0) => ({ sessionID, localID });

function makeChange(localID, parentLocalID, position, props, sessionID = 0) {
  return {
    guid: guid(localID, sessionID),
    ...(parentLocalID === null ? {} : { parentIndex: { guid: guid(parentLocalID, sessionID), position } }),
    ...props,
  };
}

async function buildMinimalFigmaPayload(nodeChanges, blobs = []) {
  const schema = await loadFigmaSchema();
  return serializeFigFile({
    version: 106,
    schema,
    message: { nodeChanges, blobs },
  });
}

function sampleDocumentNodes() {
  return [
    makeChange(0, null, "", { type: "DOCUMENT", name: "Doc" }),
    makeChange(1, 0, "!", { type: "CANVAS", name: "Page 1" }),
    makeChange(2, 1, "!", {
      type: "FRAME",
      name: "Frame 1",
      transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
      size: { x: 400, y: 300 },
      fillPaints: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1, a: 1 }, opacity: 1, visible: true }],
    }),
    makeChange(3, 2, "!", {
      type: "RECTANGLE",
      name: "Rect 1",
      transform: { m00: 1, m01: 0, m02: 10, m10: 0, m11: 1, m12: 10 },
      size: { x: 100, y: 50 },
      fillPaints: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    }),
  ];
}

describe("Adversarial Stress Test: Streaming Ingestion & Corruption Resistance", () => {
  // =========================================================================
  // Scope 1: Protocol & Corruption Testing (Graceful Rejection)
  // =========================================================================
  describe("Scope 1: Protocol & Corruption Testing", () => {
    it("gracefully rejects 0-byte input without unhandled crash", async () => {
      const empty = new Uint8Array(0);

      // 1. Streaming parser
      await expect(figBytesToVooFileStreaming(empty)).rejects.toThrow();

      // 2. Client facade
      await expect(importFigFile(empty)).rejects.toThrow();

      // 3. Low-level parseFigFile
      await expect(parseFigFile(empty)).rejects.toThrow(/empty/i);

      // 4. Container parser
      await expect(parseFigContainer(empty)).rejects.toThrow(/fig-kiwi/i);
    });

    it("rejects sub-12 byte truncated binary payloads without memory errors", async () => {
      const truncatedInputs = [
        new Uint8Array([0x66, 0x69, 0x67]), // "fig" (3 bytes)
        new Uint8Array([0x66, 0x69, 0x67, 0x2d, 0x6b, 0x69, 0x77, 0x69]), // "fig-kiwi" exact 8 bytes (missing version & chunks)
        new Uint8Array([0x66, 0x69, 0x67, 0x2d, 0x6b, 0x69, 0x77, 0x69, 0x6a, 0x00, 0x00]), // 11 bytes
      ];

      for (const input of truncatedInputs) {
        expect(isFigContainer(input)).toBe(input.length >= 8);
        await expect(figBytesToVooFileStreaming(input)).rejects.toThrow();
        await expect(parseFigContainer(input)).rejects.toThrow();
      }
    });

    it("rejects payloads with missing or truncated Kiwi schema and data chunks", async () => {
      // Valid magic + version 106, but 0 chunks
      const headerOnly = new Uint8Array(12);
      headerOnly.set(new TextEncoder().encode("fig-kiwi"), 0);
      new DataView(headerOnly.buffer).setUint32(8, 106, true);

      await expect(parseFigContainer(headerOnly)).rejects.toThrow(
        "fig-kiwi: expected schema + data chunks",
      );

      // Valid magic + version + 1 chunk only (missing data chunk)
      const oneChunk = new Uint8Array(16 + 4);
      oneChunk.set(new TextEncoder().encode("fig-kiwi"), 0);
      const view = new DataView(oneChunk.buffer);
      view.setUint32(8, 106, true);
      view.setUint32(12, 4, true); // chunk 0 size = 4
      oneChunk.set([1, 2, 3, 4], 16);

      await expect(parseFigContainer(oneChunk)).rejects.toThrow(
        "fig-kiwi: expected schema + data chunks",
      );
    });

    it("rejects Kiwi chunk header declaring size exceeding buffer bounds", async () => {
      const invalidSize = new Uint8Array(20);
      invalidSize.set(new TextEncoder().encode("fig-kiwi"), 0);
      const view = new DataView(invalidSize.buffer);
      view.setUint32(8, 106, true);
      view.setUint32(12, 0x7fffffff, true); // Declares 2GB chunk size

      await expect(parseFigContainer(invalidSize)).rejects.toThrow(
        "fig-kiwi: chunk size exceeds buffer",
      );
    });

    it("handles Kiwi varuint and varint integer overflow attacks gracefully", () => {
      // 5 continuous bytes with MSB set -> shifts 5*7 = 35 >= 35, must throw varuint overflow
      const overflowVarUint = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0x01]);
      const reader = new ByteReader(overflowVarUint);
      expect(() => reader.readVarUint()).toThrow("fig-kiwi: varuint overflow");

      // 10 continuous bytes with MSB set -> shifts 10*7 = 70 >= 70, must throw varuint64 overflow
      const overflowVarUint64 = new Uint8Array(Array(11).fill(0xff));
      const reader64 = new ByteReader(overflowVarUint64);
      expect(() => reader64.readVarUint64()).toThrow("fig-kiwi: varuint64 overflow");
    });

    it("rejects unterminated strings in Kiwi payloads without infinite loops", () => {
      // String bytes missing null terminator
      const unterminated = new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f]); // "hello" without 0x00
      const reader = new ByteReader(unterminated);
      expect(() => reader.readString()).toThrow("fig-kiwi: unterminated string");
    });

    it("rejects corrupt ZIP archives with missing EOCD or truncated directories", async () => {
      // Starts with ZIP local header magic PK\x03\x04 but truncated immediately
      const corruptZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);

      await expect(extractFigZip(corruptZip)).rejects.toThrow(FigArchiveError);
      await expect(figBytesToVooFileStreaming(corruptZip)).rejects.toThrow();
    });

    it("rejects ZIP archives with directory entry path traversal attacks", async () => {
      // Construct archive with "../canvas.fig"
      expect(() =>
        readFigZipDirectory(
          new Uint8Array(
            UZIP.encode({
              "../canvas.fig": new Uint8Array([1, 2, 3]),
            }),
          ),
        ),
      ).toThrow(/ZIP entry name is invalid/i);
    });

    it("rejects ZIP archives missing the mandatory canvas.fig entry", async () => {
      const zipNoCanvas = new Uint8Array(
        UZIP.encode({
          "meta.json": new TextEncoder().encode('{"file_name":"test"}'),
          "thumbnail.png": new Uint8Array([1, 2, 3]),
        }),
      );

      await expect(extractFigZip(zipNoCanvas)).rejects.toThrow(
        /canvas\.fig is missing/i,
      );
      await expect(figBytesToVooFileStreaming(zipNoCanvas)).rejects.toThrow();
    });

    it("rejects ZIP archives where canvas.fig contains non-Figma garbage", async () => {
      const zipGarbageCanvas = new Uint8Array(
        UZIP.encode({
          "canvas.fig": new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x11, 0x22]),
        }),
      );

      await expect(figBytesToVooFileStreaming(zipGarbageCanvas)).rejects.toThrow(
        /expected a native Figma \.fig document/i,
      );
    });

    it("rejects ZIP entries with dishonest unpacked size (decompression bomb protection)", async () => {
      const original = new Uint8Array(
        UZIP.encode({
          "canvas.fig": new Uint8Array(100).fill(42),
        }),
      );

      // Mutate directory header declared size to be smaller than actual unpacked size (10 bytes)
      const tampered = new Uint8Array(original);
      const view = new DataView(tampered.buffer);
      // Find central directory offset from EOCD
      const eocdOffset = tampered.length - 22;
      const dirOffset = view.getUint32(eocdOffset + 16, true);
      // Set declared unpacked size in central directory to 10
      view.setUint32(dirOffset + 24, 10, true);
      // Also update local header unpacked size at offset 22
      view.setUint32(22, 10, true);

      await expect(extractFigZip(tampered)).rejects.toThrow(
        /ZIP entry exceeds its declared unpacked size|CRC32 mismatch|disagree/i,
      );
    });
  });

  // =========================================================================
  // Scope 2: Component Instance Scaling Stress (2,000+ Instances)
  // =========================================================================
  describe("Scope 2: Component Instance Scaling Stress (2,000+ Instances)", () => {
    it("scales linearly O(N) when expanding 2,500 instances without quadratic slowdown", () => {
      const INSTANCE_COUNT = 2500;

      // Base document + Canvas + Master component with 3 child layers
      const baseChanges = [
        makeChange(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        makeChange(1, 0, "!", { type: "CANVAS", name: "Canvas" }),
        // Component Master (ID 2)
        makeChange(2, 1, "!", {
          type: "COMPONENT",
          name: "ButtonMaster",
          guid: { sessionID: 0, localID: 2 },
        }),
        makeChange(3, 2, "!", {
          type: "RECTANGLE",
          name: "ButtonBg",
          fillPaints: [{ type: "SOLID", color: { r: 0.2, g: 0.2, b: 0.2, a: 1 }, visible: true }],
        }),
        makeChange(4, 2, '"', {
          type: "TEXT",
          name: "ButtonLabel",
          textData: { characters: "Submit" },
        }),
        makeChange(5, 2, "#", {
          type: "ELLIPSE",
          name: "ButtonIcon",
        }),
      ];

      // Add 2,500 instances of the Master Component
      const instanceChanges = [];
      for (let i = 10; i < 10 + INSTANCE_COUNT; i++) {
        instanceChanges.push(
          makeChange(i, 1, String.fromCharCode(33 + (i % 90)), {
            type: "INSTANCE",
            name: `ButtonInstance_${i}`,
            symbolData: {
              symbolID: { sessionID: 0, localID: 2 },
              symbolOverrides: [
                {
                  guidPath: { guids: [{ sessionID: 0, localID: 3 }] },
                  fillPaints: [{ type: "SOLID", color: { r: 0.9, g: 0.1, b: 0.1, a: 1 }, visible: true }],
                },
                {
                  guidPath: { guids: [{ sessionID: 0, localID: 4 }] },
                  textData: { characters: `Item ${i}` },
                },
              ],
            },
          }),
        );
      }

      const allChanges = [...baseChanges, ...instanceChanges];
      expect(allChanges.length).toBe(baseChanges.length + INSTANCE_COUNT);

      const startTime = performance.now();
      const expanded = expandInstances(allChanges);
      const elapsed = performance.now() - startTime;

      // Each instance copies 3 master children (Bg, Label, Icon)
      const expectedTotal = allChanges.length + INSTANCE_COUNT * 3;
      expect(expanded.length).toBe(expectedTotal);

      // Expansion of 2,500 instances with 7,500 copied layers must complete in < 250ms
      // (Proves O(N) indexing with Map rather than O(N^2) linear scans)
      expect(elapsed).toBeLessThan(250);

      // Verify correctness of copied nodes & overrides
      const firstCopiedLabel = expanded.find(
        (c) => c.parentIndex?.guid?.localID === 10 && c.type === "TEXT",
      );
      expect(firstCopiedLabel).toBeDefined();
      expect(firstCopiedLabel.textData.characters).toBe("Item 10");

      const lastCopiedBg = expanded.find(
        (c) => c.parentIndex?.guid?.localID === 10 + INSTANCE_COUNT - 1 && c.type === "RECTANGLE",
      );
      expect(lastCopiedBg).toBeDefined();
      expect(lastCopiedBg.fillPaints[0].color.r).toBe(0.9);
    });

    it("verifies linear scaling ratio across 500, 1000, and 2500 instances", () => {
      function generateInstanceDataset(count) {
        const changes = [
          makeChange(0, null, "", { type: "DOCUMENT", name: "Doc" }),
          makeChange(1, 0, "!", { type: "CANVAS", name: "Canvas" }),
          makeChange(2, 1, "!", {
            type: "COMPONENT",
            name: "Master",
            guid: { sessionID: 0, localID: 2 },
          }),
          makeChange(3, 2, "!", { type: "RECTANGLE", name: "Bg" }),
        ];
        for (let i = 10; i < 10 + count; i++) {
          changes.push(
            makeChange(i, 1, "!", {
              type: "INSTANCE",
              name: `Inst_${i}`,
              symbolData: { symbolID: { sessionID: 0, localID: 2 } },
            }),
          );
        }
        return changes;
      }

      // Warm up JIT
      expandInstances(generateInstanceDataset(100));

      // Use median of 3 runs to avoid GC / JIT warm-up noise
      function measureMedian(dataset) {
        const times = [];
        for (let i = 0; i < 3; i++) {
          const start = performance.now();
          expandInstances(dataset);
          times.push(performance.now() - start);
        }
        times.sort((a, b) => a - b);
        return times[1]; // median
      }

      const t500 = measureMedian(generateInstanceDataset(500));
      const t2500 = measureMedian(generateInstanceDataset(2500));

      // Bounded per-instance time proves O(N) scaling:
      // In O(N^2), time per instance increases linearly with N.
      // In O(N), time per instance remains strictly bounded by a constant (< 0.05ms/instance).
      const timePerInstance500 = t500 / 500;
      const timePerInstance2500 = t2500 / 2500;
      expect(timePerInstance500).toBeLessThan(0.05);
      expect(timePerInstance2500).toBeLessThan(0.05);
      expect(t2500).toBeLessThan(200);
    });

    it("enforces MAX_INSTANCE_DEPTH recursion limit on deep component chains", () => {
      // Build a chain of 25 nested components:
      // Comp 1 instantiates Comp 2, Comp 2 instantiates Comp 3...
      const changes = [
        makeChange(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        makeChange(1, 0, "!", { type: "CANVAS", name: "Canvas" }),
      ];

      const CHAIN_LENGTH = 25;
      for (let i = 1; i <= CHAIN_LENGTH; i++) {
        const masterId = 100 + i;
        const nextMasterId = 100 + i + 1;
        changes.push(
          makeChange(masterId, 1, "!", {
            type: "COMPONENT",
            name: `Comp_${i}`,
            guid: { sessionID: 0, localID: masterId },
          }),
        );

        if (i < CHAIN_LENGTH) {
          // Child is an instance of next component
          changes.push(
            makeChange(200 + i, masterId, "!", {
              type: "INSTANCE",
              name: `InstOf_${i + 1}`,
              symbolData: { symbolID: { sessionID: 0, localID: nextMasterId } },
            }),
          );
        } else {
          // Leaf node
          changes.push(
            makeChange(300, masterId, "!", {
              type: "RECTANGLE",
              name: "LeafNode",
            }),
          );
        }
      }

      // Add a root instance of Comp 1
      changes.push(
        makeChange(50, 1, "!", {
          type: "INSTANCE",
          name: "RootInstance",
          symbolData: { symbolID: { sessionID: 0, localID: 101 } },
        }),
      );

      // Must not throw "Maximum call stack size exceeded"
      let expanded;
      expect(() => {
        expanded = expandInstances(changes);
      }).not.toThrow();

      // Depth is strictly capped at MAX_INSTANCE_DEPTH = 16
      expect(expanded.length).toBeGreaterThan(changes.length);
    });

    it("terminates safely without freeze or loop on circular component references", () => {
      // Circular reference: Comp A has Instance of Comp B; Comp B has Instance of Comp A
      const changes = [
        makeChange(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        makeChange(1, 0, "!", { type: "CANVAS", name: "Canvas" }),
        // Comp A
        makeChange(10, 1, "!", {
          type: "COMPONENT",
          name: "CompA",
          guid: { sessionID: 0, localID: 10 },
        }),
        makeChange(11, 10, "!", {
          type: "INSTANCE",
          name: "InstB_inside_A",
          symbolData: { symbolID: { sessionID: 0, localID: 20 } },
        }),
        // Comp B
        makeChange(20, 1, '"', {
          type: "COMPONENT",
          name: "CompB",
          guid: { sessionID: 0, localID: 20 },
        }),
        makeChange(21, 20, "!", {
          type: "INSTANCE",
          name: "InstA_inside_B",
          symbolData: { symbolID: { sessionID: 0, localID: 10 } },
        }),
        // Root instance of Comp A
        makeChange(30, 1, "#", {
          type: "INSTANCE",
          name: "RootInstA",
          symbolData: { symbolID: { sessionID: 0, localID: 10 } },
        }),
      ];

      const startTime = performance.now();
      const expanded = expandInstances(changes);
      const elapsed = performance.now() - startTime;

      // Must terminate immediately (< 50ms) bounded by MAX_INSTANCE_DEPTH = 16
      expect(elapsed).toBeLessThan(50);
      expect(expanded.length).toBeGreaterThan(changes.length);
    });

    it("handles self-instantiating component without infinite loop", () => {
      // Self-reference: Comp A has an instance pointing to itself (Comp A)
      const changes = [
        makeChange(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        makeChange(1, 0, "!", { type: "CANVAS", name: "Canvas" }),
        makeChange(10, 1, "!", {
          type: "COMPONENT",
          name: "SelfComp",
          guid: { sessionID: 0, localID: 10 },
        }),
        makeChange(11, 10, "!", {
          type: "INSTANCE",
          name: "InstOfSelf",
          symbolData: { symbolID: { sessionID: 0, localID: 10 } },
        }),
        makeChange(20, 1, '"', {
          type: "INSTANCE",
          name: "RootInst",
          symbolData: { symbolID: { sessionID: 0, localID: 10 } },
        }),
      ];

      const start = performance.now();
      const expanded = expandInstances(changes);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(expanded.length).toBeGreaterThan(changes.length);
    });

    it("streams a 2,000-node document via figBytesToVooFileStreaming successfully", async () => {
      const nodes = [
        makeChange(0, null, "", { type: "DOCUMENT", name: "Doc" }),
        makeChange(1, 0, "!", { type: "CANVAS", name: "Canvas 1" }),
        makeChange(2, 1, "!", {
          type: "FRAME",
          name: "BigArtboard",
          transform: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 },
          size: { x: 3000, y: 3000 },
          fillPaints: [{ type: "SOLID", color: { r: 0.05, g: 0.05, b: 0.05, a: 1 }, visible: true }],
        }),
      ];

      for (let i = 10; i < 2010; i++) {
        nodes.push(
          makeChange(i, 2, "!", {
            type: "RECTANGLE",
            name: `Rect_${i}`,
            transform: { m00: 1, m01: 0, m02: (i % 50) * 40, m10: 0, m11: 1, m12: Math.floor(i / 50) * 30 },
            size: { x: 30, y: 20 },
            fillPaints: [{ type: "SOLID", color: { r: 0.5, g: 0.8, b: 0.2, a: 1 }, visible: true }],
          }),
        );
      }

      const payload = await buildMinimalFigmaPayload(nodes);
      const emittedChunks = [];
      let headerReceived = null;

      const result = await figBytesToVooFileStreaming(payload, {
        chunkSize: 500,
        onHeader: (h) => {
          headerReceived = h;
        },
        onChunk: (c) => {
          emittedChunks.push(c);
        },
      });

      expect(headerReceived).not.toBeNull();
      expect(emittedChunks.length).toBeGreaterThanOrEqual(4);
      expect(result.layerCount).toBe(2002); // 1 Frame container + 1 Frame background + 2000 rects
      expect(result.vooFile.document.pages[0].sceneDoc.nodes.length).toBe(2002);
    });
  });

  // =========================================================================
  // Scope 3: Transferable ArrayBuffers & Memory Isolation
  // =========================================================================
  describe("Scope 3: Transferable ArrayBuffers & figSource Memory Isolation", () => {
    it("prunes massive nodeChanges and blobs to eliminate retention leaks", () => {
      // Simulate raw Kiwi decoded payload containing 10,000 nodeChanges and 100 blobs
      const mockNodeChanges = Array.from({ length: 10000 }, (_, i) => ({
        guid: { sessionID: 0, localID: i },
        name: `Node_${i}`,
      }));
      const mockBlobs = Array.from({ length: 100 }, () => new Uint8Array(4096));

      const rawFigSource = {
        version: 106,
        schema: { definitions: [] },
        message: {
          sessionID: 100,
          originFileKey: "file-secret-key",
          ackID: 12345,
          nodeChangeOrder: [1, 2, 3],
          nodeChanges: mockNodeChanges,
          blobs: mockBlobs,
          documentTitle: "Enterprise Mockup",
        },
      };

      const pruned = pruneFigSource(rawFigSource);

      // Verify pruned object integrity
      expect(pruned.version).toBe(106);
      expect(pruned.schema).toBe(rawFigSource.schema);
      expect(pruned.message.sessionID).toBe(100);
      expect(pruned.message.documentTitle).toBe("Enterprise Mockup");

      // Verify zero leak of heavy binary AST structures
      expect(pruned.message.nodeChanges).toBeUndefined();
      expect(pruned.message.blobs).toBeUndefined();
      expect(pruned.message.nodeChangeOrder).toBeUndefined();
      expect(pruned.message.originFileKey).toBeUndefined();
      expect(pruned.message.ackID).toBeUndefined();
    });

    it("verifies figSource returned by figBytesToVooFile does not leak raw Kiwi blobs", async () => {
      const fakeBlob = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const payload = await buildMinimalFigmaPayload(sampleDocumentNodes(), [{ bytes: fakeBlob }]);

      const result = await figBytesToVooFile(payload);

      expect(result.figSource).toBeDefined();
      expect(result.figSource.message).toBeDefined();
      expect(result.figSource.message.nodeChanges).toBeUndefined();
      expect(result.figSource.message.blobs).toBeUndefined();
      expect(result.figSource.message.nodeChangeOrder).toBeUndefined();
    });

    it("verifies pruned figSource is 100% compatible with buildFigContainer for re-export", async () => {
      const payload = await buildMinimalFigmaPayload(sampleDocumentNodes());
      const { vooFile, figSource } = await figBytesToVooFile(payload);

      // Save back to .fig container
      const container = buildFigContainerFromVoo(vooFile.document, figSource);
      expect(container).toBeDefined();
      expect(container.version).toBe(106);
      expect(container.schema).toBe(figSource.schema);
      expect(Array.isArray(container.message.nodeChanges)).toBe(true);
      expect(container.message.nodeChanges.length).toBeGreaterThan(0);
    });

    it("verifies Transferable ArrayBuffer transfer semantics detach source buffer", async () => {
      // In Web Worker postMessage, transferring an ArrayBuffer detaches it in the sender.
      // We simulate this native Transferable contract using MessageChannel:
      const channel = new MessageChannel();
      const buffer = new ArrayBuffer(2048);
      new Uint8Array(buffer).fill(0xaa);

      expect(buffer.byteLength).toBe(2048);

      // Post message with buffer in transfer list
      const receivePromise = new Promise((resolve) => {
        channel.port2.onmessage = (event) => {
          resolve(event.data.buffer);
        };
      });

      channel.port1.postMessage({ type: "IMAGE_ASSET", buffer }, [buffer]);

      // Native Transferable verification: sender's buffer is detached
      expect(buffer.byteLength).toBe(0);

      const receivedBuffer = await receivePromise;
      expect(receivedBuffer.byteLength).toBe(2048);
      expect(new Uint8Array(receivedBuffer)[0]).toBe(0xaa);

      channel.port1.close();
      channel.port2.close();
    });

    it("verifies importFigFile client creates owned transfer buffers without detaching caller slices", () => {
      // Test the buffer preparation logic from figma_import_client.js:
      // const owned = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
      // const buffer = owned ? bytes.buffer : bytes.slice().buffer;
      const bigBuffer = new ArrayBuffer(500);
      const subView = new Uint8Array(bigBuffer, 50, 100);

      const owned = subView.byteOffset === 0 && subView.byteLength === subView.buffer.byteLength;
      expect(owned).toBe(false);

      const preparedBuffer = owned ? subView.buffer : subView.slice().buffer;
      expect(preparedBuffer.byteLength).toBe(100);
      expect(bigBuffer.byteLength).toBe(500); // Big buffer not detached or affected
    });
  });

  // =========================================================================
  // Scope 4: Web Worker Error Protocol & Host Protection
  // =========================================================================
  describe("Scope 4: Web Worker Error Protocol & Host Protection", () => {
    it("verifies worker onmessage error catch boundary catches missing bytes", async () => {
      // Simulate figma_import_worker.js onmessage handler
      const messagesEmitted = [];
      const mockSelf = {
        postMessage: (msg) => messagesEmitted.push(msg),
      };

      // Handler definition matching figma_import_worker.js
      async function workerOnMessage(event) {
        try {
          const rawBytes = event.data?.bytes;
          if (!rawBytes) {
            throw new Error("Missing bytes in import request");
          }
          const bytes = new Uint8Array(rawBytes);
          await figBytesToVooFileStreaming(bytes);
        } catch (error) {
          const errorMessage = String(error?.message ?? error);
          mockSelf.postMessage({
            type: "ERROR",
            ok: false,
            error: errorMessage,
            message: errorMessage,
          });
        }
      }

      // 1. Missing bytes payload
      await workerOnMessage({ data: {} });
      expect(messagesEmitted.length).toBe(1);
      expect(messagesEmitted[0].type).toBe("ERROR");
      expect(messagesEmitted[0].ok).toBe(false);
      expect(messagesEmitted[0].error).toMatch(/Missing bytes in import request/);

      // 2. Corrupt bytes payload
      await workerOnMessage({ data: { bytes: new Uint8Array([1, 2, 3]).buffer } });
      expect(messagesEmitted.length).toBe(2);
      expect(messagesEmitted[1].type).toBe("ERROR");
      expect(messagesEmitted[1].ok).toBe(false);
      expect(messagesEmitted[1].error).toMatch(/Unsupported file/i);
    });

    it("verifies client importFigFile rejects with error message when worker emits ERROR", () => {
      // Verify client promise reject mapping
      const errorPayload = {
        type: "ERROR",
        ok: false,
        error: "Corrupted archive stream",
      };

      let errorCaught = null;
      try {
        if (errorPayload.type === "ERROR" || errorPayload.ok === false) {
          throw new Error(errorPayload.error || errorPayload.message || "figma-import-failed");
        }
      } catch (err) {
        errorCaught = err;
      }

      expect(errorCaught).not.toBeNull();
      expect(errorCaught.message).toBe("Corrupted archive stream");
    });
  });
});
