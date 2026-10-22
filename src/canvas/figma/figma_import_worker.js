/**
 * Web Worker for progressive streaming `.fig` imports.
 *
 * Decompression (ZIP / fzstd), Kiwi binary decoding, topology indexing,
 * and node mapping are fully offloaded to this worker to prevent main thread
 * freezing and GC pauses. Emits PROGRESS, PAGE_HEADER, IMAGE_ASSET, CHUNK_NODES,
 * and COMPLETE events, yielding to the event loop every 500-1000 nodes.
 */

import { figBytesToVooFileStreaming } from "./figma-to-voo.js";

self.onmessage = async (event) => {
  try {
    const rawBytes = event.data?.bytes;
    if (!rawBytes) {
      throw new Error("Missing bytes in import request");
    }
    const bytes = new Uint8Array(rawBytes);
    const options = event.data?.options || {};
    const chunkSize = options.chunkSize || 800;

    const result = await figBytesToVooFileStreaming(bytes, {
      chunkSize,
      onProgress: ({ stage, percent, message }) => {
        self.postMessage({
          type: "PROGRESS",
          stage,
          percent,
          message,
        });
      },
      onHeader: (pages) => {
        self.postMessage({
          type: "PAGE_HEADER",
          pages,
        });
      },
      onAsset: ({ assetId, buffer }) => {
        // Transfer raw ArrayBuffer directly across postMessage with zero-copy
        self.postMessage(
          {
            type: "IMAGE_ASSET",
            assetId,
            buffer,
          },
          [buffer],
        );
      },
      onChunk: ({ pageId, nodes, isFirstScreen }) => {
        self.postMessage({
          type: "CHUNK_NODES",
          pageId,
          nodes,
          isFirstScreen,
        });
      },
    });

    self.postMessage({
      type: "COMPLETE",
      ok: true,
      result,
      vooFile: result.vooFile,
      layerCount: result.layerCount,
      warnings: result.warnings,
      fonts: result.fonts,
      figSource: result.figSource,
    });
  } catch (error) {
    const errorMessage = String(error?.message ?? error);
    self.postMessage({
      type: "ERROR",
      ok: false,
      error: errorMessage,
      message: errorMessage,
    });
  }
};
