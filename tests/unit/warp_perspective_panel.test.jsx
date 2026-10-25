// The Perspective tool's panel used to show cryptic H / V / SX / SY prefixes
// only. Each control now carries a readable label and its own reset, which is
// what makes per-axis correction possible without clearing all four values.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import WarpSection from "../../src/canvas/components/editor_properties/warp_section.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";
import { perspectiveParamsToCorners } from "../../src/canvas/editor/perspective_geometry.js";

function findElement(element, predicate) {
  if (!element || typeof element !== "object") return null;
  if (predicate(element)) return element;
  const children = element.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}

describe("Perspective panel", () => {
  it("labels each axis and gives it a reset", () => {
    const markup = renderToStaticMarkup(
      React.createElement(WarpSection, {
        tool: TOOL.PERSPECTIVE,
        object: { perspectiveCorners: perspectiveParamsToCorners(20, 0, 0, 0) },
        edit: () => {},
        editAndCommit: () => {},
        commitNow: () => {},
        onReset: () => {},
      }),
    );

    expect(markup).toContain('aria-label="editor.warp.axis.horizontal"');
    expect(markup).toContain('aria-label="editor.warp.axis.vertical"');
    expect(markup).toContain('aria-label="editor.warp.skewX"');
    expect(markup).toContain('aria-label="editor.warp.skewY"');
    expect(markup.match(/editor\.warp\.resetAxis"/g)?.length ?? 0).toBeGreaterThanOrEqual(
      4,
    );
    // No more bare H/V/SX/SY prefix chips.
    expect(markup).not.toContain(">SX<");
  });

  it("resets only the pressed axis and commits", () => {
    const edit = vi.fn();
    const commitNow = vi.fn();
    const tree = WarpSection({
      tool: TOOL.PERSPECTIVE,
      object: { perspectiveCorners: perspectiveParamsToCorners(20, 0, 0, 0) },
      edit,
      editAndCommit: () => {},
      commitNow,
      onReset: () => {},
    });
    const horizontalReset = findElement(
      tree,
      (element) =>
        element.type === "button" &&
        element.props["aria-label"] ===
          "editor.warp.axis.horizontal — editor.warp.resetAxis",
    );
    expect(horizontalReset).toBeTruthy();
    horizontalReset.props.onClick();

    expect(edit).toHaveBeenCalledWith({ perspectiveCorners: null });
    expect(commitNow).toHaveBeenCalledTimes(1);
  });
});
