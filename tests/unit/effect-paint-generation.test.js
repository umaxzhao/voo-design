import { afterEach, describe, expect, it, vi } from "vitest";
import { isolatedStyleNode, backdropStyleNode } from "../../src/canvas/editor/render-isolated-style.js";
import { effectSourceGeneration, isStaticEffectSource } from "../../src/canvas/editor/effect-source.js";
import { invalidateBitmapComposite, invalidateMatteComposite } from "../../src/canvas/editor/cpu_adjustments_matte.js";
import { ensureFontLoaded } from "../../src/canvas/editor/font_loader.js";
import { execFileSync } from "node:child_process";

afterEach(() => vi.unstubAllGlobals());

const shape = (patch = {}) => ({ kind: "rect", x: 10, y: 20, width: 40, height: 30,
  fill: "#ff0000", opacity: .5, blendMode: "multiply", ...patch });

describe("effect paint generations", () => {
  it("retains static silhouettes across unrelated generations without mutating their style", () => {
    const node = Object.freeze(shape());
    const paint = isolatedStyleNode(node, "1:0");
    expect(isolatedStyleNode(node, "2:1") === paint).toBe(true);
    expect(paint).toMatchObject({ opacity: 1, blendMode: "source-over" });
    expect(node).toMatchObject({ opacity: .5, blendMode: "multiply" });
    expect(isolatedStyleNode({ ...node }, "2:1") === paint).toBe(false);
  });

  it.each([
    { kind: "image", imageId: "image" }, { kind: "text", text: "Font readiness" },
    { maskId: "mask" }, { fills: [{ imageId: "paint-image", fill: "#ffffff" }] },
    { fill: "data:image/png;base64,pending" }, { strokes: [{ stroke: "https://example.invalid/paint.png" }] },
  ])("refreshes resource-dependent projection %j at an acknowledged generation boundary", patch => {
    const node = shape(patch);
    expect(isStaticEffectSource(node)).toBe(false);
    const first = isolatedStyleNode(node, "1:0");
    expect(isolatedStyleNode(node, "1:0") === first).toBe(true);
    const next = isolatedStyleNode(node, "1:1");
    expect(next === first).toBe(false);
    expect(isolatedStyleNode(node, "1:1") === next).toBe(true);
    expect(isolatedStyleNode(node, "1:0") === first).toBe(false);
  });

  it("retries resources for standalone renderers that provide no engine generation", () => {
    const node = shape({ kind: "image", imageId: "late" });
    expect(isolatedStyleNode(node) === isolatedStyleNode(node)).toBe(false);
    expect(isolatedStyleNode(node, 0) === isolatedStyleNode(node, 0)).toBe(false);
  });

  it("separates full-resolution and adjustment-comparison resource passes", () => {
    const node = shape({ kind: "image", imageId: "live" });
    const stage = isolatedStyleNode(node, "1:0", false, false);
    const full = isolatedStyleNode(node, "1:0", true, false);
    expect(full === stage).toBe(false);
    expect(isolatedStyleNode(node, "1:0", true, false) === full).toBe(true);
    expect(isolatedStyleNode(node, "1:0", true, true) === full).toBe(false);
  });

  it("conservatively refreshes unknown paint metadata", () => {
    expect(isStaticEffectSource(shape({ fills: { legacy: true } }))).toBe(false);
    expect(isStaticEffectSource(shape({ strokes: [null] }))).toBe(false);
    expect(isStaticEffectSource(shape({ kind: "boolean", sources: [] }))).toBe(false);
    const opaque = shape({ fills: [{ fill: { pattern: true } }] });
    expect(isStaticEffectSource(opaque)).toBe(false);
    expect(effectSourceGeneration(opaque)).toBe(null);
  });

  it("retains backdrop opacity/blend while refreshing its resource silhouette", () => {
    const node = shape({ kind: "image", imageId: "image", backgroundBlur: 2 });
    const first = backdropStyleNode(node, "ready:1");
    expect(first).toEqual(node);
    expect(backdropStyleNode(node, "ready:1")).toBe(first);
    expect(backdropStyleNode(node, "ready:2")).not.toBe(first);
    const isolated = isolatedStyleNode(node, "ready:2");
    expect(isolated.opacity).toBe(1);
    expect(backdropStyleNode(node, "ready:2").opacity).toBe(.5);
  });

  it("tracks bitmap/matte content and readiness without unrelated document versions", () => {
    const node = shape({ kind: "image", imageId: "image", maskId: "mask" });
    let bitmap = null;
    const mask = {};
    const generation = () => effectSourceGeneration(node, () => bitmap, () => mask);
    const pending = generation();
    bitmap = {};
    const loaded = generation();
    expect(loaded).not.toBe(pending);
    expect(generation()).toBe(loaded);
    invalidateBitmapComposite(bitmap);
    const painted = generation();
    expect(painted).not.toBe(loaded);
    invalidateMatteComposite(mask);
    expect(generation()).not.toBe(painted);
    const mattePainted = generation();
    bitmap.__warpTextureVersion = 1;
    expect(generation()).not.toBe(mattePainted);
    const beforeResize = generation();
    bitmap.width = 80;
    expect(generation()).not.toBe(beforeResize);
  });

  it("changes text keys after a font becomes available", async () => {
    vi.stubGlobal("document", { fonts: { size: 1, status: "loaded", load: async () => [{}] },
      getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } });
    const node = shape({ kind: "text", fontFamily: "'Effect Resource Fixture', sans-serif" });
    const before = effectSourceGeneration(node);
    expect(await ensureFontLoaded(node.fontFamily)).toBe(true);
    expect(effectSourceGeneration(node)).not.toBe(before);
  });

  it("does not retain decoded resources through stored generation keys", () => {
    const moduleUrl = new URL("../../src/canvas/editor/effect-source.js", import.meta.url).href;
    const paintUrl = new URL("../../src/canvas/editor/render-isolated-style.js", import.meta.url).href;
    const run = `
      import assert from 'node:assert/strict';
      import {effectSourceGeneration} from ${JSON.stringify(moduleUrl)};
      import {isolatedStyleNode} from ${JSON.stringify(paintUrl)};
      const node={kind:'image',imageId:'weak-resource'};
      let bitmap={width:64,height:64}; const weak=new WeakRef(bitmap);
      const key=effectSourceGeneration(node,()=>bitmap);
      isolatedStyleNode(node,key); bitmap=null;
      for(let i=0;i<8;i++){await new Promise(setImmediate);global.gc();}
      assert.equal(weak.deref(),undefined);
      assert.equal(typeof key,'string');
    `;
    expect(() => execFileSync(process.execPath, ["--expose-gc", "--input-type=module", "-e", run], { timeout: 10000 })).not.toThrow();
  });
});
