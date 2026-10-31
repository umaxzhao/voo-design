import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FigmaColorPicker from "../../src/canvas/color_picker/FigmaColorPicker.jsx";
import { FillSection } from "../../src/canvas/components/editor_properties/colour_fill_section.jsx";
const noop = () => {};
const image = "data:image/png;base64,fixture";
describe("unified fill editor", () => {
  it("offers solid, gradient, image and texture in the same fill picker", () => {
    const html = renderToStaticMarkup(<FigmaColorPicker color="#ff0000" allowMedia onChange={noop} />);
    expect(html.match(/role="tab"/g)).toHaveLength(4);
  });
  it("renders an editable image panel instead of an empty colour picker", () => {
    const html = renderToStaticMarkup(<FigmaColorPicker color={image} initialType="image" allowMedia onChange={noop} />);
    expect(html).toContain('type="file"');
    expect(html).toContain('accept="image/*"');
  });
  it("can render an existing image fill without an undefined scale selector", () => {
    expect(() => renderToStaticMarkup(<FillSection object={{
      id: "photo",
      kind: "image",
      fill: image
    }} edit={noop} editAndCommit={noop} />)).not.toThrow();
  });
  it("keeps hidden paints reachable and does not recreate an explicitly empty fill stack", () => {
    const hidden = renderToStaticMarkup(<FillSection object={{
      id: "hidden",
      fill: "#ff0000",
      fills: [{
        fill: "#ff0000",
        visible: false
      }]
    }} edit={noop} editAndCommit={noop} />);
    expect(hidden).toContain('aria-pressed="false"');
    const empty = renderToStaticMarkup(<FillSection object={{
      id: "empty",
      fill: "#ff0000",
      fills: []
    }} edit={noop} editAndCommit={noop} />);
    expect(empty).not.toContain('aria-pressed="true"');
  });
});
