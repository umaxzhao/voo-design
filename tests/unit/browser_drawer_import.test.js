// Polyfill window in Node test environment
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { importHtmlSnippetToCanvas } from "../../src/canvas/components/browser_drawer/browser_import_helpers.js";
import { INJECTED_PICKER_CODE } from "../../src/canvas/components/browser_drawer/browser_picker_script.js";

describe("Browser Drawer HTML Import & Helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete globalThis.window.__vooEditor;
  });

  it("exports injected picker code containing element picker functions and style serializing", () => {
    expect(INJECTED_PICKER_CODE).toContain("__vooStartPicker");
    expect(INJECTED_PICKER_CODE).toContain("__vooStopPicker");
    expect(INJECTED_PICKER_CODE).toContain("__vooExtractFullPage");
    expect(INJECTED_PICKER_CODE).toContain("__voo_picker_overlay__");
    expect(INJECTED_PICKER_CODE).toContain("serializeNodeWithStyles");
    expect(INJECTED_PICKER_CODE).toContain("ESSENTIAL_CSS_PROPS");
  });

  it("handles empty or blank HTML gracefully without crashing", async () => {
    const res1 = await importHtmlSnippetToCanvas({ html: "" });
    expect(res1.success).toBe(false);
    expect(res1.error).toContain("No HTML content");

    const res2 = await importHtmlSnippetToCanvas({ html: "   " });
    expect(res2.success).toBe(false);
  });

  it("converts web HTML snippet to canvas nodes and invokes setDoc on active editor", async () => {
    let committedDoc = null;
    let selectedIds = null;

    const mockEditor = {
      getDocument: vi.fn(() => ({
        width: 1440,
        height: 900,
        nodes: [
          { id: "existing-1", name: "Existing Frame", x: 100, y: 100, width: 400, height: 300, parentId: null },
        ],
      })),
      setDoc: vi.fn((doc) => {
        committedDoc = doc;
      }),
      selectExactly: vi.fn((ids) => {
        selectedIds = ids;
      }),
    };

    globalThis.window.__vooEditor = mockEditor;

    const sampleHtml = `
      <div style="display: flex; flex-direction: column; width: 360px; height: 180px; background-color: #1e1e24; border-radius: 8px; padding: 16px;">
        <h2 style="font-size: 20px; font-weight: bold; color: #ffffff; margin-bottom: 8px;">Awwwards Site Winner</h2>
        <p style="font-size: 14px; color: #9ca3af;">Creative design with fluid grid and interactions.</p>
        <button style="margin-top: 12px; background-color: #3b82f6; color: #ffffff; padding: 6px 12px; border-radius: 4px; border: none;">Explore</button>
      </div>
    `;

    const result = await importHtmlSnippetToCanvas({
      html: sampleHtml,
      width: 360,
      height: 180,
      title: "Awwwards Hero Card",
    });

    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThan(0);
    expect(mockEditor.setDoc).toHaveBeenCalled();

    // Verify non-overlapping placement: since existing node has right edge 100+400=500,
    // new nodes should start at right >= 580
    expect(committedDoc).not.toBeNull();
    const importedRoots = committedDoc.nodes.filter(n => n.id !== "existing-1" && !n.parentId);
    expect(importedRoots.length).toBeGreaterThan(0);
    for (const root of importedRoots) {
      expect(root.x).toBeGreaterThanOrEqual(580);
      expect(root.name).toContain("Awwwards Hero Card");
    }

    // Verify selection is invoked on new root
    expect(selectedIds).toBeDefined();
    expect(selectedIds?.length).toBeGreaterThan(0);
  });

  it("handles complex HTML with images, SVGs and nested flexbox", async () => {
    let committedDoc = null;
    const mockEditor = {
      getDocument: vi.fn(() => ({
        width: 1440,
        height: 900,
        nodes: [],
      })),
      setDoc: vi.fn((doc) => {
        committedDoc = doc;
      }),
      selectExactly: vi.fn(),
    };

    globalThis.window.__vooEditor = mockEditor;

    const complexHtml = `
      <section style="display: flex; gap: 20px; width: 800px; height: 400px; background: #0f1015; padding: 24px;">
        <div style="flex: 1; display: flex; flex-direction: column;">
          <h1 style="color: #ffffff; font-size: 32px;">Modern Portfolio</h1>
          <p style="color: #888888; font-size: 16px;">Designed for high performance.</p>
        </div>
        <img src="https://images.unsplash.com/photo-1518770660439-4636190af475" style="width: 300px; height: 200px; border-radius: 12px;" />
      </section>
    `;

    const result = await importHtmlSnippetToCanvas({
      html: complexHtml,
      width: 800,
      height: 400,
      title: "Portfolio Section",
    });

    expect(result.success).toBe(true);
    expect(result.count).toBeGreaterThan(1);
    expect(committedDoc.nodes.length).toBeGreaterThan(1);
  });
});
