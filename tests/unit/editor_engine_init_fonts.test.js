import { afterEach, describe, expect, it, vi } from "vitest";
import { createEngineInitController } from "../../src/canvas/editor/editor_engine_init.js";
import { ensureFontLoaded } from "../../src/canvas/editor/font_loader.js";

vi.mock("../../src/canvas/editor/font_loader.js", () => ({ ensureFontLoaded: vi.fn() }));
vi.mock("../../src/canvas/editor/scene_renderer.js", () => ({
  ensureImagePyramid: vi.fn(),
  measureText: () => ({ width: 80, height: 20 }),
}));

afterEach(() => vi.resetAllMocks());

function setup({ disposed = false, clean = true } = {}) {
  let doc = { nodes: [{ id: "text", kind: "text", text: "Title", fontFamily: "'Inter', sans-serif", width: 60, height: 20 }] };
  let controller;
  // Bound re-entry so the pre-fix failure is an assertion, not a hung test.
  const setDoc = vi.fn(next => {
    doc = next;
    if (setDoc.mock.calls.length < 5) controller.queueFontLoads(next);
  });
  const setAppliedSnapshot = vi.fn();
  const requestRender = vi.fn();
  const notify = vi.fn();
  controller = createEngineInitController({
    getDoc: () => doc, setDoc,
    getAppliedSnapshot: () => clean ? "snapshot" : "older snapshot",
    snapshotDoc: () => "snapshot", setAppliedSnapshot,
    incDocVersion: vi.fn(), requestRender, notify,
    isDisposed: () => disposed,
  });
  return { controller, doc, setDoc, setAppliedSnapshot, requestRender, notify };
}

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe("editor font completion", () => {
  it("remeasures once when setDoc re-enters with a cached resolved font promise", async () => {
    vi.mocked(ensureFontLoaded).mockReturnValue(Promise.resolve(true));
    const state = setup();
    state.controller.queueFontLoads(state.doc);
    state.controller.queueFontLoads(state.doc);
    await flush();
    // Later edits must not attach another handler to the same cached promise.
    state.controller.queueFontLoads(state.doc);
    await flush();
    expect(ensureFontLoaded).toHaveBeenCalledTimes(1);
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    expect(state.setDoc.mock.calls[0][0].nodes[0].width).toBe(80);
    expect(state.setAppliedSnapshot).toHaveBeenCalledTimes(1);
    expect(state.requestRender).toHaveBeenCalledTimes(1);
    expect(state.notify).toHaveBeenCalledTimes(1);
  });

  it("keeps edited documents dirty when font metrics arrive", async () => {
    vi.mocked(ensureFontLoaded).mockReturnValue(Promise.resolve(true));
    const state = setup({ clean: false });
    state.controller.queueFontLoads(state.doc);
    await flush();
    expect(state.setDoc).toHaveBeenCalledTimes(1);
    expect(state.setAppliedSnapshot).not.toHaveBeenCalled();
  });

  it.each([{ loaded: false, disposed: false }, { loaded: true, disposed: true }])(
    "does not update after loaded=$loaded, disposed=$disposed",
    async ({ loaded, disposed }) => {
      vi.mocked(ensureFontLoaded).mockReturnValue(Promise.resolve(loaded));
      const state = setup({ disposed });
      state.controller.queueFontLoads(state.doc);
      await flush();
      state.controller.queueFontLoads(state.doc);
      await flush();
      expect(ensureFontLoaded).toHaveBeenCalledTimes(1);
      expect(state.setDoc).not.toHaveBeenCalled();
    },
  );
});
