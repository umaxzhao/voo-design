/**
 * Regression for UF19: pasting custom HTML into the Browser drawer must keep
 * the root element's background on the imported group, not drop it or paint
 * the whole current document canvas.
 */
// Polyfill window in Node test environment (same as browser_drawer_import.test.js)
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { incrementalHtmlToDocument } from "../../src/canvas/editor/html_import.js";
import { importHtmlSnippetToCanvas } from "../../src/canvas/components/browser_drawer/browser_import_helpers.js";

const ROOT_HTML = `
  <main style="width: 352px; padding: 16px; background-color: #ffffff; font: 16px Arial;">
    <h1 style="font-size: 24px; margin: 0 0 8px 0;">Typography</h1>
    <p style="font-size: 14px; margin: 0;">Body copy line one.</p>
  </main>
`;

function rootGroupOf(nodes) {
  return nodes.find((node) => !node.parentId && node.kind === "group");
}

describe("HTML import root background (UF19)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete globalThis.window?.__vooEditor;
  });

  it("puts the root solid fill on the root group as a frame when opted in", () => {
    const parsed = incrementalHtmlToDocument(ROOT_HTML, {
      width: 1080,
      height: 900,
      rootBackgroundOnGroup: true,
    });
    const root = rootGroupOf(parsed.doc.nodes);
    expect(root).toBeDefined();
    expect(root.isFrame).toBe(true);
    expect(root.fill).toBe("#ffffff");
  });

  it("keeps the default import unchanged when the option is absent", () => {
    const parsed = incrementalHtmlToDocument(ROOT_HTML, { width: 1080, height: 900 });
    const root = rootGroupOf(parsed.doc.nodes);
    expect(root?.fill).toBeUndefined();
    expect(root?.isFrame).toBeFalsy();
  });

  it("leaves a root without a background transparent even when opted in", () => {
    const parsed = incrementalHtmlToDocument(
      `<main style="width: 200px;"><p style="margin:0;">Plain text</p></main>`,
      { width: 1080, height: 900, rootBackgroundOnGroup: true },
    );
    const root = rootGroupOf(parsed.doc.nodes);
    expect(root?.fill).toBeUndefined();
    expect(root?.isFrame).toBeFalsy();
  });

  it("imports into the drawer without overwriting the existing canvas background", async () => {
    let committedDoc = null;
    const existingNode = {
      id: "existing-1",
      name: "Existing",
      kind: "rect",
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      parentId: null,
    };
    globalThis.window.__vooEditor = {
      getDocument: vi.fn(() => ({
        width: 1440,
        height: 900,
        background: "#000000",
        nodes: [existingNode],
      })),
      setDoc: vi.fn((doc) => {
        committedDoc = doc;
      }),
      selectExactly: vi.fn(),
    };

    const result = await importHtmlSnippetToCanvas({ html: ROOT_HTML, title: "Typography" });
    expect(result.success).toBe(true);
    expect(committedDoc.background).toBe("#000000");
    expect(committedDoc.nodes[0]).toEqual(existingNode);
    const imported = committedDoc.nodes.slice(1);
    const frame = imported.find((node) => !node.parentId && node.isFrame);
    expect(frame?.fill).toBe("#ffffff");
  });
});
