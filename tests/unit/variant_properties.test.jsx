// Adding variant axes to a component keeps existing variants/instances intact.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import {
  componentVariants,
  extendVariantProperties,
  parseVariantName,
} from "../../src/canvas/editor/component_variants.js";
import VariantsSection from "../../src/canvas/components/editor_properties/variants_section.jsx";

const makeComponent = () => ({
  canvasId: "main",
  name: "Button",
  nodes: [{ id: "bg", kind: "rect", x: 0, y: 0, width: 100, height: 32 }],
});

describe("extendVariantProperties", () => {
  it("starts a variant set and creates the first matrix", () => {
    const host = makeComponent();
    const result = extendVariantProperties(host, host, { Size: ["S", "M"] });
    const variants = componentVariants(result.document, {
      ...result.document,
      canvasId: "main",
      variantGroupId: result.document.variantGroupId,
    });
    expect(variants.length).toBe(2);
    expect(variants.map((doc) => doc.variantName).sort()).toEqual(["Size=M", "Size=S"]);
  });

  it("adds an axis without duplicating variants and renames existing ones", () => {
    let host = makeComponent();
    let result = extendVariantProperties(host, host, { Size: ["S", "M"] });
    host = result.document;
    result = extendVariantProperties(host, { ...host }, { Size: ["S", "M"], State: ["Default", "Hover"] });
    const variants = componentVariants(result.document, { ...result.document, variantGroupId: result.document.variantGroupId });
    const names = variants.map((doc) => doc.variantName).sort();
    expect(names).toEqual([
      "Size=M, State=Default",
      "Size=M, State=Hover",
      "Size=S, State=Default",
      "Size=S, State=Hover",
    ]);
    expect(parseVariantName(names[0])).toEqual({ Size: "M", State: "Default" });
  });

  it("rejects empty axis names and values", () => {
    const host = makeComponent();
    expect(() => extendVariantProperties(host, host, {})).toThrow();
    expect(() => extendVariantProperties(host, host, { "": ["A"] })).toThrow();
    expect(() => extendVariantProperties(host, host, { Size: [] })).toThrow();
  });
});

describe("variants panel properties editor", () => {
  const engineFor = (document) => ({
    subscribeRender: () => () => {},
    getDocument: () => document,
    setDoc: vi.fn(),
  });

  it("shows the property editor for a main component", () => {
    const host = makeComponent();
    const html = renderToStaticMarkup(<VariantsSection engine={engineFor(host)} isMainComponent />);
    expect(html).toContain("editor.variants.properties");
    expect(html).toContain("editor.variants.propertyName");
    expect(html).toContain("editor.variants.addProperty");
    expect(html).toContain("editor.variants.add");
  });
});
