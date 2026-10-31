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
