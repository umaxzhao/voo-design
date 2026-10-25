import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Return the key itself so assertions can match stable aria-label keys.
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({
    t: (key) => key,
    locale: "en",
    toggleLocale: () => {},
  }),
}));

import TransformSection from "../../src/canvas/components/editor_properties/transform_section.jsx";

const SEPARATOR = 'role="separator"';
const ROTATION_LABEL = 'aria-label="editor.props.rotation"';
const OPACITY_LABEL = 'aria-label="editor.props.opacity"';

function renderSection(overrides = {}) {
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

describe("TransformSection divider", () => {
  it("renders exactly one separator between the rotation row and the opacity row", () => {
    const html = renderSection();
    const separatorCount = html.split(SEPARATOR).length - 1;
    expect(separatorCount).toBe(1);

    const rotationAt = html.indexOf(ROTATION_LABEL);
    const separatorAt = html.indexOf(SEPARATOR);
    const opacityAt = html.indexOf(OPACITY_LABEL);
    expect(rotationAt).toBeGreaterThan(-1);
    expect(opacityAt).toBeGreaterThan(-1);
    expect(rotationAt).toBeLessThan(separatorAt);
    expect(separatorAt).toBeLessThan(opacityAt);
  });

  it("uses the panel section divider classes", () => {
    const html = renderSection();
    expect(html).toMatch(/<div role="separator" class="border-t border-white\/10"><\/div>/);
  });

  it("hides the divider for regions, where the rotation row is not rendered", () => {
    const html = renderSection({ isRegion: true });
    expect(html).not.toContain(SEPARATOR);
    expect(html).not.toContain(ROTATION_LABEL);
    expect(html).toContain(OPACITY_LABEL);
  });
});
