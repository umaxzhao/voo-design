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

  it("exports injected picker code containing element picker functions", () => {
    expect(INJECTED_PICKER_CODE).toContain("__vooStartPicker");
    expect(INJECTED_PICKER_CODE).toContain("__vooStopPicker");
    expect(INJECTED_PICKER_CODE).toContain("__vooExtractFullPage");
    expect(INJECTED_PICKER_CODE).toContain("__voo_picker_overlay__");
  });

  it("handles empty or blank HTML gracefully without crashing", async () => {
    const res1 = await importHtmlSnippetToCanvas({ html: "" });
    expect(res1.success).toBe(false);

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

    window.__vooEditor = mockEditor;

    const sampleHtml = `
      <div style="display: flex; flex-direction: column; width: 360px; height: 180px; background-color: #1e1e24; border-radius: 8px; padding: 16px;">
        <h2 style="font-size: 20px; font-weight: bold; color: #ffffff; margin-bottom: 8px;">Card Title</h2>
        <p style="font-size: 14px; color: #9ca3af;">This is an imported card description from the web.</p>
        <button style="margin-top: 12px; background-color: #3b82f6; color: #ffffff; padding: 6px 12px; border-radius: 4px; border: none;">Action</button>
      </div>
    `;

    const result = await importHtmlSnippetToCanvas({
      html: sampleHtml,
      width: 360,
      height: 180,
      title: "Pricing Card",
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
    }

    // Verify selection is invoked on new root
    expect(selectedIds).toBeDefined();
    expect(selectedIds?.length).toBeGreaterThan(0);
  });
});
