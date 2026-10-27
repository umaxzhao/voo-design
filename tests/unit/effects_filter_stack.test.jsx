// Filters now have one entry point (Effects) and raster layers keep the
// ordered stack's order/opacity/visibility inside that section.
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import LayerEffectsSection from "../../src/canvas/components/editor_properties/layer_effects_section.jsx";
import EditorProperties from "../../src/canvas/components/editor_properties/index.jsx";
import { FILTER_KINDS } from "../../src/canvas/editor/adjustment_kinds.js";
import {
  LIVE_FILTER_KINDS,
  STACK_FILTER_KINDS,
  createLiveFilterEntry,
  applyLiveFilterStack,
} from "../../src/canvas/editor/live_filter_stack.js";

const noop = () => {};
const renderEffects = (object) =>
  renderToStaticMarkup(
    <LayerEffectsSection
      object={object}
      edit={noop}
      editAndCommit={noop}
      commitNow={noop}
    />,
  );

describe("single filter surface", () => {
  it("routes every filter kind through the stack catalogue", () => {
    expect(STACK_FILTER_KINDS).toHaveLength(FILTER_KINDS.length);
    for (const kind of FILTER_KINDS) {
      expect(STACK_FILTER_KINDS).toContain(kind);
    }
    // The original eight stay as the GPU-compatible/legacy subset.
    expect(LIVE_FILTER_KINDS).toHaveLength(8);
    for (const kind of LIVE_FILTER_KINDS) {
      expect(FILTER_KINDS).toContain(kind);
    }
  });

  it("applies every stack kind without throwing on a small buffer", () => {
    for (const kind of STACK_FILTER_KINDS) {
      const data = new Uint8ClampedArray(8 * 8 * 4).fill(128);
      expect(() =>
        applyLiveFilterStack(data, 8, 8, [createLiveFilterEntry(kind, { value: 20 })]),
      ).not.toThrow();
    }
  });

  it("renders saved stack entries inside Effects instead of a separate section", () => {
    const html = renderEffects({
      id: "img-1",
      kind: "image",
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      adjustments: {
        liveFilters: [createLiveFilterEntry("blur", { value: 20 })],
      },
    });
    expect(html).toContain('data-testid="effects-filter-stack"');
    expect(html).toContain('data-testid="live-filter-entry-blur"');
    // The old standalone section is gone.
    expect(html).not.toContain('data-testid="editor-live-filter-section"');
  });

  it("applies a filter only inside its selection mask", () => {
    const mask = {
      contours: [
        [
          [0, 0],
          [0.5, 0],
          [0.5, 1],
          [0, 1],
        ],
      ],
    };
    const data = new Uint8ClampedArray(4 * 4 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 120;
      data[i + 1] = 120;
      data[i + 2] = 120;
      data[i + 3] = 255;
    }
    const masked = new Uint8ClampedArray(data);
    applyLiveFilterStack(
      masked,
      4,
      4,
      [createLiveFilterEntry("sepia", { value: 100, mask })],
    );
    const unmasked = new Uint8ClampedArray(data);
    applyLiveFilterStack(
      unmasked,
      4,
      4,
      [createLiveFilterEntry("sepia", { value: 100 })],
    );
    // Left half (masked) changed; right half stayed original.
    expect(masked[0]).not.toBe(120);
    expect(masked[3 * 4]).toBe(120);
    expect(masked[3 * 4 + 1]).toBe(120);
    // The full-frame filter changes both halves.
    expect(unmasked[3 * 4]).not.toBe(120);
  });

  it("keeps a per-entry blend mode and applies it over the pre-filter pixels", () => {
    const entry = createLiveFilterEntry("sepia", { value: 80, blendMode: "multiply" });
    expect(entry.blendMode).toBe("multiply");
    const data = new Uint8ClampedArray(4 * 4 * 4).fill(200);
    const filtered = new Uint8ClampedArray(data);
    applyLiveFilterStack(filtered, 4, 4, [entry]);
    const normal = new Uint8ClampedArray(data);
    applyLiveFilterStack(normal, 4, 4, [
      createLiveFilterEntry("sepia", { value: 80 }),
    ]);
    expect(Array.from(filtered)).not.toEqual(Array.from(normal));
  });

  it("falls back to normal for an unknown blend mode", () => {
    expect(
      createLiveFilterEntry("blur", { value: 10, blendMode: "nope" }).blendMode,
    ).toBe("normal");
  });

  it("renders one stack row per filter kind with the shared labels", () => {
    const html = renderEffects({
      id: "img-all",
      kind: "image",
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      adjustments: {
        liveFilters: FILTER_KINDS.map((kind) =>
          createLiveFilterEntry(kind, { value: 20 }),
        ),
      },
    });
    expect(html).toContain("editor.effects.filterStackTitle");
    for (const kind of FILTER_KINDS) {
      expect(html).toContain(`data-testid="live-filter-entry-${kind}"`);
      expect(html).toContain(`data-testid="live-filter-move-up-${kind}"`);
      expect(html).toContain(`data-testid="live-filter-remove-${kind}"`);
    }
  });

  it("does not offer Live Filters in the panel add menu any more", () => {
    const imageNode = {
      id: "img-2",
      kind: "image",
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      adjustments: {},
    };
    const html = renderToStaticMarkup(
      <EditorProperties
        tool="select"
        object={imageNode}
        engine={{ getDocument: () => ({ nodes: [] }), subscribeRender: () => () => {} }}
      />,
    );
    expect(html).toContain('data-testid="properties-add-menu"');
    expect(html).not.toContain('data-testid="properties-add-liveFilters"');
    expect(html).not.toContain('data-testid="editor-live-filter-section"');
  });
});
