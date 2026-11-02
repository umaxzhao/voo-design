import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  StrokeJoinIcon,
  StrokeCapIcon,
  StrokeDashIcon,
  PenAnchorIcon,
} from "../../src/canvas/components/editor_properties/stroke_style_icons.jsx";

describe("StrokeStyleIcons", () => {
  it("renders join icons with data-stroke-join attribute", () => {
    for (const join of ["miter", "round", "bevel"]) {
      const html = renderToStaticMarkup(<StrokeJoinIcon join={join} />);
      expect(html).toContain(`data-stroke-join="${join}"`);
      expect(html).toContain(`stroke-linejoin="${join}"`);
      expect(html).toContain("<svg");
    }
  });

  it("renders cap icons with data-stroke-cap attribute", () => {
    for (const cap of ["butt", "round", "square"]) {
      const html = renderToStaticMarkup(<StrokeCapIcon cap={cap} />);
      expect(html).toContain(`data-stroke-cap="${cap}"`);
      expect(html).toContain(`stroke-linecap="${cap}"`);
      expect(html).toContain("<svg");
    }
  });

  it("renders dash icons with data-stroke-dash attribute", () => {
    for (const dash of ["solid", "dashed", "dotted", "custom"]) {
      const html = renderToStaticMarkup(<StrokeDashIcon dash={dash} />);
      expect(html).toContain(`data-stroke-dash="${dash}"`);
      expect(html).toContain("<svg");
    }
  });

  it("renders pen anchor icons with data-pen-anchor attribute", () => {
    for (const type of ["corner", "smooth", "delete"]) {
      const html = renderToStaticMarkup(<PenAnchorIcon type={type} />);
      expect(html).toContain(`data-pen-anchor="${type}"`);
      expect(html).toContain("<svg");
    }
  });
});
