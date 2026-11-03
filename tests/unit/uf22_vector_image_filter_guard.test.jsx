if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}
if (typeof globalThis.document === "undefined") {
  globalThis.document = { body: {} };
}

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("react-dom", async () => {
  const actual = await vi.importActual("react-dom");
  return {
    ...actual,
    createPortal: (children) => children,
  };
});

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({
    t: (key) => {
      const dict = {
        "editor.layers.adjustments": "Adjustments",
        "editor.layers.filters": "Filters",
        "editor.layers.effects": "Effects",
        "editor.props.blurNoise": "Blur & noise",
        "editor.props.imageOnlyFilter": "Only supported on image layers",
        "editor.props.imageOnlyShort": "Image only",
        "editor.props.layerBlur": "Layer blur",
        "editor.props.backgroundBlur": "Background blur",
        "editor.props.noise": "Noise",
        "editor.layers.addAdjustment": "Add adjustment",
        "editor.props.effects": "Effects",
        "editor.props.addEffect": "Add effect",
      };
      return dict[key] ?? key;
    },
    locale: "en",
    toggleLocale: () => {},
  }),
}));

import AddKindPicker from "../../src/canvas/components/editor_properties/add_kind_picker.jsx";
import LayerEffectsSection from "../../src/canvas/components/editor_properties/layer_effects_section.jsx";

describe("UF22: vector image filter guard", () => {
  it("disables image adjustments and pixel filters in AddKindPicker when isImage is false", () => {
    const html = renderToStaticMarkup(
      <AddKindPicker
        isImage={false}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    // Adjustments & Filters groups should indicate image only
    expect(html).toContain("Image only");
    expect(html).toContain("Only supported on image layers");
    // Buttons for pixel blur, sharpen, brightness should have disabled attribute
    expect(html).toContain('title="Only supported on image layers"');
    expect(html).toContain("disabled");
  });

  it("enables image adjustments and pixel filters when isImage is true", () => {
    const html = renderToStaticMarkup(
      <AddKindPicker
        isImage={true}
        onPick={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).not.toContain("Only supported on image layers");
  });

  it("renders existing adjustment on vector with Image only badge and disabled edit button", () => {
    const vectorStar = {
      id: "star-1",
      kind: "path",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      adjustments: {
        blur: { enabled: true, value: 70 },
      },
    };

    const html = renderToStaticMarkup(
      <LayerEffectsSection
        object={vectorStar}
        edit={() => {}}
        editAndCommit={() => {}}
        commitNow={() => {}}
      />,
    );

    // Existing adjustment is rendered with Image only indicator and disabled cursor
    expect(html).toContain("Image only");
    expect(html).toContain("Only supported on image layers");
    expect(html).toContain("cursor-not-allowed");
    // The minus button still exists so users can clean up invalid data
    expect(html).toContain('aria-label="editor.props.removeAdjustment"');
  });

  it("retains layerBlur and effects controls on vector objects", () => {
    const vectorStar = {
      id: "star-1",
      kind: "path",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      layerBlur: 20,
    };

    const html = renderToStaticMarkup(
      <LayerEffectsSection
        object={vectorStar}
        edit={() => {}}
        editAndCommit={() => {}}
        commitNow={() => {}}
      />,
    );

    expect(html).toContain("Layer blur");
    expect(html).toContain("Background blur");
  });
});
