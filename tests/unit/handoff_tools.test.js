import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  exportCodeTool,
  inspectLayoutTool,
} from "../../src/canvas/agent/canvas_tools_handoff.js";

function simpleDoc() {
  return {
    width: 400,
    height: 300,
    nodes: [
      {
        id: "root",
        kind: "frame",
        name: "Card",
        x: 0,
        y: 0,
        width: 400,
        height: 300,
        clipContent: true,
        fills: [{ type: "solid", color: "#FFFFFF" }],
      },
      {
        id: "label",
        kind: "text",
        name: "Title",
        parentId: "root",
        x: 24,
        y: 24,
        width: 200,
        height: 32,
        text: "Hello",
        fontSize: 20,
        fills: [{ type: "solid", color: "#111111" }],
      },
    ],
  };
}

function manyNodesDoc(count) {
  const doc = { width: 1200, height: 900, nodes: [] };
  for (let index = 0; index < count; index += 1) {
    doc.nodes.push({
      id: `r${index}`,
      kind: "rect",
      name: `Rect ${index}`,
      x: (index % 20) * 50,
      y: Math.floor(index / 20) * 50,
      width: 40,
      height: 40,
      fills: [{ type: "solid", color: index % 2 ? "#EEEEEE" : "#DDDDDD" }],
    });
  }
  return doc;
}

function installEditor(doc, selectedIds = []) {
  globalThis.window = globalThis.window ?? {};
  globalThis.window.__vooEditor = {
    getDoc: () => doc,
    getSelectedIds: () => selectedIds,
  };
}

describe("handoff tools", () => {
  afterEach(() => {
    if (globalThis.window) delete globalThis.window.__vooEditor;
  });

  it("exports the current selection as HTML code", () => {
    installEditor(simpleDoc(), ["root"]);
    const result = exportCodeTool({ format: "html", scope: "selection" });
    expect(result.format).toBe("html");
    expect(result.language).toBe("html");
    expect(result.fileName.endsWith(".html")).toBe(true);
    expect(result.code).toContain("<div");
    expect(result.code.length).toBe(result.totalChars);
    expect(result.truncated).toBe(false);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it("exports React and plain CSS formats", () => {
    installEditor(simpleDoc(), ["root"]);
    const react = exportCodeTool({ format: "react" });
    expect(react.language).toBe("jsx");
    expect(react.fileName.endsWith(".jsx")).toBe(true);
    const css = exportCodeTool({ format: "css" });
    expect(css.language).toBe("css");
    expect(css.fileName.endsWith(".css")).toBe(true);
  });

  it("honours an explicit page scope", () => {
    installEditor(simpleDoc(), []);
    const result = exportCodeTool({ format: "html", scope: "page" });
    expect(result.scope).toBe("page");
    expect(result.code.length).toBeGreaterThan(0);
  });

  it("truncates large code at the requested budget", () => {
    installEditor(manyNodesDoc(150), []);
    const full = exportCodeTool({ format: "html", scope: "page", maxChars: 200000 });
    const capped = exportCodeTool({ format: "html", scope: "page", maxChars: 2000 });
    expect(full.truncated).toBe(false);
    expect(capped.totalChars).toBe(full.totalChars);
    expect(capped.truncated).toBe(capped.totalChars > 2000);
    expect(capped.code.length).toBeLessThanOrEqual(2000);
  });

  it("rejects an unsupported format", () => {
    installEditor(simpleDoc(), []);
    expect(() => exportCodeTool({ format: "png" })).toThrow(/Unsupported format/);
  });

  it("returns a structured layout report", () => {
    const doc = simpleDoc();
    doc.nodes[1].x = 380; // sticks out of the 400px frame
    installEditor(doc, []);
    const result = inspectLayoutTool({});
    expect(result.problems.some((problem) => ["clipped", "overflow"].includes(problem.kind))).toBe(true);
    expect(result.summary.total).toBeGreaterThanOrEqual(1);
  });

  it("rejects an unknown root id", () => {
    installEditor(simpleDoc(), []);
    expect(() => inspectLayoutTool({ rootId: "missing" })).toThrow();
  });
});
