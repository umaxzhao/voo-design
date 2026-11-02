import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Return the key itself so assertions can match stable aria-label keys.
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import TransformSection from "../../src/canvas/components/editor_properties/transform_section.jsx";
import AppearanceSection from "../../src/canvas/components/editor_properties/appearance_section.jsx";

const OPACITY_LABEL = 'aria-label="editor.props.opacity"';
const BLEND_LABEL = 'aria-label="editor.props.blendMode"';

function renderTransform(overrides = {}) {
  const object = {
    id: "rect-1",
    kind: "rect",
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    rotation: 0,
    shear: 0,
    opacity: 1,
    blendMode: "normal",
    ...overrides.object,
  };
  return renderToStaticMarkup(
    <TransformSection
      object={object}
      isRegion={overrides.isRegion ?? false}
      edit={() => {}}
      editAndCommit={() => {}}
      selectedNodes={[object]}
    />,
  );
}

const renderAppearance = (opacity = 1) => {
  const object = { id: "rect-1", kind: "rect", opacity, blendMode: "normal" };
  return renderToStaticMarkup(
    <AppearanceSection
      object={object}
      selectedNodes={[object]}
      edit={() => {}}
      editAndCommit={() => {}}
    />,
  );
};

describe("Transform and Appearance separation", () => {
  it("keeps opacity and blend mode out of Transform", () => {
    const html = renderTransform();
    expect(html).not.toContain(OPACITY_LABEL);
    expect(html).not.toContain(BLEND_LABEL);
    expect(html).not.toContain('role="separator"');
  });

  it("renders opacity and blend mode in the Appearance section", () => {
    const html = renderAppearance(0.5);
    expect(html).toContain(OPACITY_LABEL);
    expect(html).toContain(BLEND_LABEL);
    expect(html).toContain("editor.props.appearance");
    expect(html).toContain('value="50"');
  });

  it("disables the opacity field for a mixed multi-selection", () => {
    const a = { id: "a", kind: "rect", opacity: 0.25, blendMode: "normal" };
    const b = { id: "b", kind: "rect", opacity: 0.75, blendMode: "normal" };
    const html = renderToStaticMarkup(
      <AppearanceSection
        object={a}
        selectedNodes={[a, b]}
        edit={() => {}}
        editAndCommit={() => {}}
      />,
    );
    expect(html).toContain(OPACITY_LABEL);
    expect(html).toContain("disabled");
  });
});
