import { describe, expect, it } from "vitest";
import { openVooProject } from "../../src/canvas/store/project_io.js";

function documentFile() {
  const doc = {
    format: "voo-editor",
    version: 2,
    kind: "design",
    assets: {},
    document: {
      version: 2,
      width: 10,
      height: 10,
      nodes: [],
      pages: [{ id: "p1", label: "Page", canvasType: "design", sceneDoc: { version: 2, width: 10, height: 10, nodes: [] } }],
    },
  };
  return { name: "doc.voo", arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(doc)).buffer };
}

describe("document loading overlay", () => {
  it("is raised while the document loads and lowered only after it is in the store", async () => {
    const events = [];
    const store = {
      setDocumentLoading: (label) => events.push(label === null ? "off" : "on"),
      loadVooProject: () => events.push("loaded"),
    };

    const result = await openVooProject({ store, fileOrPath: documentFile() });

    expect(result.success).toBe(true);
    expect(events[0]).toBe("on");
    expect(events.indexOf("loaded")).toBeGreaterThan(0);
    expect(events.at(-1)).toBe("off");
  });

  it("lowers the overlay even when the open is cancelled", async () => {
    const events = [];
    const store = { setDocumentLoading: (label) => events.push(label), loadVooProject: () => {} };
    // Without a browser there is no picker to open, so the open is cancelled.
    globalThis.window = {};
    try {
      const result = await openVooProject({ store, fileOrPath: null });

      expect(result.canceled).toBe(true);
    } finally {
      delete globalThis.window;
    }
    expect(events.at(-1)).toBeNull();
  });
});
