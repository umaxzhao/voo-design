import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import EditorExportDialog, {
  FORMATS,
  designExportDimensions,
  serializeVooToFig,
} from "../../src/canvas/components/editor_export_dialog.jsx";
import { exportEditorImage } from "../../src/canvas/components/editor_hooks/export_editor_image.js";
import { handleModifierShortcut } from "../../src/canvas/editor-shortcut-modifiers.js";
import { handleViewShortcut } from "../../src/canvas/editor-shortcut-view.js";
import { handleDrawingShortcut } from "../../src/canvas/editor-shortcut-drawing.js";
import { useEditorShortcuts } from "../../src/canvas/use_editor_shortcuts.js";
import {
  DESIGN_SHORTCUT_GROUPS,
} from "../../src/shared/editor-shortcut-catalog.js";
import { mediaExportFormat, mediaExportFilename } from "../../src/shared/media-export.js";
import { exportFilename } from "../../src/canvas/editor/export_filename.js";
import { parseFigFile } from "../../src/canvas/figma/fig-file.js";
import { NODE_KIND } from "../../src/canvas/editor/scene_doc_factory.js";
import { TOOL } from "../../src/canvas/editor/editor_constants.js";

vi.mock("react-dom", () => ({ createPortal: (children) => children }));
vi.mock("../../src/canvas/components/editor_hooks/use_export_dialog_keyboard.js", () => ({
  useExportDialogKeyboard: () => {},
}));
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));
vi.mock("../../src/canvas/platform_capabilities.js", () => ({
  CAPABILITY: {},
  isCapabilitySupported: () => false,
}));
vi.mock("../../src/canvas/media_export.js", () => ({
  saveMediaExport: vi.fn(async (params) => ({ path: params.name, receipt: params })),
}));

const hooks = vi.hoisted(() => ({ effects: [] }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRef: (current) => ({ current }),
    useEffect: (effect) => hooks.effects.push(effect),
  };
});

afterEach(() => {
  hooks.effects = [];
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function createKeyEvent({
  code,
  key = code,
  ctrlKey = false,
  metaKey = false,
  altKey = false,
  shiftKey = false,
}) {
  return {
    code,
    key,
    ctrlKey,
    metaKey,
    altKey,
    shiftKey,
    isComposing: false,
    preventDefault: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
}

describe("Figma (.fig) export integration", () => {
  it("includes Figma (.fig) in FORMATS with expected properties", () => {
    const figFormat = FORMATS.find(
      (f) => f.extension === "fig" || f.id === "fig" || f[0] === "fig",
    );
    expect(figFormat).toBeDefined();
    expect(figFormat.label).toBe("editor.exportFigma");
    expect(figFormat.extension).toBe("fig");
    expect(figFormat.mimeType).toBe("application/octet-stream");
    expect(figFormat.description).toBe("Export as Figma .fig file");

    // Supports [id, label] array destructuring for UI rendering
    const [id, label] = figFormat;
    expect(id).toBe("fig");
    expect(label).toBe("editor.exportFigma");
  });

  it("renders Figma (.fig) option in EditorExportDialog", () => {
    vi.stubGlobal("document", { body: {} });
    const html = renderToStaticMarkup(
      <EditorExportDialog
        format="fig"
        quality={1}
        scale={1}
        documentWidth={800}
        documentHeight={600}
        onFormat={() => {}}
        onQuality={() => {}}
        onScale={() => {}}
        onExport={() => {}}
        onClose={() => {}}
      />,
    );
    expect(html).toContain("editor.exportFigma");
  });

  it("handles dimensions and filename for .fig format correctly", () => {
    const dims = designExportDimensions({
      width: 1200,
      height: 800,
      format: "fig",
      scale: 3,
    });
    // Vector/document format keeps document dimensions regardless of scale
    expect(dims).toEqual({ width: 1200, height: 800 });

    expect(mediaExportFormat("fig")).toEqual({
      extension: "fig",
      mime: "application/octet-stream",
    });
    expect(mediaExportFilename("Portfolio", "fig")).toBe("Portfolio.fig");
    expect(exportFilename("Landing Page", "fig", 2)).toBe("Landing Page.fig");
  });

  it("serializes VOO document to valid .fig archive via serializeVooToFig", async () => {
    const sceneDoc = {
      width: 500,
      height: 400,
      backgroundColor: "#1e1e1e",
      nodes: [
        {
          id: "rect-1",
          kind: NODE_KIND.RECT,
          name: "Hero Card",
          x: 20,
          y: 20,
          width: 200,
          height: 100,
          fill: "#ff5500",
          visible: true,
        },
      ],
    };

    const figBytes = await serializeVooToFig(sceneDoc, { name: "Test Page" });
    expect(figBytes).toBeInstanceOf(Uint8Array);
    expect(figBytes.byteLength).toBeGreaterThan(0);

    const parsed = await parseFigFile(figBytes);
    expect(parsed.version).toBe(106);
    expect(parsed.message.type).toBe("NODE_CHANGES");
    const canvasNode = parsed.message.nodeChanges.find((n) => n.type === "CANVAS");
    expect(canvasNode).toBeDefined();
    expect(canvasNode.name).toBe("Test Page");
    expect(parsed.message.nodeChanges.some((n) => n.name === "Hero Card")).toBe(true);
  });

  it("exports .fig through exportEditorImage using voo-to-fig serializer", async () => {
    const { saveMediaExport } = await import("../../src/canvas/media_export.js");
    const sceneDoc = {
      width: 600,
      height: 400,
      backgroundColor: "#ffffff",
      nodes: [
        {
          id: "box-1",
          kind: NODE_KIND.RECT,
          name: "Button",
          x: 10,
          y: 10,
          width: 120,
          height: 40,
          fill: "#0066ff",
          visible: true,
        },
      ],
    };
    const mockEngine = {
      getDocument: () => sceneDoc,
      flushMasks: vi.fn(),
    };

    await exportEditorImage({
      engine: mockEngine,
      format: "fig",
      quality: 1,
      scale: 1,
      name: "Dashboard",
      title: "Export",
    });

    expect(saveMediaExport).toHaveBeenCalledOnce();
    const saveCall = saveMediaExport.mock.calls[0][0];
    expect(saveCall.format).toBe("fig");
    expect(saveCall.name).toBe("Dashboard.fig");
    expect(saveCall.dataUrl).toMatch(/^data:application\/octet-stream;base64,/);
  });
});

describe("Ctrl+] and Ctrl+[ layer ordering shortcuts", () => {
  it.each([
    ["Control", { ctrlKey: true }],
    ["Meta", { metaKey: true }],
  ])("reliably brings layer to front on %s+]", (name, modifiers) => {
    const engine = {
      bringToFront: vi.fn(),
      sendToBack: vi.fn(),
    };
    const toolRef = { current: TOOL.SELECT };
    const event = createKeyEvent({
      code: "BracketRight",
      ...modifiers,
    });

    const handled = handleModifierShortcut(event, {
      engine,
      toolRef,
    });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(engine.bringToFront).toHaveBeenCalledOnce();
    expect(engine.sendToBack).not.toHaveBeenCalled();
  });

  it("brings layer to front even when brush tool is active without adjusting brush", () => {
    const engine = {
      bringToFront: vi.fn(),
      setBrushWidth: vi.fn(),
      getBrushWidth: () => 10,
    };
    const toolRef = { current: TOOL.BRUSH };
    const event = createKeyEvent({
      code: "BracketRight",
      ctrlKey: true,
    });

    const handled = handleModifierShortcut(event, {
      engine,
      toolRef,
    });

    expect(handled).toBe(true);
    expect(engine.bringToFront).toHaveBeenCalledOnce();
    expect(engine.setBrushWidth).not.toHaveBeenCalled();
  });

  it("brings layer to front even when mask edit mode is active", () => {
    const engine = {
      bringToFront: vi.fn(),
      getMaskEdit: () => ({ size: 20 }),
      setMaskBrushSize: vi.fn(),
    };
    const toolRef = { current: TOOL.SELECT };
    const event = createKeyEvent({
      code: "BracketRight",
      metaKey: true,
    });

    const handled = handleModifierShortcut(event, {
      engine,
      toolRef,
    });

    expect(handled).toBe(true);
    expect(engine.bringToFront).toHaveBeenCalledOnce();
    expect(engine.setMaskBrushSize).not.toHaveBeenCalled();
  });

  it("sends layer to back on Ctrl+[", () => {
    const engine = {
      bringToFront: vi.fn(),
      sendToBack: vi.fn(),
    };
    const toolRef = { current: TOOL.BRUSH };
    const event = createKeyEvent({
      code: "BracketLeft",
      ctrlKey: true,
    });

    const handled = handleModifierShortcut(event, {
      engine,
      toolRef,
    });

    expect(handled).toBe(true);
    expect(engine.sendToBack).toHaveBeenCalledOnce();
    expect(engine.bringToFront).not.toHaveBeenCalled();
  });
});

describe("Agent shortcut conflict resolution", () => {
  it("provides clean conflict-free shortcut definition for Agent panel in catalog", () => {
    const viewGroup = DESIGN_SHORTCUT_GROUPS.find((g) => g.id === "view");
    expect(viewGroup).toBeDefined();

    const agentShortcut = viewGroup.shortcuts.find(
      (s) => s.labelKey === "agent.panel.open" || s.labelKey === "agent.panel.title",
    );
    expect(agentShortcut).toBeDefined();
    expect(agentShortcut.key).toBe("⌥⌘A");
  });

  it("preserves Ctrl+J for duplicating layer / layer from selection", () => {
    const engine = {
      getPixelSelection: () => null,
      duplicateSelected: vi.fn(),
    };
    const event = createKeyEvent({
      code: "KeyJ",
      ctrlKey: true,
    });

    const handled = handleModifierShortcut(event, {
      engine,
      targetNodeIdRef: { current: null },
    });

    expect(handled).toBe(true);
    expect(engine.duplicateSelected).toHaveBeenCalledOnce();
  });

  it("preserves Ctrl+\\ for fill foreground", () => {
    const engine = {
      getColor: () => "#112233",
      fillSelection: vi.fn(),
    };
    const event = createKeyEvent({
      code: "Backslash",
      key: "\\",
      ctrlKey: true,
    });

    const handled = handleDrawingShortcut(event, { engine });

    expect(handled).toBe(true);
    expect(engine.fillSelection).toHaveBeenCalledWith("#112233");
  });

  it("routes ⌥⌘A to toggle Agent panel without conflict", () => {
    const onToggleAgent = vi.fn();
    const event = createKeyEvent({
      code: "KeyA",
      metaKey: true,
      altKey: true,
    });

    const handled = handleViewShortcut(event, { onToggleAgent });

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(onToggleAgent).toHaveBeenCalledOnce();
  });

  it("routes ⌥⌘J to toggle Agent panel", () => {
    const onToggleAgent = vi.fn();
    const engine = { duplicateSelected: vi.fn() };
    const event = createKeyEvent({
      code: "KeyJ",
      metaKey: true,
      altKey: true,
    });

    const handled = handleModifierShortcut(event, {
      engine,
      onToggleAgent,
    });

    expect(handled).toBe(true);
    expect(onToggleAgent).toHaveBeenCalledOnce();
    expect(engine.duplicateSelected).not.toHaveBeenCalled();
  });

  it("routes Alt+A / Alt+D / Alt+W / Alt+S to layoutSelection for Figma alignment parity", () => {
    const layoutSelection = vi.fn();
    const engine = {
      layoutSelection,
      getSelectedNodes: () => [{ id: "node-1" }, { id: "node-2" }],
      getSelected: () => ({ id: "node-1" }),
    };
    const event = createKeyEvent({
      code: "KeyA",
      altKey: true,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    });

    const handled = handleModifierShortcut(event, { engine });
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(layoutSelection).toHaveBeenCalledWith(expect.any(Function), "left");
  });
});
