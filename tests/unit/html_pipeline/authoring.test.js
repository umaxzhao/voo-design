import { describe, expect, it, vi } from "vitest";
import { CanvasStreamer } from "../../../src/canvas/agent/html_pipeline/incremental.js";

function fixture(options = {}) {
  let doc = { canvasId: "canvas-a", nodes: [] };
  let serial = 0;
  const events = [];
  const editor = {
    getDocument: () => doc,
    beginBatch: vi.fn(), endBatch: vi.fn(), commit: vi.fn(),
    updateNode: vi.fn(), removeNode: vi.fn(), requestRender: vi.fn(),
  };
  const authoring = {
    begin: vi.fn(),
    before: vi.fn(async node => events.push(`move:${node.key}`)),
    after: vi.fn(async () => events.push("paint")),
    finish: vi.fn(), assertCurrent: vi.fn(),
  };
  const create = vi.fn((host, node, parentId) => {
    events.push(`create:${node.key ?? "frame"}`);
    const id = `node-${++serial}`;
    doc = { ...doc, nodes: [...doc.nodes, { ...node, id, parentId }] };
    return id;
  });
  const streamer = new CanvasStreamer({
    editor, frame: { width: 600, height: 400 }, create, authoring,
    renderer: { render: async html => html, dispose: vi.fn() },
    convert: nodes => nodes, ...options,
  });
  streamer.start();
  return { streamer, editor, authoring, events, create, replace: next => { doc = next; } };
}

describe("native streaming authoring", () => {
  it("moves before each real insertion and paints between insertions", async () => {
    const { streamer, events } = fixture();
    await streamer.snapshot([{ key: "a", type: "rect" }, { key: "b", type: "text" }]);
    expect(events).toEqual(["create:frame", "move:a", "create:a", "paint", "move:b", "create:b", "paint"]);
    streamer.finish();
  });

  it("does not replay unchanged elements in later snapshots", async () => {
    const { streamer, authoring } = fixture();
    const node = { key: "title", type: "text", text: "Hello" };
    await streamer.snapshot([node]);
    await streamer.snapshot([node, { key: "card", type: "rect" }]);
    expect(authoring.before.mock.calls.map(([item]) => item.key)).toEqual(["title", "card"]);
    streamer.finish();
  });

  it("checks cancellation after cursor travel before touching the document", async () => {
    const controller = new AbortController();
    const { streamer, authoring, create, editor } = fixture({ signal: controller.signal });
    authoring.before.mockImplementationOnce(async () => controller.abort());
    await expect(streamer.snapshot([{ key: "late", type: "rect" }])).rejects.toMatchObject({ name: "AbortError" });
    expect(create).toHaveBeenCalledTimes(1);
    streamer.finish();
    expect(authoring.finish).toHaveBeenCalledOnce();
    expect(editor.endBatch).toHaveBeenCalledOnce();
  });

  it("rejects duplicate keys before creating any snapshot nodes", async () => {
    const { streamer, create } = fixture();
    await expect(streamer.snapshot([{ key: "same", type: "rect" }, { key: "same", type: "rect" }])).rejects.toThrow("Duplicate HTML node key");
    expect(create).toHaveBeenCalledTimes(1);
    streamer.finish();
  });
  it("restores history and releases the canvas when initial frame creation fails", () => {
    const editor = { beginBatch: vi.fn(), endBatch: vi.fn(), commit: vi.fn() };
    const commit = editor.commit;
    const renderer = { dispose: vi.fn() };
    const failed = new CanvasStreamer({ editor, frame: {}, renderer, create: () => { throw new Error("creation failed"); } });
    expect(() => failed.start()).toThrow("creation failed");
    expect(editor.commit).toBe(commit);
    expect(commit).not.toHaveBeenCalled();
    const next = new CanvasStreamer({ editor, frame: {}, renderer, create: () => "next-frame" });
    next.start(); next.finish();
    expect(editor.endBatch).toHaveBeenCalledTimes(2);
  });
});
