import React from "react";
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Same hook harness as bottom_bar_ruler_more.test.jsx: lets the component be
// called as a function so its element tree can be inspected and clicked.
const hooks = vi.hoisted(() => ({ active: false, open: false, effects: [] }));
vi.mock("react", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useState: (initial) => hooks.active
      ? [hooks.open, (next) => { hooks.open = typeof next === "function" ? next(hooks.open) : next; }]
      : actual.useState(initial),
    useRef: (initial) => hooks.active ? { current: initial } : actual.useRef(initial),
    useEffect: (effect, deps) => hooks.active ? hooks.effects.push(effect) : actual.useEffect(effect, deps),
    useLayoutEffect: (effect, deps) => hooks.active ? hooks.effects.push(effect) : actual.useLayoutEffect(effect, deps),
  };
});

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en" }),
}));

import { EditorZoom } from "../../src/canvas/components/editor_zoom.jsx";

const noop = () => {};
const baseProps = {
  zoom: 0.58,
  canUndo: true,
  canRedo: true,
  onUndo: noop,
  onRedo: noop,
  onZoomIn: noop,
  onZoomOut: noop,
  onFit: noop,
  grid: null,
  onToggleGrid: noop,
  onToggleSnapToGrid: noop,
};

const render = (extra = {}) =>
  renderToStaticMarkup(<EditorZoom {...baseProps} {...extra} />);

// The percent label's full markup, e.g. <button ...>58%</button>.
const percentButton = (html) =>
  html.match(/<button[^>]*data-testid="editor-zoom-percent"[\s\S]*?<\/button>/)?.[0] ?? "";

const flatten = (node) => !node || typeof node !== "object" ? [] :
  [node, ...React.Children.toArray(node.props?.children).flatMap(flatten)];

// Calls the component as a function, so the element tree is available for clicks.
const callBar = (props) => {
  hooks.active = true;
  hooks.open = false;
  try {
    return EditorZoom(props);
  } finally {
    hooks.active = false;
  }
};

describe("zoom percent label: placement", () => {
  it("renders between the zoom-out and zoom-in buttons in markup order", () => {
    const html = render();
    const out = html.indexOf('aria-label="editor.zoomOut"');
    const percent = html.indexOf('data-testid="editor-zoom-percent"');
    const into = html.indexOf('aria-label="editor.zoomIn"');
    expect(out).toBeGreaterThan(-1);
    expect(percent).toBeGreaterThan(out);
    expect(into).toBeGreaterThan(percent);
  });

  it("is rendered exactly once in the bar", () => {
    const html = render();
    expect(html.split('data-testid="editor-zoom-percent"').length - 1).toBe(1);
  });
});

describe("zoom percent label: value", () => {
  it("shows 100% at 100% zoom", () => {
    const html = render({ zoom: 1 });
    expect(percentButton(html)).toMatch(/>100%<\/button>$/);
  });

  it("shows 58% at 0.58 zoom", () => {
    const html = render({ zoom: 0.58 });
    expect(percentButton(html)).toMatch(/>58%<\/button>$/);
  });

  it("rounds to a whole percentage", () => {
    expect(percentButton(render({ zoom: 0.335 }))).toMatch(/>34%<\/button>$/);
    expect(percentButton(render({ zoom: 2.5 }))).toMatch(/>250%<\/button>$/);
  });

  it("uses tabular numerals and a fixed minimum width so the bar does not jump", () => {
    const button = percentButton(render());
    expect(button).toContain("tabular-nums");
    expect(button).toContain("min-w-[2.25rem]");
    expect(button).toContain("text-black");
  });

  it("keeps the Zoom to fit menu hint unchanged", () => {
    // Open the More menu during the call so the Zoom to fit item is in the tree.
    hooks.active = true;
    hooks.open = true;
    let root;
    try {
      root = EditorZoom({ ...baseProps, zoom: 0.58 });
    } finally {
      hooks.active = false;
      hooks.open = false;
    }
    const fit = flatten(root).find((node) => node.props?.["data-testid"] === "editor-fit-btn");
    expect(fit).toBeDefined();
    expect(fit.props["aria-label"]).toBe("editor.zoomFit");
    expect(renderToStaticMarkup(fit)).toMatch(/58(<!-- -->)?%/);
    expect(render({ zoom: 0.58 })).not.toContain('data-testid="editor-fit-btn"');
  });
});

describe("zoom percent label: accessibility", () => {
  it("is a live region", () => {
    expect(percentButton(render())).toContain('aria-live="polite"');
  });

  it("is a button with a visible focus ring, like its neighbours", () => {
    const button = percentButton(render());
    expect(button).toContain('type="button"');
    expect(button).toContain("focus-visible:ring-1");
  });
});

describe("zoom percent label: click", () => {
  it("calls onZoomReset once when clicked", () => {
    const reset = vi.fn();
    const root = callBar({ ...baseProps, onZoomReset: reset });
    const label = flatten(root).find((node) => node.props?.["data-testid"] === "editor-zoom-percent");
    expect(label).toBeDefined();
    label.props.onClick();
    expect(reset).toHaveBeenCalledOnce();
  });

  it("does not throw when no reset handler is passed", () => {
    const root = callBar({ ...baseProps });
    const label = flatten(root).find((node) => node.props?.["data-testid"] === "editor-zoom-percent");
    expect(() => label.props.onClick()).not.toThrow();
  });
});

describe("image_editor wiring", () => {
  it("passes a 100% reset to EditorZoom for single and multi-page editing", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/canvas/components/image_editor.jsx"), "utf8",
    );
    const bar = src.slice(src.indexOf("<EditorZoom"), src.indexOf("</EditorZoom>"));
    expect(bar).toContain("onZoomReset={");
    expect(bar).toContain("zoomSharedHundred");
    expect(bar).toContain("engine?.zoomToHundred?.()");
  });
});
