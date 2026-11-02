import { afterEach, describe, expect, it, vi } from "vitest";
import { createVooBackgroundClient } from "../../src/canvas/store/voo-background-client.js";
import { decodeVooBinary, encodeVooBinary } from "../../src/canvas/store/voo_binary.js";
import { projectCover } from "../../src/canvas/previews/project_cover.js";

const clients = [];
const envelope = () => ({ format: "voo-design", version: 2, kind: "design",
  document: { version: 1, width: 300, height: 200, nodes: [{ id: "shape", kind: "rect",
    x: 10, y: 20, width: 40, height: 50, fill: "#ff8800", visible: true, opacity: 1 }] },
  assets: { picture: "data:image/png;base64,iVBORw0KGgo=" },
});

function fixture(options = {}) {
  const workers = [];
  const client = createVooBackgroundClient({ timeoutMs: 100,
    createWorker: () => {
      const worker = { postMessage: vi.fn(), terminate: vi.fn() };
      workers.push(worker);
      return worker;
    }, ...options,
  });
  clients.push(client);
  const complete = (worker, result = encodeVooBinary(envelope())) => worker.onmessage({
    data: { id: worker.postMessage.mock.calls.at(-1)[0].id, type: "result", result },
  });
  return { client, workers, complete };
}

afterEach(() => {
  for (const client of clients.splice(0)) client.release();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe("background VOO job ownership", () => {
  it("reuses one worker for cover and encoding without transferring editor-owned buffers", async () => {
    const f = fixture(), file = envelope();
    file.assets.raw = new Uint8Array([1, 2, 3]);
    const cover = f.client.run("cover", file);
    expect(f.workers[0].postMessage).toHaveBeenCalledWith({ id: 1, operation: "cover", file });
    f.complete(f.workers[0], "data:image/svg+xml;charset=utf-8,%3Csvg%2F%3E");
    await expect(cover).resolves.toContain("data:image/svg+xml");
    expect(f.workers[0].onmessage).toBeNull();
    const encoded = f.client.run("encode", file);
    expect(f.workers).toHaveLength(1);
    f.complete(f.workers[0]);
    await expect(encoded).resolves.toBeInstanceOf(Uint8Array);
    expect(file.assets.raw).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects overlapping and unsupported work without disturbing the active request", async () => {
    const f = fixture(), file = envelope();
    const first = f.client.run("encode", file);
    await expect(f.client.run("cover", file)).rejects.toThrow("voo-background-busy");
    await expect(f.client.run("other", file)).rejects.toThrow("voo-background-invalid-operation");
    f.complete(f.workers[0]); await first;
    await expect(f.client.run("encode", null)).rejects.toThrow("voo-background-invalid-file");
  });

  it("aborts, terminates its worker and ignores stale results or errors after retry", async () => {
    const f = fixture(), controller = new AbortController();
    const first = f.client.run("encode", envelope(), { signal: controller.signal });
    const oldMessage = f.workers[0].onmessage, oldError = f.workers[0].onerror;
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    controller.abort(); await rejected;
    expect(f.workers[0].terminate).toHaveBeenCalledOnce();
    expect(f.workers[0].onmessage).toBeNull();
    const next = f.client.run("encode", envelope());
    oldMessage({ data: { id: 1, type: "result", result: encodeVooBinary(envelope()) } });
    oldError({ message: "late failure" });
    expect(f.workers[1].terminate).not.toHaveBeenCalled();
    f.complete(f.workers[1]); await next;
  });

  it("does not create a worker for an already aborted request", async () => {
    const f = fixture(), controller = new AbortController(); controller.abort();
    await expect(f.client.run("encode", envelope(), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(f.workers).toHaveLength(0);
  });

  it("releases a hung worker at the deadline and supports a fresh retry", async () => {
    vi.useFakeTimers();
    const f = fixture(), result = f.client.run("encode", envelope());
    const rejected = expect(result).rejects.toThrow("voo-background-timeout");
    await vi.advanceTimersByTimeAsync(100); await rejected;
    expect(f.workers[0].terminate).toHaveBeenCalledOnce();
    const retry = f.client.run("encode", envelope());
    f.complete(f.workers[1]); await retry;
  });

  it("drops completed job closures and releases the idle worker after thirty seconds", async () => {
    vi.useFakeTimers();
    const f = fixture(), result = f.client.run("encode", envelope());
    f.complete(f.workers[0]); await result;
    expect(f.workers[0].onmessage).toBeNull();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(f.workers[0].terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.workers[0].terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["worker", "message", "result", "operation"])("rejects a %s failure without a synchronous fallback", async mode => {
    const f = fixture(), result = f.client.run("encode", envelope());
    const rejected = expect(result).rejects.toThrow(mode === "worker" ? "worker failure" :
      mode === "message" ? "voo-background-invalid-message" : mode === "result" ? "voo-background-invalid-result" : "codec failure");
    if (mode === "worker") f.workers[0].onerror({ message: "worker failure" });
    else if (mode === "message") f.workers[0].onmessageerror();
    else if (mode === "result") f.complete(f.workers[0], new Uint8Array([1, 2, 3]));
    else f.workers[0].onmessage({ data: { id: 1, type: "error", message: "codec failure" } });
    await rejected;
    expect(f.workers[0].terminate).toHaveBeenCalledOnce();
  });

  it("rejects startup and postMessage failures and clears pending work", async () => {
    const createWorker = vi.fn(() => { throw new Error("startup failed"); });
    const f = fixture({ createWorker });
    await expect(f.client.run("encode", envelope())).rejects.toThrow("startup failed");
    await expect(f.client.run("encode", envelope())).rejects.toThrow("startup failed");
    expect(createWorker).toHaveBeenCalledTimes(2);
    const g = fixture({ createWorker: () => ({ terminate: vi.fn(), postMessage() { throw new DOMException("not cloneable", "DataCloneError"); } }) });
    await expect(g.client.run("encode", envelope())).rejects.toMatchObject({ name: "DataCloneError" });
  });

  it("ignores an old request ID on the reused worker", async () => {
    const f = fixture(), first = f.client.run("encode", envelope());
    f.complete(f.workers[0]); await first;
    const next = f.client.run("cover", envelope());
    f.workers[0].onmessage({ data: { id: 1, type: "error", message: "stale" } });
    expect(f.workers[0].terminate).not.toHaveBeenCalled();
    f.complete(f.workers[0], null); await expect(next).resolves.toBeNull();
  });
});

describe("canonical worker operations without DOM access", () => {
  async function workerPort() {
    vi.resetModules();
    const port = { postMessage: vi.fn() }; vi.stubGlobal("self", port);
    await import("../../src/canvas/store/voo-background-worker.js");
    return port;
  }

  it("encodes exact canonical bytes and transfers only newly allocated output", async () => {
    const port = await workerPort(), file = envelope(), expected = encodeVooBinary(file);
    file.document.title = "Unicode 中文";
    const canonical = encodeVooBinary(file);
    let received;
    port.postMessage.mockImplementation((message, transfer) => { received = structuredClone(message, { transfer }); });
    port.onmessage({ data: { id: 7, operation: "encode", file } });
    expect(port.postMessage.mock.calls[0][1]).toHaveLength(1);
    expect(received).toMatchObject({ id: 7, type: "result" });
    expect(received.result).toEqual(canonical);
    expect(decodeVooBinary(received.result)).toEqual(file);
    expect(expected.byteLength).toBeGreaterThan(0);
    expect(file.assets.picture).toContain("data:image/png");
  });

  it("builds exactly the existing cover source and reports unsupported jobs", async () => {
    const port = await workerPort(), file = envelope();
    file.preview = "data:image/png;base64,aWdub3JlZA==";
    port.onmessage({ data: { id: 8, operation: "cover", file } });
    expect(port.postMessage).toHaveBeenCalledWith({ id: 8, type: "result", result: projectCover(file, { preferEmbedded: false }) });
    port.onmessage({ data: { id: 9, operation: "unknown", file } });
    expect(port.postMessage).toHaveBeenLastCalledWith({ id: 9, type: "error", message: "voo-background-invalid-operation" });
  });

  it("returns codec errors explicitly instead of emitting incomplete bytes", async () => {
    const port = await workerPort(), file = envelope(); file.assets.picture = "blob:missing";
    port.onmessage({ data: { id: 10, operation: "encode", file } });
    expect(port.postMessage).toHaveBeenCalledWith({ id: 10, type: "error", message: "voo-asset-not-base64-data-url:picture" });
  });
});
