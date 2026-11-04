import { afterEach, describe, expect, it, vi } from "vitest";
import { createAiRepairWorkerClient } from "../../src/canvas/editor/ai-repair-worker-client.js";

const clients = [];
function fixture() {
  const workers = [];
  const client = createAiRepairWorkerClient({ timeoutMs: 100,
    createWorker: () => {
      const worker = { postMessage: vi.fn(), terminate: vi.fn() };
      workers.push(worker);
      return worker;
    },
  });
  clients.push(client);
  const run = options => client.run({ model: { id: "model", backend: "wasm" },
    input: new Float32Array(4), bytes: new Uint8Array(8), wasmPaths: "https://example.test/ort/" }, options);
  const complete = (worker, pixels = new Float32Array([0.2])) => worker.onmessage({
    data: { id: worker.postMessage.mock.calls.at(-1)[0].id, type: "result", pixels, backend: "wasm" },
  });
  return { client, workers, run, complete };
}
afterEach(() => { for (const client of clients.splice(0)) client.release(); vi.useRealTimers(); });

describe("AI repair inference worker ownership", () => {
  it("transfers input/weights and retains the initialized model for the next stroke", async () => {
    const f = fixture();
    const result = f.run();
    expect(f.workers[0].postMessage.mock.calls[0][1]).toHaveLength(2);
    f.complete(f.workers[0]);
    await expect(result).resolves.toEqual(new Float32Array([0.2]));
    expect(f.client.hasModel("model")).toBe(true);
    expect(f.client.backend()).toBe("wasm");
    const next = f.run();
    expect(f.workers).toHaveLength(1);
    f.complete(f.workers[0]);
    await next;
  });

  it("aborts immediately, releases model memory and ignores an old worker's late errors", async () => {
    const f = fixture();
    const controller = new AbortController();
    const result = f.run({ signal: controller.signal });
    const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    expect(f.workers[0].terminate).toHaveBeenCalledOnce();
    expect(f.client.hasModel("model")).toBe(false);
    const next = f.run();
    f.workers[0].onerror({ message: "late failure" });
    expect(f.workers[1].terminate).not.toHaveBeenCalled();
    f.complete(f.workers[1]);
    await expect(next).resolves.toBeInstanceOf(Float32Array);
  });

  it("bounds a hung inference and permits a fresh retry", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const result = f.run();
    const rejected = expect(result).rejects.toThrow("aiRepairTimeout");
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(f.workers[0].terminate).toHaveBeenCalledOnce();
    const retry = f.run();
    f.complete(f.workers[1]);
    await retry;
  });

  it("refuses overlapping requests rather than applying results to the wrong owner", async () => {
    const f = fixture();
    const first = f.run();
    await expect(f.run()).rejects.toThrow("aiRepairBusy");
    f.complete(f.workers[0]);
    await first;
  });

  it("releases an idle session without retaining a large model forever", async () => {
    vi.useFakeTimers();
    const f = fixture();
    const result = f.run();
    f.complete(f.workers[0]);
    await result;
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.workers[0].terminate).toHaveBeenCalledOnce();
    expect(f.client.hasModel("model")).toBe(false);
  });
});
