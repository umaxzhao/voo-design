import { describe, expect, it } from "vitest";
import { describe as _d } from "vitest";
import {
  LIVE_FILTER_KINDS,
  createLiveFilterEntry,
  normalizeLiveFilterStack,
  applyLiveFilterStack,
} from "../../src/canvas/editor/live_filter_stack.js";
import { buildToneLut } from "../../src/canvas/editor/tone_lut_build.js";
import { normalizeAdjustments } from "../../src/canvas/editor/scene_model_adjustments.js";
import { isDefaultAdjustments } from "../../src/canvas/editor/scene_model_core.js";
import { createDocument } from "../../src/canvas/editor/scene_doc_factory.js";
import { createImageNode } from "../../src/canvas/editor/scene_model_core.js";
import {
  deserialiseDocument,
  serialiseDocument,
} from "../../src/canvas/editor/scene_model_serialization.js";

describe("normalizeLiveFilterStack", () => {
  it("returns [] for missing/garbage input", () => {
    expect(normalizeLiveFilterStack()).toEqual([]);
    expect(normalizeLiveFilterStack(null)).toEqual([]);
    expect(normalizeLiveFilterStack("nope")).toEqual([]);
  });

  it("keeps only supported kinds with sane opacity/id", () => {
    const stack = normalizeLiveFilterStack([
      { kind: "highPass", enabled: true, opacity: 1, params: { value: 12 } },
      { kind: "frobnicate", enabled: true, opacity: 1, params: {} },
      { kind: "clarity", enabled: "yes", opacity: 9, params: { value: 400 } },
    ]);
    expect(stack).toHaveLength(2);
    expect(stack[0].kind).toBe("highPass");
    expect(stack[0].id).toBeTruthy();
    expect(stack[1].kind).toBe("clarity");
    expect(stack[1].enabled).toBe(true);
    expect(stack[1].opacity).toBe(1);
    // Params stay as written: the UI slider clamps, and the apply kernels
    // clamp raw radii themselves, so normalization stays lenient here.
    expect(stack[1].params.value).toBe(400);
  });

  it("used ids stay stable", () => {
    const raw = [{ id: "keep-me", kind: "motionBlur", params: { value: 50, angle: 90 } }];
    const [entry] = normalizeLiveFilterStack(raw);
    expect(entry.id).toBe("keep-me");
  });
});

describe("live filter tone integration", () => {
  it("empty liveFilters keeps tone neutral and not cpuOnly", () => {
    const tone = buildToneLut({});
    expect(tone.liveFilters).toEqual([]);
    expect(tone.cpuOnly).toBe(false);
  });

  it("enabled spatial entries can use the GPU and land on tone.liveFilters", () => {
    const entry = createLiveFilterEntry("highPass", { value: 20 });
    const tone = buildToneLut({ liveFilters: [entry] });
    expect(tone.active).toBe(true);
    expect(tone.cpuOnly).toBe(false);
    expect(tone.liveFilters).toEqual([entry]);
  });

  it("keeps unsupported or translucent entries on the CPU", () => {
    expect(buildToneLut({ liveFilters: [createLiveFilterEntry("sepia", {})] }).cpuOnly).toBe(true);
    expect(buildToneLut({ liveFilters: [{ ...createLiveFilterEntry("blur", {}), opacity: 0.5 }] }).cpuOnly).toBe(true);
  });

  it("disabled entries do not activate the tone pass", () => {
    const entry = { ...createLiveFilterEntry("clarity", {}), enabled: false };
    const tone = buildToneLut({ liveFilters: [entry] });
    expect(tone.liveFilters).toEqual([]);
    expect(tone.cpuOnly).toBe(false);
  });

  it("signature is id-independent but value-sensitive", () => {
    const base = buildToneLut({ liveFilters: [createLiveFilterEntry("highPass", {})] });
    const other = buildToneLut({ liveFilters: [createLiveFilterEntry("clarity", {})] });
    const same = buildToneLut({ liveFilters: [createLiveFilterEntry("highPass", {})] });
    expect(other.signature).not.toBe(base.signature);
    expect(same.signature).toBe(base.signature);

    const valued = buildToneLut({
      liveFilters: [createLiveFilterEntry("highPass", { value: 40 })],
    });
    expect(valued.signature).not.toBe(base.signature);
    const reordered = buildToneLut({
      liveFilters: [
        createLiveFilterEntry("clarity", {}),
        createLiveFilterEntry("highPass", {}),
      ],
    });
    const sameOrder = buildToneLut({
      liveFilters: [
        createLiveFilterEntry("clarity", {}),
        createLiveFilterEntry("highPass", {}),
      ],
    });
    expect(sameOrder.signature).toBe(reordered.signature);
    const radiusA = buildToneLut({ liveFilters: [{ kind: "highPass", enabled: true, params: { radius: 12 } }] });
    const radiusB = buildToneLut({ liveFilters: [{ kind: "highPass", enabled: true, params: { radius: 45 } }] });
    expect(radiusA.signature).not.toBe(radiusB.signature);
  });
});

describe("applyLiveFilterStack buffer ops", () => {
  it("moves pixels for highPass on a stepped image", () => {
    const w = 8;
    const h = 4;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const v = x < 4 ? 30 : 220;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    const before = data.slice();
    const entry = createLiveFilterEntry("highPass", { value: 40 });
    applyLiveFilterStack(data, w, h, [entry]);
    let changed = 0;
    for (let i = 0; i < data.length; i += 1) if (data[i] !== before[i]) changed += 1;
    expect(changed).toBeGreaterThan(0);
  });

  it("opacity 0 leaves the buffer untouched", () => {
    const data = new Uint8ClampedArray(8 * 4 * 4);
    data.fill(90);
    const before = data.slice();
    applyLiveFilterStack(data, 8, 4, [createLiveFilterEntry("clarity", { value: 60 }), { ...createLiveFilterEntry("highPass", {}), opacity: 0 }]);
    expect(Array.from(data)).toEqual(Array.from(before));
  });
});

describe("liveFilter persistence", () => {
  it("normalizeAdjustments carries non-empty stacks", () => {
    const entry = createLiveFilterEntry("motionBlur", { value: 30 });
    entry.params = { ...entry.params, angle: 45 };
    const adj = normalizeAdjustments({ liveFilters: [entry] });
    expect(adj.liveFilters).toHaveLength(1);
    expect(adj.liveFilters[0].kind).toBe("motionBlur");
    expect(adj.liveFilters[0].params.angle).toBe(45);
  });

  it("empty stack counts as default adjustments", () => {
    expect(isDefaultAdjustments(normalizeAdjustments({ liveFilters: [] }))).toBe(true);
    expect(
      isDefaultAdjustments(normalizeAdjustments({ liveFilters: [createLiveFilterEntry("clarity", {})] })),
    ).toBe(false);
  });

  it("survives document serialize → deserialize", () => {
    const doc = createDocument(800, 600, "#ffffff", { canvasId: "doc-1" });
    const node = createImageNode({
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    node.adjustments = {
      ...node.adjustments,
      liveFilters: [createLiveFilterEntry("highPass", { value: 25 })],
    };
    doc.nodes = [node];
    const round = deserialiseDocument(JSON.parse(JSON.stringify(serialiseDocument(doc))));
    const image = round.nodes.find((n) => n.id === node.id);
    expect(image.adjustments.liveFilters).toEqual(node.adjustments.liveFilters);
  });
});
