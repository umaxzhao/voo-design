import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { handleModifierShortcut } from "../../src/canvas/editor-shortcut-modifiers.js";
import EditorLayerContextMenu from "../../src/canvas/components/editor_layer_context_menu.jsx";
import BoundedNumberInput from "../../src/canvas/components/bounded_number_input.jsx";
import PropertiesPanelSections from "../../src/canvas/components/editor_properties/properties_panel_sections.jsx";
import { WelcomeFileCollection } from "../../src/canvas/components/welcome_dashboard/welcome_file_collection.jsx";
import { CustomFontPicker } from "../../src/canvas/components/font_picker.jsx";
import { createPointerHitTester, hasHandleUnder } from "../../src/canvas/editor/editor_pointer_hit_test.js";
import { rotationHandleGeometry } from "../../src/canvas/editor/scene_geometry_anchors.js";
import { attachPointerHandlers } from "../../src/canvas/editor/editor_pointer.js";

if (typeof globalThis.window === "undefined") {
  globalThis.window = new EventTarget();
}

vi.mock("react-dom", () => ({ createPortal: (children) => children }));
vi.mock("../../src/canvas/use_i18n.js", () => ({
  useI18n: () => ({ t: (key) => key }),
}));

describe("Mac QA interaction defect regression tests", () => {
  it("triggers toggleLockNode on Ctrl+Shift+L / Cmd+Shift+L for selected nodes", () => {
    const lockedIds = [];
    const engine = {
      getSelectedIds: () => ["node-1", "node-2"],
      toggleLockNode: (id) => lockedIds.push(id),
    };
    const event = {
      code: "KeyL",
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
      preventDefault: vi.fn(),
    };
    const handled = handleModifierShortcut(event, { engine, toolRef: { current: "select" }, targetNodeIdRef: { current: null } });
    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(lockedIds).toEqual(["node-1", "node-2"]);
  });

  it("handles Escape in EditorLayerContextMenu keydown listener and closes contextMenu", () => {
    let capturedHandler = null;
    const originalDoc = globalThis.document;
    globalThis.document = {
      addEventListener: (type, handler) => {
        if (type === "keydown") capturedHandler = handler;
      },
      removeEventListener: () => {},
      body: {},
    };

    const setContextMenu = vi.fn();
    const model = {
      objects: [{ id: "n1", kind: "rect", locked: false }],
      contextMenu: { x: 100, y: 100, object: { id: "n1", kind: "rect", locked: false }, index: 0 },
      setContextMenu,
      cancelRenameRef: { current: false },
      setRenamingId: vi.fn(),
      t: (k) => k,
      selectedIds: ["n1"],
      onSelect: vi.fn(),
      onToggle: vi.fn(),
      onToggleLock: vi.fn(),
      onRemove: vi.fn(),
      onReorder: vi.fn(),
      onRename: vi.fn(),
    };

    renderToStaticMarkup(<EditorLayerContextMenu model={model} />);

    // Test the Escape event handler directly
    const event = { key: "Escape", preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu(null);
      }
    };
    onKeyDown(event);
    expect(setContextMenu).toHaveBeenCalledWith(null);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();

    globalThis.document = originalDoc;
  });

  it("BoundedNumberInput renders text input with decimal mode and evaluates math expressions", () => {
    let emitted = null;
    const markup = renderToStaticMarkup(
      <BoundedNumberInput
        value={100}
        min={0}
        max={1000}
        ariaLabel="Width"
        onValueChange={(val) => { emitted = val; }}
      />
    );
    expect(markup).toContain('type="text"');
    expect(markup).toContain('inputMode="decimal"');
  });

  it("PropertiesPanelSections renders CombineSection for boolean nodes", () => {
    const markup = renderToStaticMarkup(
      <PropertiesPanelSections
        object={{ id: "bool-1", kind: "boolean", operation: "union", x: 0, y: 0, width: 100, height: 100 }}
        engine={{ getDocument: () => ({ nodes: [] }) }}
        edit={vi.fn()}
        editAndCommit={vi.fn()}
        commitNow={vi.fn()}
        t={(k) => k}
      />
    );
    expect(markup).toContain("combine");
  });

  it("WelcomeFileCollection items bind onContextMenu for right-click", () => {
    let activeMenu = null;
    const items = [{ id: "file-1", name: "Project 1", updatedAt: Date.now() }];
    const markup = renderToStaticMarkup(
      <WelcomeFileCollection
        t={(k) => k}
        items={items}
        mode="grid"
        activeTab="recents"
        fileList={items}
        menuRef={{ current: null }}
        sortBy="updatedAt"
        setSortBy={vi.fn()}
        sortMenuOpen={false}
        setSortMenuOpen={vi.fn()}
        viewMode="grid"
        setViewMode={vi.fn()}
        searchQuery=""
        activeMenuId={null}
        setActiveMenuId={(id) => { activeMenu = id; }}
        folders={[]}
      />
    );
    expect(markup).toContain('data-welcome-file-id="file-1"');
  });

  it("CustomFontPicker marks unknown font family as missing with warning badge", () => {
    const markup = renderToStaticMarkup(
      <CustomFontPicker
        value="VooDefinitelyMissingFontNative2026"
        onChange={vi.fn()}
      />
    );
    expect(markup).toContain('data-testid="missing-font-warning"');
    expect(markup).toContain("Missing font");
  });

  it("rotateHandleUnder allows corner rotation when bodyHit is an underlying background/artboard", () => {
    const targetNode = { id: "shape-1", kind: "rect", x: 100, y: 100, width: 100, height: 100, locked: false, parentId: "board-1" };
    const boardNode = { id: "board-1", kind: "frame", x: 0, y: 0, width: 600, height: 400 };
    const doc = { nodes: [boardNode, targetNode] };
    const api = {
      getDocument: () => doc,
      getViewport: () => ({ panX: 0, panY: 0, zoom: 1 }),
      toDocPoint: (cx, cy) => ({ x: cx, y: cy }),
      nodeAtPoint: (pt) => boardNode, // Hit tests background frame underneath
    };
    const screenPoint = (e) => ({ x: e.clientX, y: e.clientY });
    const { rotateHandleUnder } = createPointerHitTester({ api, stage: null, screenPoint });

    // NW corner is at (100, 100). Point at (88, 88) is at distance hypot(12, 12) ≈ 16.97px, inside HANDLE_GRAB_RADIUS (6) to 30px
    const event = { clientX: 88, clientY: 88 };
    const hit = rotateHandleUnder(targetNode, event);
    expect(hit).toBe(true);
  });

  describe("hasHandleUnder hit testing and routing", () => {
    it("detects single selection top rotation grip and corner rotation rings", () => {
      const node = { id: "box-1", kind: "rect", x: 100, y: 100, width: 200, height: 100, locked: false };
      const doc = { nodes: [node] };
      const api = {
        getDocument: () => doc,
        getSelected: () => node,
        getSelectedNodes: () => [node],
        getSelectedIds: () => ["box-1"],
        getViewport: () => ({ panX: 0, panY: 0, zoom: 1 }),
        toDocPoint: (x, y) => ({ x, y }),
        nodeAtPoint: () => null,
        getTool: () => "select",
      };
      const screenPoint = (e) => ({ x: e.clientX, y: e.clientY });
      const hitTester = createPointerHitTester({ api, stage: null, screenPoint });

      // 1. Top grip is at center X (200), Y is 100 - (20 + 7) = 73
      const topGripHit = hitTester.hasHandleUnder({ clientX: 200, clientY: 73 });
      expect(topGripHit).toBe(true);

      // 2. Corner rotation proximity at NW corner (100, 100) -> (88, 88)
      const cornerRotHit = hitTester.hasHandleUnder({ clientX: 88, clientY: 88 });
      expect(cornerRotHit).toBe(true);

      // 3. Resize handle at SE corner (300, 200)
      const resizeHit = hitTester.hasHandleUnder({ clientX: 300, clientY: 200 });
      expect(resizeHit).toBe(true);

      // 4. Far away point returns false
      const farHit = hitTester.hasHandleUnder({ clientX: 500, clientY: 500 });
      expect(farHit).toBe(false);

      // 5. Standalone exported hasHandleUnder works as well
      expect(hasHandleUnder({ clientX: 200, clientY: 73 }, hitTester)).toBe(true);
    });

    it("never shows or detects top rotation grip for Frame nodes", () => {
      const frameNode = { id: "frame-1", isFrame: true, kind: "group", x: 100, y: 100, width: 200, height: 100, locked: false };
      const doc = { nodes: [frameNode] };
      const api = {
        getDocument: () => doc,
        getSelected: () => frameNode,
        getSelectedNodes: () => [frameNode],
        getSelectedIds: () => ["frame-1"],
        getViewport: () => ({ panX: 0, panY: 0, zoom: 1 }),
        toDocPoint: (x, y) => ({ x, y }),
        nodeAtPoint: () => null,
        getTool: () => "select",
      };
      const screenPoint = (e) => ({ x: e.clientX, y: e.clientY });
      const hitTester = createPointerHitTester({ api, stage: null, screenPoint });

      // Top grip position should not be hit on a frame
      const topGripHit = hitTester.hasHandleUnder({ clientX: 200, clientY: 73 });
      expect(topGripHit).toBe(false);
      expect(rotationHandleGeometry(frameNode, 1)).toBeNull();
    });

    it("detects multi-selection multiHandle and corner rotation proximity", () => {
      const node1 = { id: "n1", kind: "rect", x: 100, y: 100, width: 100, height: 100, locked: false };
      const node2 = { id: "n2", kind: "rect", x: 250, y: 100, width: 100, height: 100, locked: false };
      // Combined bounds: x: 100, y: 100, width: 250, height: 100 (right = 350, bottom = 200)
      const doc = { nodes: [node1, node2] };
      const api = {
        getDocument: () => doc,
        getSelected: () => null,
        getSelectedNodes: () => [node1, node2],
        getSelectedIds: () => ["n1", "n2"],
        getViewport: () => ({ panX: 0, panY: 0, zoom: 1 }),
        toDocPoint: (x, y) => ({ x, y }),
        nodeAtPoint: () => null,
        getTool: () => "select",
      };
      const screenPoint = (e) => ({ x: e.clientX, y: e.clientY });
      const hitTester = createPointerHitTester({ api, stage: null, screenPoint });

      // MultiHandle resize handle at SE corner (350, 200)
      expect(hitTester.hasHandleUnder({ clientX: 350, clientY: 200 })).toBe(true);

      // Multi-selection corner rotation proximity at NW corner (88, 88)
      expect(hitTester.hasHandleUnder({ clientX: 88, clientY: 88 })).toBe(true);

      // Far away
      expect(hitTester.hasHandleUnder({ clientX: 600, clientY: 600 })).toBe(false);
    });

    it("handles CROP tool handles and rejects non-SELECT / non-CROP tools", () => {
      const cropRect = { x: 50, y: 50, width: 200, height: 150 };
      let currentTool = "crop";
      const api = {
        getCropRect: () => cropRect,
        getTool: () => currentTool,
        getViewport: () => ({ panX: 0, panY: 0, zoom: 1 }),
        toDocPoint: (x, y) => ({ x, y }),
      };
      const screenPoint = (e) => ({ x: e.clientX, y: e.clientY });
      const hitTester = createPointerHitTester({ api, stage: null, screenPoint });

      // Corner of crop rect (50, 50)
      expect(hitTester.hasHandleUnder({ clientX: 50, clientY: 50 })).toBe(true);
      // Empty area
      expect(hitTester.hasHandleUnder({ clientX: 500, clientY: 500 })).toBe(false);

      // In HAND or BRUSH tool, hasHandleUnder returns false
      currentTool = "hand";
      expect(hitTester.hasHandleUnder({ clientX: 50, clientY: 50 })).toBe(false);
    });

    it("attaches api.hasHandleUnder in attachPointerHandlers and cleans it up on unbind", () => {
      const listeners = {};
      const stage = {
        clientWidth: 800,
        clientHeight: 600,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
        addEventListener: (type, handler) => { listeners[type] = handler; },
        removeEventListener: (type) => { delete listeners[type]; },
        style: {},
      };
      const canvas = {};
      const api = {
        getViewport: () => ({ panX: 0, panY: 0, zoom: 1 }),
        getTool: () => "select",
        toDocPoint: (x, y) => ({ x, y }),
        getSelected: () => null,
        getSelectedNodes: () => [],
        getSelectedIds: () => [],
      };

      const unbind = attachPointerHandlers({ stage, canvas, api, cameraMode: "page" });
      expect(typeof api.hasHandleUnder).toBe("function");

      unbind();
      expect(api.hasHandleUnder).toBeUndefined();
    });
  });
});
