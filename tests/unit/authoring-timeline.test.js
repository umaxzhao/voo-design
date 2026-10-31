import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthoringTimeline, waitForPaint } from "../../src/canvas/agent/authoring-timeline.js";
import { getAgentCursor, getAgentFocusNode, clearAgentCursor, clearAgentFocusNode, setAgentCursor } from "../../src/canvas/editor/chrome-agent-feedback.js";

afterEach(() => { clearAgentCursor(); clearAgentFocusNode(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function fixture() {
  let doc = { canvasId: "a", nodes: [] };
  const editor = { getDocument: () => doc, requestRender: vi.fn() };
  return { editor, switchDocument: () => { doc = { canvasId: "b", nodes: [] }; } };
}
const node = { id: "tile", x: 100, y: 200, width: 80, height: 60 };

describe("bounded authoring timeline", () => {
  it("places at final geometry and clears only its own chrome", async () => {
    const { editor } = fixture();
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    const wait = vi.fn(async () => {});
    const timeline = createAuthoringTimeline(editor, { wait });
    timeline.begin(2); await timeline.before(node);
    expect(getAgentCursor()).toMatchObject({ x: 124, y: 220, drag: { width: 80, height: 60 } });
    expect(getAgentCursor({ canvasId: "b" })).toBeNull();
    await timeline.after(node);
    expect(getAgentFocusNode()).toMatchObject({ layerId: "tile", x: 100, y: 200 });
    timeline.finish();
    expect(getAgentCursor()).toBeNull(); expect(getAgentFocusNode()).toBeNull();
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it("bounds a large batch to eight travels plus periodic paint yields", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    const wait = vi.fn(async () => {});
    const timeline = createAuthoringTimeline(fixture().editor, { wait, now: () => 0 });
    timeline.begin(200);
    for (let index = 0; index < 200; index++) { await timeline.before(node); await timeline.after(node); }
    expect(wait.mock.calls.filter(([duration]) => duration > 0)).toHaveLength(8);
    expect(wait.mock.calls.length).toBeLessThan(35);
    timeline.finish();
  });

  it("skips travel and artificial frame delays under reduced motion", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn());
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const wait = vi.fn();
    const timeline = createAuthoringTimeline(fixture().editor, { wait });
    timeline.begin(2); await timeline.before(node); await timeline.after(node);
    expect(wait).not.toHaveBeenCalled();
    expect(getAgentCursor()?.travelMs).toBe(0);
    timeline.finish();
  });

  it("rejects changed documents and cannot clear a newer owner", async () => {
    const { editor, switchDocument } = fixture();
    const timeline = createAuthoringTimeline(editor);
    timeline.begin(1); await timeline.before(node);
    const newer = Symbol("newer");
    setAgentCursor({ x: 5, y: 5, editor, owner: newer });
    switchDocument();
    expect(() => timeline.assertCurrent()).toThrow("Authoring document changed");
    timeline.finish();
    expect(getAgentCursor()?.owner).toBe(newer);
  });

  it("cancels scheduled paint and its abort listener", async () => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 12));
    const cancel = vi.fn(); vi.stubGlobal("cancelAnimationFrame", cancel);
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = waitForPaint(80, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledWith(12);
    expect(remove).toHaveBeenCalledWith("abort", expect.any(Function));
  });
});
