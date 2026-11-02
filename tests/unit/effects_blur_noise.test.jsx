// Effects section: layer/background blur rows and the noise editor.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import LayerEffectsSection from "../../src/canvas/components/editor_properties/layer_effects_section.jsx";

const render = (object) =>
  renderToStaticMarkup(
    <LayerEffectsSection
      object={object}
      edit={() => {}}
      editAndCommit={() => {}}
      commitNow={() => {}}
    />,
  );

describe("blur and noise", () => {
  it("shows a single empty state until a blur, noise or effect exists", () => {
    const html = render({ id: "r1", kind: "rect", layerBlur: 0, backgroundBlur: 0 });
    expect(html).not.toContain("editor.props.emptyState");
    expect(html).not.toContain("editor.props.layerBlur");
    expect(html).not.toContain("editor.props.backgroundBlur");
  });

  it("shows layer and background blur fields once blur is in use", () => {
    const html = render({ id: "r1", kind: "rect", layerBlur: 8, backgroundBlur: 0 });
    expect(html).toContain("editor.props.layerBlur");
    expect(html).toContain("editor.props.backgroundBlur");
    expect(html).toContain("editor.props.noise");
  });

  it("shows the noise editor with opacity/density/size when noise exists", () => {
    const html = render({
      id: "r1",
      kind: "rect",
      noise: { opacity: 0.15, density: 0.5, size: 2 },
    });
    expect(html).toContain("editor.props.removeNoise");
    expect(html).toContain("editor.props.noiseOpacity");
    expect(html).toContain("editor.props.noiseDensity");
    expect(html).toContain("editor.props.noiseSize");
  });
});
