import { describe, expect, it, vi } from "vitest";
import { createEngineInitController } from "../../src/canvas/editor/editor_engine_init.js";
import {
  serialiseDocument,
  NODE_KIND,
} from "../../src/canvas/editor/scene_model.js";
import { reflowAutoLayout } from "../../src/canvas/editor/scene_auto_layout.js";

function createTestHarness({ fallbackFontDrift = 3 } = {}) {
  let currentDoc = null;
  let controller = null;

  const setDoc = vi.fn((next) => {
    currentDoc = controller ? controller.measureTextNodes(next) : next;
  });

  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    font: "",
    measureText: vi.fn((_text) => ({
      width: 147,
      actualBoundingBoxAscent: 15,
      actualBoundingBoxDescent: 5,
    })),
  };

  const setGuides = vi.fn();
  const setAppliedSnapshot = vi.fn();
  const requestRender = vi.fn();
  const notify = vi.fn();
  const incDocVersion = vi.fn();

  controller = createEngineInitController({
    ctx,
    getDoc: () => currentDoc,
    setDoc,
    setGuides,
    cache: { preload: async () => {}, put: () => {} },
    hostAdapter: {},
    viewportTools: {
      zoomToFit: vi.fn(),
      getZoom: () => 1,
      getViewport: () => ({ x: 0, y: 0 }),
    },
    history: { reset: vi.fn() },
    snapshotDoc: () => JSON.stringify(currentDoc),
    snapshotState: () => ({ doc: currentDoc }),
    getAppliedSnapshot: () => "",
    setAppliedSnapshot,
    incDocVersion,
    requestRender,
    notify,
    isDisposed: () => false,
    cameraMode: "normal",
  });

  return {
    controller,
    getDoc: () => currentDoc,
    setDoc,
    ctx,
    setAppliedSnapshot,
    requestRender,
    notify,
  };
}

function buildProfileCardDoc() {
  const rawDoc = {
    version: 2,
    width: 800,
    height: 600,
    background: "#ffffff",
    nodes: [
      {
        id: "card",
        kind: NODE_KIND.GROUP,
        isFrame: true,
        x: 50,
        y: 50,
        width: 320,
        height: 180,
        autoLayout: { direction: "vertical", gap: 12, padding: 16 },
      },
      {
        id: "header",
        kind: NODE_KIND.GROUP,
        parentId: "card",
        isFrame: true,
        x: 0,
        y: 0,
        width: 288,
        height: 24,
        autoLayout: { direction: "horizontal", gap: 8 },
      },
      {
        id: "name",
        kind: NODE_KIND.TEXT,
        parentId: "header",
        text: "Alex Rivera",
        fontFamily: "'Inter', sans-serif",
        fontSize: 16,
        width: 144,
        height: 20,
        x: 0,
        y: 0,
      },
      {
        id: "role",
        kind: NODE_KIND.TEXT,
        parentId: "header",
        text: "Product Designer",
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        width: 120,
        height: 16,
        x: 0,
        y: 0,
      },
      {
        id: "meta-group",
        kind: NODE_KIND.GROUP,
        parentId: "card",
        isFrame: true,
        x: 0,
        y: 0,
        width: 288,
        height: 18,
        autoLayout: { direction: "horizontal", gap: 6 },
      },
      {
        id: "meta-text",
        kind: NODE_KIND.TEXT,
        parentId: "meta-group",
        text: "San Francisco · 12 Projects",
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        width: 180,
        height: 16,
        x: 0,
        y: 0,
      },
      {
        id: "follow-btn",
        kind: NODE_KIND.GROUP,
        parentId: "card",
        isFrame: true,
        x: 0,
        y: 0,
        width: 80,
        height: 32,
        autoLayout: { direction: "horizontal", gap: 6, padding: 8 },
      },
      {
        id: "follow-text",
        kind: NODE_KIND.TEXT,
        parentId: "follow-btn",
        text: "Follow",
        fontFamily: "'Inter', sans-serif",
        fontSize: 14,
        width: 44,
        height: 18,
        x: 0,
        y: 0,
      },
      {
        id: "follow-icon",
        kind: NODE_KIND.RECT,
        parentId: "follow-btn",
        x: 0,
        y: 0,
        width: 16,
        height: 16,
      },
    ],
  };

  // Settled geometry as created and saved in the editor
  return reflowAutoLayout(rawDoc);
}

describe("cold reopen text width and auto-layout geometry preservation", () => {
  it("preserves exact saved text dimensions and auto-layout positions with 0px drift on document open", async () => {
    const settledDoc = buildProfileCardDoc();
    const savedDoc = serialiseDocument(settledDoc);

    const harness = createTestHarness({ fallbackFontDrift: 3 });
    const measureTextSpy = vi.spyOn(harness.ctx, "measureText");

    await harness.controller.open({ savedDoc });

    // Text measurement against Canvas2D must NOT be called for saved text nodes on open
    expect(measureTextSpy).not.toHaveBeenCalled();

    const openedDoc = harness.getDoc();
    expect(openedDoc).toBeDefined();

    // Verify all text node dimensions match the saved values with 0px drift
    const savedName = settledDoc.nodes.find((n) => n.id === "name");
    const openedName = openedDoc.nodes.find((n) => n.id === "name");
    expect(openedName.width).toBe(savedName.width);
    expect(openedName.height).toBe(savedName.height);

    const savedRole = settledDoc.nodes.find((n) => n.id === "role");
    const openedRole = openedDoc.nodes.find((n) => n.id === "role");
    expect(openedRole.width).toBe(savedRole.width);
    expect(openedRole.height).toBe(savedRole.height);

    const savedFollowText = settledDoc.nodes.find(
      (n) => n.id === "follow-text",
    );
    const openedFollowText = openedDoc.nodes.find(
      (n) => n.id === "follow-text",
    );
    expect(openedFollowText.width).toBe(savedFollowText.width);
    expect(openedFollowText.height).toBe(savedFollowText.height);

    // Verify all auto-layout container and child geometries match exactly (0px deviation)
    for (const savedNode of settledDoc.nodes) {
      const openedNode = openedDoc.nodes.find((n) => n.id === savedNode.id);
      expect(openedNode).toBeDefined();
      expect(openedNode.x).toBe(savedNode.x);
      expect(openedNode.y).toBe(savedNode.y);
      expect(openedNode.width).toBe(savedNode.width);
      expect(openedNode.height).toBe(savedNode.height);
    }
  });

  it("subsequently re-measures text and reflows auto-layout when text content is modified", async () => {
    const settledDoc = buildProfileCardDoc();
    const savedDoc = serialiseDocument(settledDoc);

    const harness = createTestHarness({ fallbackFontDrift: 0 });
    await harness.controller.open({ savedDoc });

    const measureTextSpy = vi.spyOn(harness.ctx, "measureText");
    // Mock newly measured width for expanded text
    measureTextSpy.mockReturnValue({
      width: 220,
      actualBoundingBoxAscent: 15,
      actualBoundingBoxDescent: 5,
    });

    const currentDoc = harness.getDoc();
    const initialRole = currentDoc.nodes.find((n) => n.id === "role");

    // User edits the name to a longer title
    const editedDoc = {
      ...currentDoc,
      nodes: currentDoc.nodes.map((n) =>
        n.id === "name"
          ? { ...n, text: "Alexander Maximilian Rivera, Principal Lead" }
          : n,
      ),
    };

    harness.setDoc(editedDoc);

    // Since text content changed, measureText must be called
    expect(measureTextSpy).toHaveBeenCalled();

    const updatedDoc = harness.getDoc();
    const updatedName = updatedDoc.nodes.find((n) => n.id === "name");
    const updatedRole = updatedDoc.nodes.find((n) => n.id === "role");

    // Name width updated
    expect(updatedName.width).toBe(220);

    // Role sibling should be shifted right by auto-layout because Name widened
    expect(updatedRole.x).toBeGreaterThan(initialRole.x);
  });

  it("measures unmeasured text nodes while preserving already measured saved text nodes", async () => {
    const settledDoc = buildProfileCardDoc();
    // Invalidate measurements on one text node to simulate an unmeasured import
    const partiallyUnmeasuredDoc = {
      ...settledDoc,
      nodes: settledDoc.nodes.map((n) =>
        n.id === "meta-text" ? { ...n, width: 0, height: 0 } : n,
      ),
    };
    const savedDoc = serialiseDocument(partiallyUnmeasuredDoc);

    const harness = createTestHarness();
    const measureTextSpy = vi.spyOn(harness.ctx, "measureText");
    measureTextSpy.mockReturnValue({
      width: 175,
      actualBoundingBoxAscent: 12,
      actualBoundingBoxDescent: 4,
    });

    await harness.controller.open({ savedDoc });

    const openedDoc = harness.getDoc();
    const nameNode = openedDoc.nodes.find((n) => n.id === "name");
    const metaNode = openedDoc.nodes.find((n) => n.id === "meta-text");

    // Saved node preserved
    expect(nameNode.width).toBe(144);
    expect(nameNode.height).toBe(20);

    // Unmeasured node received fresh measurement
    expect(metaNode.width).toBe(175);
    expect(metaNode.height).toBeGreaterThan(0);
  });

  it("clears stale signatures when switching between different documents", async () => {
    const docA = buildProfileCardDoc();
    const savedDocA = serialiseDocument(docA);

    const docB = {
      version: 2,
      width: 800,
      height: 600,
      background: "#ffffff",
      nodes: [
        {
          id: "name", // Same ID as in docA, but different text & dimensions
          kind: NODE_KIND.TEXT,
          text: "Brand New User",
          fontFamily: "'Inter', sans-serif",
          fontSize: 20,
          width: 210,
          height: 28,
          x: 100,
          y: 100,
        },
      ],
    };
    const savedDocB = serialiseDocument(docB);

    const harness = createTestHarness();

    await harness.controller.open({ savedDoc: savedDocA });
    expect(harness.getDoc().nodes.find((n) => n.id === "name").width).toBe(144);

    await harness.controller.open({ savedDoc: savedDocB });
    const openedB = harness.getDoc().nodes.find((n) => n.id === "name");
    expect(openedB.width).toBe(210);
    expect(openedB.text).toBe("Brand New User");
  });
});
