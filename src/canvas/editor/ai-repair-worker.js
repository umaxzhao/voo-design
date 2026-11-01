import * as ort from "onnxruntime-web/webgpu";

const INPUT_SIDE = 512;
let currentSession = null;
let currentModelId = null;

/** Keep CPU compilation and inference outside the document's event loop. */
self.onmessage = async ({ data }) => {
  const { id, model, bytes, input, wasmPaths } = data;
  let tensor;
  let output;
  try {
    // A dedicated inference worker needs no nested WASM thread pool.
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.wasmPaths = wasmPaths;
    if (!currentSession || currentModelId !== model.id) {
      await currentSession?.release();
      if (!bytes?.byteLength) throw new Error("aiRepairMissingWeights");
      self.postMessage({ id, type: "progress", phase: "compiling" });
      currentSession = await ort.InferenceSession.create(bytes, {
        executionProviders: [model.backend], graphOptimizationLevel: "all",
      });
      currentModelId = model.id;
    }
    self.postMessage({ id, type: "progress", phase: "running" });
    tensor = new ort.Tensor("float32", input, [1, 4, INPUT_SIDE, INPUT_SIDE]);
    output = await currentSession.run({ [currentSession.inputNames[0]]: tensor });
    const pixels = output[currentSession.outputNames[0]]?.data;
    if (pixels?.length !== 3 * INPUT_SIDE * INPUT_SIDE || !pixels.every(Number.isFinite)) {
      throw new Error("aiRepairInvalidOutput");
    }
    // Tensor storage belongs to ORT; transfer an independent result before disposal.
    const result = Float32Array.from(pixels);
    self.postMessage({ id, type: "result", pixels: result, backend: model.backend }, [result.buffer]);
  } catch (error) {
    self.postMessage({ id, type: "error", message: error?.message || String(error) });
  } finally {
    tensor?.dispose();
    for (const value of Object.values(output ?? {})) value.dispose?.();
  }
};
