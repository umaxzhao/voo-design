import { describe, it, expect, vi, beforeEach } from "vitest";
import { moveIntoGroup, moveNodeToRoot } from "../../src/canvas/editor/doc_ops_groups.js";
import { createEngineGroups } from "../../src/canvas/editor/editor_engine_groups.js";
import { createNodeStackActions } from "../../src/canvas/editor/node-stack-actions.js";
import useLayerDrag from "../../src/canvas/components/use_layer_drag.js";
import useEditorLayerInteractions from "../../src/canvas/components/use_editor_layer_interactions.js";

let refStore = [], refIndex = 0, stateStore = [], stateIndex = 0;
const windowListeners = new Map();

vi.mock("react", async (original) => {
  const actual = await original();
  return {
    ...actual,
    useRef: (init) => {
      const idx = refIndex++;
      if (!refStore[idx]) refStore[idx] = { current: init };
      return refStore[idx];
    },
    useState: (init) => {
      const idx = stateIndex++;
      if (!stateStore[idx]) {
        stateStore[idx] = [init, (next) => {
          stateStore[idx][0] = typeof next === "function" ? next(stateStore[idx][0]) : next;
        }];
      }
      return stateStore[idx];
    },
    useCallback: (fn) => fn,
    useEffect: (fn) => { fn(); },
  };
});

const mockRow = (id, top, height = 28, parentId = null) => ({
  getAttribute: (a) => (a === "data-layer-row-id" ? id : a === "data-layer-parent-id" ? parentId : null),
  hasAttribute: (a) => a === "data-layer-row-id",
  getBoundingClientRect: () => ({ top, height, bottom: top + height }),
});

const mockListRef = (rows) => ({
  current: {
    contains: () => false,
    querySelectorAll: () => rows,
    getBoundingClientRect: () => ({ top: 0, bottom: 500 }),
    scrollTop: 0,
  },
});

describe("Linux QA: Multi-selection layer drag reparent into Frame", () => {
  const createMockScene = () => ({
    width: 3000, height: 1000,
    nodes: [
      { id: "source-root", kind: "group", isFrame: true, x: 0, y: 0, width: 1000, height: 800, parentId: null, visible: true },
      { id: "rect-1", kind: "rect", x: 100, y: 100, width: 200, height: 150, parentId: "source-root", visible: true },
      { id: "rect-2", kind: "rect", x: 400, y: 300, width: 250, height: 200, parentId: "source-root", visible: true },
      { id: "target-root", kind: "group", isFrame: true, x: 1500, y: 0, width: 1000, height: 800, parentId: null, visible: true },
    ],
  });

  beforeEach(() => {
    refStore = []; refIndex = 0; stateStore = []; stateIndex = 0;
    windowListeners.clear();
    globalThis.window = {
      addEventListener: vi.fn((type, handler) => windowListeners.set(type, handler)),
      removeEventListener: vi.fn((type, handler) => {
        if (windowListeners.get(type) === handler) windowListeners.delete(type);
      }),
    };
    globalThis.requestAnimationFrame = vi.fn(() => 1);
    globalThis.cancelAnimationFrame = vi.fn();
  });

  it("moves all selected sibling layers into target Frame in a single operation", () => {
    const doc = createMockScene();
    const result = moveIntoGroup(doc, ["rect-1", "rect-2"], "target-root");

    expect(result).not.toBe(doc);
    const moved1 = result.nodes.find((n) => n.id === "rect-1");
    const moved2 = result.nodes.find((n) => n.id === "rect-2");

    expect(moved1.parentId).toBe("target-root");
    expect(moved2.parentId).toBe("target-root");
    expect(moved1.x).toBe(100);
    expect(moved2.x).toBe(400);

    const childrenOfSource = result.nodes.filter((n) => n.parentId === "source-root");
    expect(childrenOfSource).toHaveLength(0);
    const childrenOfTarget = result.nodes.filter((n) => n.parentId === "target-root");
    expect(childrenOfTarget.map((n) => n.id)).toEqual(["rect-1", "rect-2"]);
  });

  it("engine.moveIntoGroup commits once for batch moves allowing single-step Undo/Redo", () => {
    let currentDoc = createMockScene();
    const history = [currentDoc];
    let historyIndex = 0;

    const setDoc = vi.fn((next) => {
      currentDoc = next; history.push(next); historyIndex++;
    });

    const engine = createEngineGroups({
      getDoc: () => currentDoc, setDoc, select: vi.fn(), selectMany: vi.fn(),
      selection: {
        getIds: () => ["rect-1", "rect-2"],
        isSelected: (id) => ["rect-1", "rect-2"].includes(id),
      },
      clickUnitOf: (node) => node.id,
      selectionUnits: () => ["rect-1", "rect-2"],
    });

    const success = engine.moveIntoGroup(["rect-1", "rect-2"], "target-root");
    expect(success).toBe(true);
    expect(setDoc).toHaveBeenCalledTimes(1);

    expect(currentDoc.nodes.find((n) => n.id === "rect-1").parentId).toBe("target-root");
    expect(currentDoc.nodes.find((n) => n.id === "rect-2").parentId).toBe("target-root");

    const prevDoc = history[historyIndex - 1];
    expect(prevDoc.nodes.find((n) => n.id === "rect-1").parentId).toBe("source-root");
    expect(prevDoc.nodes.find((n) => n.id === "rect-2").parentId).toBe("source-root");
  });

  it("prevents circular reparenting when attempting to move a container into its own descendant", () => {
    const doc = createMockScene();
    expect(moveIntoGroup(doc, ["source-root"], "rect-1")).toBe(doc);
    expect(moveIntoGroup(doc, ["target-root"], "target-root")).toBe(doc);
  });

  it("moveNodeToRoot moves all selected sibling layers out of container to root atomically", () => {
    const doc = createMockScene();
    const result = moveNodeToRoot(doc, ["rect-1", "rect-2"], 1);

    expect(result).not.toBe(doc);
    expect(result.nodes.find((n) => n.id === "rect-1").parentId).toBeNull();
    expect(result.nodes.find((n) => n.id === "rect-2").parentId).toBeNull();

    const roots = result.nodes.filter((n) => !n.parentId);
    expect(roots.map((n) => n.id)).toEqual(["source-root", "rect-1", "rect-2", "target-root"]);

    const sourceChildren = result.nodes.filter((n) => n.parentId === "source-root");
    expect(sourceChildren).toHaveLength(0);
  });

  it("moveNodeToRoot rejects moving locked layers or layers inside locked containers", () => {
    const doc = createMockScene();
    const lockedNodeDoc = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === "rect-1" ? { ...n, locked: true } : n)),
    };
    expect(moveNodeToRoot(lockedNodeDoc, ["rect-1", "rect-2"], 0)).toBe(lockedNodeDoc);

    const lockedParentDoc = {
      ...doc,
      nodes: doc.nodes.map((n) => (n.id === "source-root" ? { ...n, locked: true } : n)),
    };
    expect(moveNodeToRoot(lockedParentDoc, ["rect-1", "rect-2"], 0)).toBe(lockedParentDoc);
  });

  it("node-stack-actions.moveNodeToRoot commits once for batch moves allowing single-step Undo/Redo", () => {
    let currentDoc = createMockScene();
    const history = [currentDoc];
    let historyIndex = 0;

    const setDoc = vi.fn((next) => {
      currentDoc = next; history.push(next); historyIndex++;
    });

    const stackActions = createNodeStackActions({
      getDoc: () => currentDoc, setDoc,
      selection: { getIds: () => ["rect-1", "rect-2"] },
      getSelectedGroup: () => null,
      requestRender: vi.fn(), notify: vi.fn(),
    });

    const success = stackActions.moveNodeToRoot(["rect-1", "rect-2"], 1);
    expect(success).toBe(true);
    expect(setDoc).toHaveBeenCalledTimes(1);

    expect(currentDoc.nodes.find((n) => n.id === "rect-1").parentId).toBeNull();
    expect(currentDoc.nodes.find((n) => n.id === "rect-2").parentId).toBeNull();

    const prevDoc = history[historyIndex - 1];
    expect(prevDoc.nodes.find((n) => n.id === "rect-1").parentId).toBe("source-root");
    expect(prevDoc.nodes.find((n) => n.id === "rect-2").parentId).toBe("source-root");
  });

  it("useLayerDrag evaluates container row on fast release with tighter inset and passes session.ids", () => {
    const doc = createMockScene();
    const onDrop = vi.fn();
    const listRef = mockListRef([
      mockRow("target-root", 100, 28, null),
      mockRow("rect-1", 128, 28, "source-root"),
      mockRow("rect-2", 156, 28, "source-root"),
    ]);

    const dragHook = useLayerDrag({
      listRef,
      nodes: doc.nodes.filter((n) => !n.parentId),
      objects: doc.nodes,
      selectedIds: ["rect-1", "rect-2"],
      onDrop,
    });

    const rect1 = doc.nodes.find((n) => n.id === "rect-1");
    dragHook.beginRowDrag(
      { button: 0, clientX: 20, clientY: 140, target: { closest: () => null } },
      { node: rect1, position: 1, isChild: true, range: { min: 0, max: 2 }, parentId: "source-root", siblingNodes: [rect1] },
    );

    const onMove = windowListeners.get("pointermove");
    const onUp = windowListeners.get("pointerup");
    expect(onMove).toBeDefined();
    expect(onUp).toBeDefined();

    // Fast gesture: pointermove activates drag, then drop near edge of container row
    onMove({ clientX: 20, clientY: 104 });
    onUp({ clientY: 104 });

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith("rect-1", null, "target-root", expect.any(String), ["rect-1", "rect-2"]);
  });

  it("useLayerDrag passes session.ids when dragging multi-selection out of container to root", () => {
    const doc = createMockScene();
    const onDrop = vi.fn();
    const listRef = mockListRef([
      mockRow("source-root", 50, 28, null),
      mockRow("rect-1", 78, 28, "source-root"),
      mockRow("target-root", 106, 28, null),
    ]);

    const dragHook = useLayerDrag({
      listRef,
      nodes: doc.nodes.filter((n) => !n.parentId),
      objects: doc.nodes,
      selectedIds: ["rect-1", "rect-2"],
      onDrop,
    });

    const rect1 = doc.nodes.find((n) => n.id === "rect-1");
    dragHook.beginRowDrag(
      { button: 0, clientX: 20, clientY: 85, target: { closest: () => null } },
      { node: rect1, position: 1, isChild: true, range: { min: 0, max: 2 }, parentId: "source-root", siblingNodes: [rect1] },
    );

    const onMove = windowListeners.get("pointermove");
    const onUp = windowListeners.get("pointerup");
    onMove({ clientX: 20, clientY: 200 });
    onUp({ clientY: 200 });

    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(onDrop).toHaveBeenCalledWith("rect-1", expect.any(Number), null, "root", ["rect-1", "rect-2"]);
  });

  it("useEditorLayerInteractions passes multi-selection ids to onMoveNodeToRoot when dropped out of container", () => {
    const doc = createMockScene();
    const onMoveNodeToRoot = vi.fn();
    const onMoveIntoGroup = vi.fn();
    const listRef = mockListRef([
      mockRow("source-root", 50, 28, null),
      mockRow("rect-1", 78, 28, "source-root"),
    ]);

    const interactions = useEditorLayerInteractions({
      activeCanvasId: "default", getSelectionKey: () => "key",
      selectedIds: ["rect-1", "rect-2"], selectedGroupId: null,
      isBackgroundSelected: false, activeIndex: 1, objects: doc.nodes,
      focusedTreeKey: null, focusedSelectionKey: null, visibleTreeItems: [],
      listRef, activeObject: doc.nodes[1], onMutate: vi.fn(), onCommit: vi.fn(),
      isolationGroupId: null, dragUnits: doc.nodes.filter((n) => !n.parentId),
      onMoveIntoGroup, onClipInto: vi.fn(), onReorder: vi.fn(), onMoveNodeToRoot,
      docIndexOf: new Map(doc.nodes.map((n, i) => [n.id, i])),
      onReorderGroup: vi.fn(), setRenamingId: vi.fn(), cancelRenameRef: { current: false },
      onRename: vi.fn(), effectiveActiveCanvasId: "default",
      setCollapsedGroupIdsByCanvas: vi.fn(), focusTreeItem: vi.fn(),
      childrenMap: new Map(), rows: [], onSelectExactly: vi.fn(),
      onToggleSelect: vi.fn(), anchorIdRef: { current: null },
      onSelectGroup: vi.fn(), onSelect: vi.fn(), onFocusCanvas: vi.fn(),
      onSelectCanvasLayer: vi.fn(), onSelectBackground: vi.fn(),
      toggleCanvasCollapse: vi.fn(), onDeleteSelected: vi.fn(), onRemove: vi.fn(),
      setFocusedTreeKey: vi.fn(),
    });

    const rect1 = doc.nodes.find((n) => n.id === "rect-1");
    interactions.beginRowDrag(
      { button: 0, clientX: 20, clientY: 85, target: { closest: () => null } },
      { node: rect1, position: 1, isChild: true, range: { min: 0, max: 2 }, parentId: "source-root", siblingNodes: [rect1] },
    );

    const onMove = windowListeners.get("pointermove");
    const onUp = windowListeners.get("pointerup");
    onMove({ clientX: 20, clientY: 200 });
    onUp({ clientY: 200 });

    expect(onMoveNodeToRoot).toHaveBeenCalledTimes(1);
    expect(onMoveNodeToRoot).toHaveBeenCalledWith(["rect-1", "rect-2"], expect.any(Number));
  });
});
