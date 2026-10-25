// The Hand tool (H) pans the canvas by dragging, matching the Space-held
// gesture. It has a top-toolbar entry and never paints or selects.
if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}
if (typeof globalThis.Element === "undefined") {
  globalThis.Element = class Element {};
}

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import EditorToolbar from "../../src/canvas/components/editor_toolbar.jsx";
import {
  TOOL,
  TOOL_KEYS,
} from "../../src/canvas/editor/editor_constants.js";
import { TOOL_SHORTCUTS } from "../../src/canvas/editor/editor_shortcuts.js";
import { createPointerDownDispatcher } from "../../src/canvas/editor/editor_pointer_events.js";

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

describe("Hand tool", () => {
  it("has the H shortcut and a top-toolbar entry", () => {
    expect(TOOL.HAND).toBe("hand");
    expect(TOOL_KEYS.KeyH).toBe(TOOL.HAND);
    expect(TOOL_SHORTCUTS[TOOL.HAND]).toBe("H");

    const markup = renderToStaticMarkup(
      React.createElement(EditorToolbar, {
        tool: TOOL.SELECT,
        onTool: () => {},
      }),
    );
    expect(markup).toContain('aria-label="editor.tool.hand"');
  });

  it("switches to the hand tool when the toolbar button is clicked", () => {
    const onTool = vi.fn();
    const tree = EditorToolbar({ tool: TOOL.SELECT, onTool });
    const handButton = findElement(
      tree,
      (element) =>
        element.type === "button" &&
        element.props["aria-label"] === "editor.tool.hand",
    );
    expect(handButton).toBeTruthy();
    handButton.props.onClick();
    expect(onTool).toHaveBeenCalledWith(TOOL.HAND);
  });

  it("starts a pan gesture on pointer down instead of drawing", () => {
    const startPan = vi.fn();
    const setGesture = vi.fn();
    const dispatch = createPointerDownDispatcher({
      api: { getTool: () => TOOL.HAND },
      shared: false,
      pan: { startPan },
      drawing: {},
      shapes: {},
      marquee: {},
      selection: {},
      transform: {},
      setGesture,
    });

    dispatch.dispatchDown({ clientX: 10, clientY: 20, button: 0 }, false);

    expect(startPan).toHaveBeenCalledTimes(1);
    expect(setGesture).not.toHaveBeenCalled();
  });
});
