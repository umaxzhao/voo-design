import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createEditor } from "../../src/canvas/editor/editor_engine.js";
import { createRectNode } from "../../src/canvas/editor/scene_model.js";
import { updateExportPresets } from "../../src/canvas/components/editor_properties/export-presets.js";

const makeContext = () => ({
  save() {},
  restore() {},
  translate() {},
  scale() {},
  rotate() {},
  setTransform() {},
  resetTransform() {},
  clearRect() {},
  fillRect() {},
  strokeRect() {},
  rect() {},
  roundRect() {},
  drawImage() {},
  beginPath() {},
  closePath() {},
  moveTo() {},
  lineTo() {},
  arc() {},
  fill() {},
  stroke() {},
  clip() {},
  measureText: () => ({ width: 10 }),
  createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData() {},
  getImageData: () => ({ data: new Uint8ClampedArray(4) }),
});

describe("Coalesced update Undo/Redo history tracking", () => {
  let stage, canvas, engine;

  beforeEach(() => {
    vi.useFakeTimers();
    if (typeof globalThis.ResizeObserver === "undefined") {
      globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
    }
    if (typeof globalThis.requestAnimationFrame === "undefined") {
      globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
      globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
    }
    const ctx = makeContext();
    canvas = {
      width: 800,
      height: 600,
      getContext: () => ctx,
    };
    ctx.canvas = canvas;
    stage = {
      clientWidth: 800,
      clientHeight: 600,
      style: {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      append() {},
      addEventListener() {},
      removeEventListener() {},
    };
    if (typeof globalThis.window === "undefined") {
      globalThis.window = new EventTarget();
      globalThis.window.devicePixelRatio = 1;
    }
    if (typeof globalThis.document === "undefined") {
      globalThis.document = {
        createElement: () => ({ width: 800, height: 600, getContext: () => ctx }),
        addEventListener() {},
        removeEventListener() {},
      };
    }
    engine = createEditor({ canvas, stage, onChange: () => {} });
  });

  afterEach(() => {
    engine?.dispose();
    vi.useRealTimers();
  });

  it("preserves successive export field edits before an inspector snapshot refresh and round-trips one Undo/Redo", async () => {
    const presets = [
      { id: "png", type: "image/png", scale: 1, suffix: "" },
      { id: "web", type: "image/png", scale: 1, suffix: "" },
    ];
    engine.setDoc({ ...engine.getDocument(), nodes: [{
      ...createRectNode({ x: 20, y: 20, width: 100, height: 100 }),
      id: "rapid-export", exportPresets: presets,
    }] });
    engine.selectExactly(["rapid-export"]);
    updateExportPresets(engine, "rapid-export", rows => rows.map(row =>
      row.id === "png" ? { ...row, scale: 2 } : row), true);
    updateExportPresets(engine, "rapid-export", rows => rows.map(row =>
      row.id === "png" ? { ...row, suffix: "cover" } : row), true);
    updateExportPresets(engine, "rapid-export", rows => rows.map(row =>
      row.id === "web" ? { ...row, type: "image/webp", scale: 3 } : row), true);
    const expected = [
      { id: "png", type: "image/png", scale: 2, suffix: "cover" },
      { id: "web", type: "image/webp", scale: 3, suffix: "" },
    ];
    expect(engine.getNode("rapid-export").exportPresets).toEqual(expected);
    await engine.undo();
    expect(engine.getNode("rapid-export").exportPresets).toEqual(presets);
    await engine.redo();
    expect(engine.getNode("rapid-export").exportPresets).toEqual(expected);
  });

  it("immediate Undo (< 250ms) commits coalesced export scale and reverts to original, then Redo restores it", async () => {
    const rect = {
      ...createRectNode({ x: 20, y: 20, width: 100, height: 100 }),
      id: "rect-1",
      name: "Rectangle 1",
      exportPresets: [{ id: "preset-1", type: "image/png", scale: 2, suffix: "cover" }],
    };
    engine.setDoc({ ...engine.getDocument(), nodes: [rect] });
    engine.selectExactly(["rect-1"]);

    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(2);
    expect(engine.canRedo()).toBe(false);

    // Edit scale 2x -> 3x via coalesced update (same as ExportSection)
    updateExportPresets(
      engine,
      "rect-1",
      [{ id: "preset-1", type: "image/png", scale: 3, suffix: "cover" }],
      true,
    );

    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(3);
    expect(engine.canUndo()).toBe(true);
    expect(engine.canRedo()).toBe(false);

    // Immediate Undo before 250ms timer fires (e.g. 50ms)
    vi.advanceTimersByTime(50);
    await engine.undo();

    // Scale must be reverted to 2x and canRedo must be true
    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(2);
    expect(engine.canRedo()).toBe(true);

    // Reselect node (simulating clicking layer row to verify)
    engine.selectExactly(["rect-1"]);
    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(2);
    expect(engine.canRedo()).toBe(true);

    // Redo must restore scale to 3x and canRedo must be false
    await engine.redo();
    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(3);
    expect(engine.canRedo()).toBe(false);

    // Second Undo reverts back to 2x
    await engine.undo();
    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(2);
    expect(engine.canRedo()).toBe(true);
  });

  it("delayed Undo (> 250ms) commits after timer and reverts to original, then Redo restores it", async () => {
    const rect = {
      ...createRectNode({ x: 20, y: 20, width: 100, height: 100 }),
      id: "rect-1",
      name: "Rectangle 1",
      exportPresets: [{ id: "preset-1", type: "image/png", scale: 2, suffix: "" }],
    };
    engine.setDoc({ ...engine.getDocument(), nodes: [rect] });
    engine.selectExactly(["rect-1"]);

    // Change scale 2x -> 3x
    updateExportPresets(
      engine,
      "rect-1",
      [{ id: "preset-1", type: "image/png", scale: 3, suffix: "" }],
      true,
    );
    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(3);

    // Wait more than 250ms (e.g. 300ms) for timer to fire
    vi.advanceTimersByTime(300);

    // Undo should revert scale to 2x
    await engine.undo();
    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(2);
    expect(engine.canRedo()).toBe(true);

    // Redo should restore scale to 3x
    await engine.redo();
    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(3);
    expect(engine.canRedo()).toBe(false);
  });

  it("coalesces multiple rapid edits on the same node into one single history step", async () => {
    const rect = {
      ...createRectNode({ x: 20, y: 20, width: 100, height: 100 }),
      id: "rect-1",
      name: "Rectangle 1",
      exportPresets: [{ id: "preset-1", type: "image/png", scale: 1, suffix: "" }],
    };
    engine.setDoc({ ...engine.getDocument(), nodes: [rect] });

    // Rapid edits: 1x -> 2x -> 3x -> 4x within 100ms
    updateExportPresets(engine, "rect-1", [{ id: "preset-1", type: "image/png", scale: 2, suffix: "" }], true);
    vi.advanceTimersByTime(30);
    updateExportPresets(engine, "rect-1", [{ id: "preset-1", type: "image/png", scale: 3, suffix: "" }], true);
    vi.advanceTimersByTime(30);
    updateExportPresets(engine, "rect-1", [{ id: "preset-1", type: "image/png", scale: 4, suffix: "" }], true);

    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(4);

    // Undo should revert directly from 4x to 1x in one atomic step
    await engine.undo();
    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(1);
    expect(engine.canRedo()).toBe(true);

    // Redo should restore directly to 4x in one atomic step
    await engine.redo();
    expect(engine.getNode("rect-1").exportPresets[0].scale).toBe(4);
  });

  it("flushes coalesced edit on Node A when editing Node B", async () => {
    const rectA = {
      ...createRectNode({ x: 0, y: 0, width: 50, height: 50 }),
      id: "node-a",
      cornerRadius: 0,
    };
    const rectB = {
      ...createRectNode({ x: 100, y: 100, width: 50, height: 50 }),
      id: "node-b",
      cornerRadius: 0,
    };
    engine.setDoc({ ...engine.getDocument(), nodes: [rectA, rectB] });

    // Edit Node A
    engine.updateNodeCoalesced("node-a", { cornerRadius: 10 });
    // Immediately edit Node B without waiting 250ms
    engine.updateNodeCoalesced("node-b", { cornerRadius: 20 });

    expect(engine.getNode("node-a").cornerRadius).toBe(10);
    expect(engine.getNode("node-b").cornerRadius).toBe(20);

    // First undo should revert Node B (most recent edit)
    await engine.undo();
    expect(engine.getNode("node-b").cornerRadius).toBe(0);
    expect(engine.getNode("node-a").cornerRadius).toBe(10);

    // Second undo should revert Node A
    await engine.undo();
    expect(engine.getNode("node-a").cornerRadius).toBe(0);

    // Redo restores Node A
    await engine.redo();
    expect(engine.getNode("node-a").cornerRadius).toBe(10);

    // Redo restores Node B
    await engine.redo();
    expect(engine.getNode("node-b").cornerRadius).toBe(20);
  });

  it("flushes pending coalesced edit before non-coalesced updateNode", async () => {
    const rect = {
      ...createRectNode({ x: 0, y: 0, width: 50, height: 50 }),
      id: "node-1",
      strokeWidth: 1,
      fill: "#ff0000",
    };
    engine.setDoc({ ...engine.getDocument(), nodes: [rect] });

    // Coalesced stroke width edit
    engine.updateNodeCoalesced("node-1", { strokeWidth: 5 });
    // Non-coalesced fill edit immediately
    engine.updateNode("node-1", { fill: "#00ff00" });

    expect(engine.getNode("node-1").strokeWidth).toBe(5);
    expect(engine.getNode("node-1").fill).toBe("#00ff00");

    // First undo reverts non-coalesced fill
    await engine.undo();
    expect(engine.getNode("node-1").fill).toBe("#ff0000");
    expect(engine.getNode("node-1").strokeWidth).toBe(5);

    // Second undo reverts coalesced strokeWidth
    await engine.undo();
    expect(engine.getNode("node-1").strokeWidth).toBe(1);
  });

  it("handles button and keyboard shortcut invocation paths identically", async () => {
    const rect = {
      ...createRectNode({ x: 0, y: 0, width: 80, height: 80 }),
      id: "node-1",
      exportPresets: [{ id: "p1", type: "image/png", scale: 2, suffix: "" }],
    };
    engine.setDoc({ ...engine.getDocument(), nodes: [rect] });

    // Coalesced scale change 2x -> 3x
    updateExportPresets(engine, "node-1", [{ id: "p1", type: "image/png", scale: 3, suffix: "" }], true);
    expect(engine.getNode("node-1").exportPresets[0].scale).toBe(3);

    // Button pathway: calls engine.undo() directly
    await engine.undo();
    expect(engine.getNode("node-1").exportPresets[0].scale).toBe(2);
    expect(engine.canRedo()).toBe(true);

    // Button pathway: calls engine.redo() directly
    await engine.redo();
    expect(engine.getNode("node-1").exportPresets[0].scale).toBe(3);
    expect(engine.canRedo()).toBe(false);
  });

  it("reports isDirty true and canUndo true while tool commit is pending", () => {
    const rect = {
      ...createRectNode({ x: 0, y: 0, width: 80, height: 80 }),
      id: "node-1",
      cornerRadius: 0,
    };
    engine.setDoc({ ...engine.getDocument(), nodes: [rect] });
    engine.markApplied();

    expect(engine.isDirty()).toBe(false);

    engine.updateNodeCoalesced("node-1", { cornerRadius: 15 });

    // Must report dirty and undoable immediately even before 250ms timer
    expect(engine.isDirty()).toBe(true);
    expect(engine.canUndo()).toBe(true);
    expect(engine.canRedo()).toBe(false);

    // Explicit flush
    engine.flushPendingToolCommit();
    expect(engine.isDirty()).toBe(true);
  });

  it("flushes pending coalesced edit before jumpToHistory and explicit commit", async () => {
    const rect = {
      ...createRectNode({ x: 0, y: 0, width: 80, height: 80 }),
      id: "node-1",
      strokeWidth: 1,
    };
    engine.setDoc({ ...engine.getDocument(), nodes: [rect] });
    const baselineIndex = engine.getCurrentHistoryIndex();

    engine.updateNodeCoalesced("node-1", { strokeWidth: 10 });
    // Explicit commit flushes pending
    engine.commit("editor.custom.action");

    expect(engine.getNode("node-1").strokeWidth).toBe(10);

    // Jump back to baseline
    await engine.jumpToHistory(baselineIndex);
    expect(engine.getNode("node-1").strokeWidth).toBe(1);

    // Jump forward
    await engine.jumpToHistory(baselineIndex + 1);
    expect(engine.getNode("node-1").strokeWidth).toBe(10);
  });
});
