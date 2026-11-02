// Curvature pen and freehand pen derive their handles from the anchor
// positions; their panel exposes the handle tension, and the draft maths must
// honour it. The plain pen keeps dragging its own handles and shows no knob.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import PenProperties from "../../src/canvas/components/editor_properties/pen_properties.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";
import { createPenDraft } from "../../src/canvas/editor/editor_pen_draft.js";

function renderPanel(props) {
  return renderToStaticMarkup(
    <PenProperties
      onPenMode={() => {}}
      onPenStrokeWidth={() => {}}
      onPenAnchorType={() => {}}
      onPenCurveTension={() => {}}
      {...props}
    />,
  );
}

function makeDraft(tension) {
  return createPenDraft({
    getDoc: () => ({ nodes: [] }),
    setDoc: () => {},
    select: () => {},
    requestRender: () => {},
    getZoom: () => 1,
    getAnchorType: () => "corner",
    getPenMode: () => "path",
    getEdit: () => null,
    getPenCurveTension: () => tension,
  });
}

/** Out-handle length of the middle anchor after a curvature recompute. */
function middleHandleLength(tension) {
  const anchors = [
    { x: 0, y: 0, in: null, out: null, close: false },
    { x: 60, y: 0, in: null, out: null, close: false },
    { x: 120, y: 60, in: null, out: null, close: false },
  ];
  makeDraft(tension).recomputeCurvatureHandles(anchors);
  const [hx, hy] = anchors[1].out;
  return Math.hypot(hx, hy);
}

describe("pen curve tension", () => {
  it("scales the derived handles by the tension factor", () => {
    const classic = middleHandleLength(1);
    expect(classic).toBeCloseTo(Math.hypot(120, 60) / 6, 5);
    expect(middleHandleLength(2)).toBeCloseTo(classic * 2, 5);
    expect(middleHandleLength(0.5)).toBeCloseTo(classic * 0.5, 5);
  });

  it("clamps the tension to the panel's range", () => {
    const clampedHigh = middleHandleLength(99);
    expect(clampedHigh).toBeCloseTo(middleHandleLength(3), 5);
    const clampedLow = middleHandleLength(0.01);
    expect(clampedLow).toBeCloseTo(middleHandleLength(0.2), 5);
  });

  it("shows the tension knob only for the curvature pen", () => {
    const curvature = renderPanel({
      tool: TOOL.CURVATURE_PEN,
      penCurveTension: 1.5,
    });
    expect(curvature).toContain('aria-label="editor.pen.tension"');
    expect(curvature).toContain("150");

    const freePen = renderPanel({ tool: TOOL.FREE_PEN, penCurveTension: 1 });
    expect(freePen).toContain('aria-label="editor.pen.smoothing"');
    expect(freePen).not.toContain('aria-label="editor.pen.tension"');

    const plainPen = renderPanel({ tool: TOOL.PEN, penCurveTension: 1 });
    expect(plainPen).not.toContain('aria-label="editor.pen.tension"');
    expect(plainPen).not.toContain('aria-label="editor.pen.smoothing"');
  });
});
