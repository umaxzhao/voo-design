import { figBytesToVooFileStreaming } from "./figma-to-voo.js";

/**
 * Imports `.fig` bytes in a worker with streaming progress and chunks.
 * Resolves to { vooFile, layerCount, warnings, fonts, figSource }.
 * Without Worker support (e.g. Node / Vitest), seamlessly runs on the calling thread.
 *
 * @param {Uint8Array} bytes Raw .fig file bytes
 * @param {object|Function} [callbacks] Streaming handlers: { onProgress, onHeader, onAsset, onChunk, options, chunkSize }
 * @returns {Promise<{ vooFile: any, layerCount: number, warnings: any[], fonts: any[], figSource: any }>}
 */
export function importFigFile(bytes, callbacks = {}) {
  const cb = typeof callbacks === "function" ? { onProgress: callbacks } : (callbacks || {});
  const { onProgress, onHeader, onAsset, onChunk, options, chunkSize } = cb;

  if (typeof Worker === "undefined") {
    return figBytesToVooFileStreaming(bytes, {
      onProgress,
      onHeader,
      onAsset,
      onChunk,
      chunkSize: chunkSize ?? options?.chunkSize,
    });
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./figma_import_worker.js", import.meta.url), {
      type: "module",
    });

    worker.onmessage = async (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "PROGRESS") {
        onProgress?.(data);
      } else if (data.type === "PAGE_HEADER") {
        onHeader?.(data.pages);
      } else if (data.type === "IMAGE_ASSET") {
        try {
          await onAsset?.({ assetId: data.assetId, buffer: data.buffer });
          worker.postMessage({ type: "IMAGE_ASSET_ACK", assetId: data.assetId });
        } catch (error) {
          worker.terminate();
          reject(error);
        }
      } else if (data.type === "CHUNK_NODES") {
        onChunk?.({
          pageId: data.pageId,
          nodes: data.nodes,
          isFirstScreen: data.isFirstScreen,
        });
      } else if (data.type === "COMPLETE" || data.ok) {
        worker.terminate();
        resolve(
          data.result ?? {
            vooFile: data.vooFile,
            layerCount: data.layerCount,
            warnings: data.warnings,
            fonts: data.fonts,
            figSource: data.figSource,
          },
        );
      } else if (data.type === "ERROR" || data.ok === false) {
        worker.terminate();
        reject(new Error(data.error || data.message || "figma-import-failed"));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "figma-import-worker-failed"));
    };

    const owned = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
    const buffer = owned ? bytes.buffer : bytes.slice().buffer;
    const workerOptions = { chunkSize: chunkSize ?? options?.chunkSize, ...(options || {}) };

    worker.postMessage({ bytes: buffer, options: workerOptions }, [buffer]);
  });
}
