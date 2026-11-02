import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import EditorToolbar from "../../src/canvas/components/editor_toolbar.jsx";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

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

describe("Frame tool", () => {
  it("exists and renders between Select and Crop", () => {
    expect(TOOL.FRAME).toBe("frame");
    const markup = renderToStaticMarkup(
      React.createElement(EditorToolbar, {
        tool: TOOL.SELECT,
        onTool: () => {},
      }),
    );
    const selectIndex = markup.indexOf('aria-label="editor.tool.select"');
    const frameIndex = markup.indexOf('aria-label="editor.tool.frame"');
    const cropIndex = markup.indexOf('aria-label="editor.tool.crop"');
    expect(selectIndex).toBeLessThan(frameIndex);
    expect(frameIndex).toBeLessThan(cropIndex);
  });

  it("passes TOOL.FRAME to onTool when clicked", () => {
    const onTool = vi.fn();
    const tree = EditorToolbar({ tool: TOOL.SELECT, onTool });
    const frameButton = findElement(
      tree,
      (element) =>
        element.type === "button" &&
        element.props["aria-label"] === "editor.tool.frame",
    );
    expect(frameButton).toBeTruthy();
    frameButton.props.onClick();
    expect(onTool).toHaveBeenCalledWith(TOOL.FRAME);
  });
});
