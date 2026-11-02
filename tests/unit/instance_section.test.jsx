// Instance panel: source swapping and the override reset matrix.
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key, locale: "en", toggleLocale: () => {} }),
}));

import InstanceSection from "../../src/canvas/components/editor_properties/instance_section.jsx";
import {
  clearOverrideFields,
  overriddenFields,
  swapInstanceSource,
} from "../../src/canvas/editor/instance-overrides.js";

const instance = (overrides) => ({
  id: "i1",
  kind: "canvasInstance",
  sourceCanvasId: "c1",
  x: 0,
  y: 0,
  width: 100,
  height: 40,
  instance: overrides,
});

describe("override helpers", () => {
  it("lists and clears selected override fields", () => {
    const node = instance({
      overrides: {
        nodes: {
          bg: { fill: "#ff0000", stroke: "#000000" },
          label: { text: "Hi", fill: "#fff" },
        },
      },
    });
    expect([...overriddenFields(node.instance)].sort()).toEqual([
      "fill",
      "stroke",
      "text",
    ]);
    const textReset = clearOverrideFields(node.instance, ["text"]);
    expect(textReset.overrides.nodes.label).toEqual({ fill: "#fff" });
    expect(textReset.overrides.nodes.bg).toMatchObject({ fill: "#ff0000" });
  });

  it("swaps the source and drops stale overrides", () => {
    const node = instance({ overrides: { nodes: { bg: { fill: "#f00" } } } });
    const swapped = swapInstanceSource(node, "c2");
    expect(swapped.sourceCanvasId).toBe("c2");
    expect(swapped.instance.overrides).toEqual({});
    expect(swapInstanceSource(node, "c1")).toBe(node);
  });
});

describe("instance panel", () => {
  const engine = {
    getDocument: () => ({
      nodes: [instance({ overrides: { nodes: { bg: { fill: "#ff0000" }, label: { text: "Hi" } } } })],
      components: { c1: { canvasId: "c1", name: "Button" }, c2: { canvasId: "c2", name: "Card" } },
    }),
    setDoc: vi.fn(),
  };

  it("shows the source component and override reset groups", () => {
    const node = engine.getDocument().nodes[0];
    const html = renderToStaticMarkup(<InstanceSection object={node} engine={engine} />);
    expect(html).toContain("editor.props.instanceSource");
    expect(html).toContain("editor.props.resetText");
    expect(html).toContain("editor.props.resetFill");
    expect(html).toContain("editor.props.resetAllOverrides");
  });

  it("shows the empty state without overrides", () => {
    const node = instance({ overrides: {} });
    const html = renderToStaticMarkup(<InstanceSection object={node} engine={engine} />);
    expect(html).toContain("editor.props.noOverrides");
  });

  it("renders nothing for a non-instance layer", () => {
    const html = renderToStaticMarkup(
      <InstanceSection object={{ id: "r1", kind: "rect" }} engine={engine} />,
    );
    expect(html).toBe("");
  });
});
