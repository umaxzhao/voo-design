import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AgentContextChip from "../../src/canvas/components/agent-panel/agent_context_chip.jsx";
import {
  readSelectionContext,
  selectionContextKey,
  promptWithSelection,
  contextLabel,
} from "../../src/canvas/components/agent-panel/selection_context.js";

const frame = { id: "frame", name: "Poster", isFrame: true, kind: "group" };
const text = {
  id: "title",
  name: "Title",
  kind: "text",
  parentId: "frame",
  text: "Hello",
  width: 120,
  height: 30,
};
const shape = { id: "shape", name: "Button", kind: "rect", parentId: "frame" };
const engine = (ids) => ({
  getSelectedIds: () => ids,
  getNode: (id) => [frame, text, shape].find((node) => node.id === id),
});
const scope = { documentId: "doc-a", pageId: "page-a" };

describe("Agent selection context", () => {
  it("captures exact layer and outer frame identities for single and multiple selections", () => {
    const context = readSelectionContext(
      engine(["title", "shape", "title", "missing"]),
      scope,
    );
    expect(context.nodeIds).toEqual(["title", "shape"]);
    expect(context.selection[0]).toMatchObject({
      nodeId: "title",
      text: "Hello",
      parentId: "frame",
      frameId: "frame",
      frameName: "Poster",
    });
    expect(context).toMatchObject(scope);
    expect(readSelectionContext(engine([]), scope)).toBeNull();
  });
  it("keeps the submitted target snapshot independent of later node changes", () => {
    const context = readSelectionContext(engine(["title"]), scope);
    const message = promptWithSelection("Make this green", context);
    expect(message).toContain('"nodeId":"title"');
    expect(message).toContain('"frameId":"frame"');
    expect(message).toContain('"pageId":"page-a"');
    expect(message).toContain("Make this green");
    expect(context.selection[0]).not.toBe(text);
    expect(promptWithSelection("No attachment", null)).toBe("No attachment");
  });
  it("supports existing explicit context and safely serializes node names", () => {
    const prompt = promptWithSelection("Edit this", {
      nodeId: "legacy",
      name: 'Name\n"quoted"',
      kind: "image",
    });
    expect(JSON.parse(prompt.split("\n")[1]).selection[0]).toMatchObject({
      nodeId: "legacy",
      name: 'Name\n"quoted"',
    });
  });
  it("captures live fill, stroke, radius, typography and auto-layout for a delta edit", () => {
    const card = {
      id: "card",
      name: "Card",
      kind: "rect",
      parentId: "frame",
      x: 20,
      y: 30,
      width: 240,
      height: 160,
      fill: "#111827",
      stroke: "#ffffff",
      strokeWidth: 2,
      cornerRadius: 12,
      autoLayout: {
        direction: "vertical",
        gap: 12,
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
        alignItems: "start",
      },
    };
    const heading = {
      id: "heading",
      name: "Heading",
      kind: "text",
      parentId: "card",
      text: "Hover me",
      width: 200,
      height: 40,
      fill: "#ffffff",
      fontSize: 28,
      fontWeight: 700,
      fontFamily: "Inter",
    };
    const engine = {
      getSelectedIds: () => ["card", "heading"],
      getNode: (id) => ({ frame, card, heading })[id],
    };
    const context = readSelectionContext(engine, scope);
    expect(context.selection[0]).toMatchObject({
      nodeId: "card",
      fill: "#111827",
      stroke: "#ffffff",
      strokeWidth: 2,
      cornerRadius: 12,
      autoLayout: {
        direction: "vertical",
        gap: 12,
        padding: { top: 16, right: 16, bottom: 16, left: 16 },
      },
    });
    // Only the layout structure the delta tools accept is carried over.
    expect(context.selection[0].autoLayout).not.toHaveProperty("alignItems");
    expect(context.selection[1]).toMatchObject({
      nodeId: "heading",
      fill: "#ffffff",
      fontSize: 28,
      fontWeight: 700,
      fontFamily: "Inter",
      frameId: "frame",
    });
  });
  it("omits style fields the node does not carry", () => {
    const context = readSelectionContext(engine(["shape"]), scope);
    for (const key of [
      "fill",
      "stroke",
      "strokeWidth",
      "cornerRadius",
      "autoLayout",
      "fontSize",
      "fontWeight",
      "fontFamily",
    ]) {
      expect(context.selection[0], key).not.toHaveProperty(key);
    }
    expect(readSelectionContext(engine(["title"]), scope).selection[0]).not.toHaveProperty("fill");
  });
  it("tells the model the snapshot is enough to apply delta tools directly", () => {
    const card = {
      id: "card",
      name: "Card",
      kind: "rect",
      parentId: "frame",
      width: 240,
      height: 160,
      fill: "#111827",
      cornerRadius: 12,
    };
    const message = promptWithSelection("Make this card rounder", {
      ...readSelectionContext({ getSelectedIds: () => ["card"], getNode: (id) => ({ frame, card })[id] }, scope),
    });
    for (const tool of [
      "mutate_layer_style",
      "mutate_layer_layout",
      "mutate_layer_text",
      "batch_mutate_layers",
    ]) {
      expect(message, tool).toContain(tool);
    }
    expect(message).toContain("without spending an extra round trip on inspect_layer_tree");
    expect(message).toContain("already carries each target's size, colour, text, typography and auto-layout");
    expect(message).toContain("snapshot at send time");
    expect(message).toContain("Make this card rounder");
  });
  it("distinguishes documents but not selection order and localizes multi-selection labels", () => {
    const first = readSelectionContext(engine(["title", "shape"]), scope);
    const reversed = readSelectionContext(engine(["shape", "title"]), scope);
    expect(selectionContextKey(first)).toBe(selectionContextKey(reversed));
    expect(selectionContextKey(first)).not.toBe(
      selectionContextKey({ ...first, documentId: "doc-b" }),
    );
    expect(contextLabel(first, (key, args) => `${key}:${args.count}`)).toBe(
      "agent.panel.selectedCount:2",
    );
  });
});


describe("Agent context icons", () => {
  it.each([
    ["frame", readSelectionContext(engine(["frame"]), scope), "frame"],
    ["artboard", { kind: "artboard", name: "Artboard" }, "frame"],
    ["ordinary layer", readSelectionContext(engine(["title"]), scope), "layers"],
    ["multiple including Frame", readSelectionContext(engine(["frame", "shape"]), scope), "layers"],
    ["ordinary group", { kind: "group", name: "Group" }, "layers"],
  ])("renders the correct icon for %s", (_name, context, icon) => {
    const html = renderToStaticMarkup(React.createElement(AgentContextChip, {
      context, onDetach: () => {}, t: (key) => key,
    }));
    expect(html).toContain(`lucide-${icon}`);
    expect(html).not.toContain(`lucide-${icon === "frame" ? "layers" : "frame"}`);
    expect(html).toContain('aria-hidden="true"');
  });
});
