import { describe, expect, it } from "vitest";
import { drawClonePreview } from "../../src/canvas/editor/chrome_clone.js";

function makeContext() {
  const calls = {
    arcs: [],
    images: 0,
    clips: 0,
    imageArgs: null,
    lines: [],
  };
  return {
    calls,
    canvas: { width: 500, height: 500 },
    save() {},
    restore() {},
    beginPath() {},
    arc(...args) { calls.arcs.push(args); },
    clip() { calls.clips += 1; },
    moveTo(x, y) { calls.lines.push(["move", x, y]); },
    lineTo(x, y) { calls.lines.push(["line", x, y]); },
    stroke() {},
    setLineDash() {},
    drawImage(...args) {
      calls.images += 1;
      calls.imageArgs = args;
    },
  };
}

const viewport = { zoom: 1, panX: 0, panY: 0 };
const sourceNode = { id: "image", x: 10, y: 20, width: 100, height: 80 };
const source = { nodeId: "image", point: { x: 30, y: 40 } };
const bitmap = {};
const bitmapOf = () => bitmap;
const doc = { nodes: [sourceNode] };

describe("clone stamp live preview", () => {
  it("samples with the same target minus source offset as the stroke", () => {
    const ctx = makeContext();
    drawClonePreview(
      ctx,
      { cursor: { x: 70, y: 90 }, sourcePoint: source.point, size: 20 },
      source,
      bitmapOf,
      doc,
      viewport,
    );

    expect(ctx.calls.imageArgs.slice(1, 3)).toEqual([50, 70]);
  });

  it("draws the brush diameter preview circle at the pointer", () => {
    const ctx = makeContext();
    drawClonePreview(
      ctx,
      { cursor: { x: 70, y: 90 }, sourcePoint: source.point, size: 20 },
      source,
      bitmapOf,
      doc,
      viewport,
    );

    expect(ctx.calls.arcs[0]).toEqual([70, 90, 10, 0, Math.PI * 2]);
    expect(ctx.calls.clips).toBe(1);
  });

  it("draws a same-size source circle while Alt is held", () => {
    const ctx = makeContext();
    drawClonePreview(
      ctx,
      {
        cursor: { x: 70, y: 90 },
        sourcePoint: source.point,
        size: 20,
        showSourceCircle: true,
      },
      source,
      bitmapOf,
      doc,
      viewport,
    );

    expect(ctx.calls.arcs).toContainEqual([30, 40, 10, 0, Math.PI * 2]);
  });

  it("moves the target cross with the pointer and keeps the source cross anchored", () => {
    const ctx = makeContext();
    const sourceAnchor = { x: 30, y: 40 };
    drawClonePreview(
      ctx,
      {
        cursor: { x: 80, y: 100 },
        sourceAnchor,
        targetAnchor: { x: 70, y: 90 },
        sourcePoint: { x: 40, y: 50 },
        size: 20,
      },
      { ...source, point: { x: 40, y: 50 } },
      bitmapOf,
      doc,
      viewport,
    );

    expect(ctx.calls.lines).toContainEqual(["move", 75, 100]);
    expect(ctx.calls.lines).toContainEqual(["move", 80, 95]);
    expect(ctx.calls.lines).toContainEqual(["move", 21, 40]);
    expect(ctx.calls.lines).toContainEqual(["move", 30, 31]);
  });

  it("draws no source circle or preview content without a source", () => {
    const ctx = makeContext();
    drawClonePreview(
      ctx,
      { cursor: { x: 70, y: 90 }, size: 20 },
      null,
      bitmapOf,
      doc,
      viewport,
    );

    expect(ctx.calls.images).toBe(0);
    expect(ctx.calls.clips).toBe(0);
    expect(ctx.calls.arcs).not.toContainEqual([30, 40, 10, 0, Math.PI * 2]);
  });
});
