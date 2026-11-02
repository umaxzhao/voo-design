import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEngineInitController } from "../../src/canvas/editor/editor_engine_init.js";
import {
  serialiseDocument,
  NODE_KIND,
} from "../../src/canvas/editor/scene_model.js";
import { reflowAutoLayout } from "../../src/canvas/editor/scene_auto_layout.js";
import { ensureFontLoaded } from "../../src/canvas/editor/font_loader.js";

vi.mock("../../src/canvas/editor/font_loader.js", () => ({
  ensureFontLoaded: vi.fn(),
}));

const bbox = (width, ascent = 15, descent = 5) => ({
  width,
  actualBoundingBoxAscent: ascent,
  actualBoundingBoxDescent: descent,
});

function createTestHarness({ measureWidth = 147 } = {}) {
  let currentDoc = null;
  let controller = null;
  let appliedSnapshot = "";

  const setDoc = vi.fn((next) => {
    currentDoc = controller ? controller.measureTextNodes(next) : next;
  });

  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    font: "",
    measureText: vi.fn((_text) => bbox(measureWidth)),
  };

  const setAppliedSnapshot = vi.fn((val) => {
    appliedSnapshot = val;
  });

  controller = createEngineInitController({
    ctx,
    getDoc: () => currentDoc,
    setDoc,
    setGuides: vi.fn(),
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
    getAppliedSnapshot: () => appliedSnapshot,
    setAppliedSnapshot,
    incDocVersion: vi.fn(),
    requestRender: vi.fn(),
    notify: vi.fn(),
    isDisposed: () => false,
    cameraMode: "normal",
  });

  return {
    controller,
    getDoc: () => currentDoc,
    setDoc,
    ctx,
    setAppliedSnapshot,
  };
}

function buildProfileCardDoc() {
  const text = (id, parentId, content, fontSize, width, height) => ({
    id,
    kind: NODE_KIND.TEXT,
    parentId,
    text: content,
    fontFamily: "'Inter', sans-serif",
    fontSize,
    width,
    height,
    x: 0,
    y: 0,
  });
  const group = (id, parentId, width, height, autoLayout, x = 0, y = 0) => ({
    id,
    kind: NODE_KIND.GROUP,
    isFrame: true,
    parentId,
    width,
    height,
    autoLayout,
    x,
    y,
  });

  return reflowAutoLayout({
    version: 2,
    width: 800,
    height: 600,
    background: "#ffffff",
    nodes: [
      group(
        "card",
        null,
        320,
        180,
        { direction: "vertical", gap: 12, padding: 16 },
        50,
        50,
      ),
      group("header", "card", 288, 24, { direction: "horizontal", gap: 8 }),
      text("name", "header", "Alex Rivera", 16, 144, 20),
      text("role", "header", "Product Designer", 12, 120, 16),
      group("meta-group", "card", 288, 18, { direction: "horizontal", gap: 6 }),
      text(
        "meta-text",
        "meta-group",
        "San Francisco · 12 Projects",
        12,
        180,
        16,
      ),
      group("follow-btn", "card", 80, 32, {
        direction: "horizontal",
        gap: 6,
        padding: 8,
      }),
      text("follow-text", "follow-btn", "Follow", 14, 44, 18),
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
  });
}

function expectNodesMatch(actualDoc, expectedDoc) {
  for (const expected of expectedDoc.nodes) {
    const actual = actualDoc.nodes.find((n) => n.id === expected.id);
    expect(actual).toBeDefined();
    expect(actual.x).toBe(expected.x);
    expect(actual.y).toBe(expected.y);
    expect(actual.width).toBe(expected.width);
    expect(actual.height).toBe(expected.height);
  }
}

describe("cold reopen text width and auto-layout geometry preservation", () => {
  beforeEach(() => {
    vi.mocked(ensureFontLoaded).mockReset();
  });

  it("preserves exact saved text dimensions and auto-layout positions with 0px drift on document open", async () => {
    const settledDoc = buildProfileCardDoc();
    const savedDoc = serialiseDocument(settledDoc);
    const harness = createTestHarness();
    const measureTextSpy = vi.spyOn(harness.ctx, "measureText");

    await harness.controller.open({ savedDoc });

    expect(measureTextSpy).not.toHaveBeenCalled();
    expectNodesMatch(harness.getDoc(), settledDoc);
  });

  it("subsequently re-measures text and reflows auto-layout when text content is modified", async () => {
    const settledDoc = buildProfileCardDoc();
    const savedDoc = serialiseDocument(settledDoc);
    const harness = createTestHarness();
    await harness.controller.open({ savedDoc });

    const measureTextSpy = vi.spyOn(harness.ctx, "measureText");
    measureTextSpy.mockReturnValue(bbox(220));

    const currentDoc = harness.getDoc();
    const initialRole = currentDoc.nodes.find((n) => n.id === "role");

    harness.setDoc({
      ...currentDoc,
      nodes: currentDoc.nodes.map((n) =>
        n.id === "name"
          ? { ...n, text: "Alexander Maximilian Rivera, Principal Lead" }
          : n,
      ),
    });
    expect(measureTextSpy).toHaveBeenCalled();

    const updatedDoc = harness.getDoc();
    expect(updatedDoc.nodes.find((n) => n.id === "name").width).toBe(220);
    expect(updatedDoc.nodes.find((n) => n.id === "role").x).toBeGreaterThan(
      initialRole.x,
    );
  });

  it("measures unmeasured text nodes while preserving already measured saved text nodes", async () => {
    const settledDoc = buildProfileCardDoc();
    const partiallyUnmeasuredDoc = {
      ...settledDoc,
      nodes: settledDoc.nodes.map((n) =>
        n.id === "meta-text" ? { ...n, width: 0, height: 0 } : n,
      ),
    };
    const savedDoc = serialiseDocument(partiallyUnmeasuredDoc);
    const harness = createTestHarness();
    const measureTextSpy = vi.spyOn(harness.ctx, "measureText");
    measureTextSpy.mockReturnValue(bbox(175, 12, 4));

    await harness.controller.open({ savedDoc });

    const openedDoc = harness.getDoc();
    expect(openedDoc.nodes.find((n) => n.id === "name").width).toBe(144);
    expect(openedDoc.nodes.find((n) => n.id === "name").height).toBe(20);
    expect(openedDoc.nodes.find((n) => n.id === "meta-text").width).toBe(175);
    expect(
      openedDoc.nodes.find((n) => n.id === "meta-text").height,
    ).toBeGreaterThan(0);
  });

  it("clears stale signatures when switching between different documents", async () => {
    const docA = buildProfileCardDoc();
    const docB = {
      version: 2,
      width: 800,
      height: 600,
      background: "#ffffff",
      nodes: [
        {
          id: "name",
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
    const harness = createTestHarness();

    await harness.controller.open({ savedDoc: serialiseDocument(docA) });
    expect(harness.getDoc().nodes.find((n) => n.id === "name").width).toBe(144);

    await harness.controller.open({ savedDoc: serialiseDocument(docB) });
    const openedB = harness.getDoc().nodes.find((n) => n.id === "name");
    expect(openedB.width).toBe(210);
    expect(openedB.text).toBe("Brand New User");
  });

  it("preserves exact saved text dimensions and auto-layout positions after async font resolution (strictLossless: true)", async () => {
    const settledDoc = buildProfileCardDoc();
    const savedDoc = serialiseDocument(settledDoc);

    let resolveFont;
    const fontPromise = new Promise((resolve) => {
      resolveFont = resolve;
    });
    vi.mocked(ensureFontLoaded).mockReturnValue(fontPromise);

    const harness = createTestHarness({ measureWidth: 147 });
    await harness.controller.open({ savedDoc });

    const measureTextSpy = vi.spyOn(harness.ctx, "measureText");

    resolveFont(true);
    await fontPromise;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();

    expect(measureTextSpy).not.toHaveBeenCalled();
    expectNodesMatch(harness.getDoc(), settledDoc);
  });

  it("remeasures edited and newly added text nodes while preserving unedited saved text nodes upon font resolution", async () => {
    const settledDoc = buildProfileCardDoc();
    const savedDoc = serialiseDocument(settledDoc);

    let resolveFont;
    const fontPromise = new Promise((resolve) => {
      resolveFont = resolve;
    });
    vi.mocked(ensureFontLoaded).mockReturnValue(fontPromise);

    const harness = createTestHarness({ measureWidth: 147 });
    await harness.controller.open({ savedDoc });

    const currentDoc = harness.getDoc();
    const editedDoc = {
      ...currentDoc,
      nodes: [
        ...currentDoc.nodes.map((n) =>
          n.id === "name" ? { ...n, text: "Alexander Maximilian Rivera" } : n,
        ),
        {
          id: "new-tag",
          kind: NODE_KIND.TEXT,
          text: "NEW",
          fontFamily: "'Inter', sans-serif",
          fontSize: 10,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
        },
      ],
    };

    const measureTextSpy = vi.spyOn(harness.ctx, "measureText");
    measureTextSpy.mockImplementation((text) => {
      if (text.includes("Alexander")) return bbox(220);
      if (text.includes("NEW")) return bbox(30, 10, 4);
      return bbox(147);
    });

    harness.setDoc(editedDoc);
    expect(measureTextSpy).toHaveBeenCalled();
    measureTextSpy.mockClear();

    measureTextSpy.mockImplementation((text) => {
      if (text.includes("Alexander")) return bbox(225);
      if (text.includes("NEW")) return bbox(32, 10, 4);
      if (text === "M")
        return {
          width: 10,
          fontBoundingBoxAscent: 12,
          fontBoundingBoxDescent: 4,
        };
      return bbox(999, 99, 99);
    });

    resolveFont(true);
    await fontPromise;
    for (let i = 0; i < 6; i += 1) await Promise.resolve();

    const finalDoc = harness.getDoc();
    expect(finalDoc.nodes.find((n) => n.id === "name").width).toBe(225);
    expect(finalDoc.nodes.find((n) => n.id === "new-tag").width).toBe(32);
    expect(finalDoc.nodes.find((n) => n.id === "role").width).toBe(120);
    expect(finalDoc.nodes.find((n) => n.id === "role").height).toBe(16);
    expect(finalDoc.nodes.find((n) => n.id === "meta-text").width).toBe(180);
    expect(finalDoc.nodes.find((n) => n.id === "meta-text").height).toBe(16);
  });
});
