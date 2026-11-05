import { describe, it, expect, vi, beforeEach } from "vitest";
import { reorderNodeTo } from "../../src/canvas/editor/doc_ops_groups.js";
import { createNodeStackActions } from "../../src/canvas/editor/node-stack-actions.js";
import useEditorLayerInteractions from "../../src/canvas/components/use_editor_layer_interactions.js";

let refStore = [], refIndex = 0, stateStore = [], stateIndex = 0;
let capturedOnDrop = null;

vi.mock("../../src/canvas/components/use_layer_drag.js", () => ({
  default: (opts) => {
    capturedOnDrop = opts.onDrop;
    return { dragId: null, slot: null, overId: null, beginRowDrag: vi.fn() };
  },
}));

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

const shape = (id, patch = {}) => ({
  id,
  name: `Layer_${id}`,
  kind: "rect",
  x: 10,
  y: 10,
  width: 100,
  height: 100,
  parentId: null,
  ...patch,
});

const document = (nodes) => ({ width: 800, height: 600, nodes });
const order = (doc) => doc.nodes.map((n) => n.id);

describe("Layer multi-selection reorder (same parent / root / siblings)", () => {
  beforeEach(() => {
    refStore = [];
    refIndex = 0;
    stateStore = [];
    stateIndex = 0;
  });
  it("reorders contiguous roots upwards as an atomic batch past target node", () => {
    const doc = document([shape("s0"), shape("s1"), shape("s2"), shape("s3")]);
    const next = reorderNodeTo(doc, ["s0", "s1"], 3, "s0");

    expect(order(next)).toEqual(["s2", "s3", "s0", "s1"]);
    expect(next.nodes.find((n) => n.id === "s0").width).toBe(100);
    expect(next.nodes.find((n) => n.id === "s1").height).toBe(100);
  });

  it("reorders contiguous roots downwards as an atomic batch before target node", () => {
    const doc = document([shape("s0"), shape("s1"), shape("s2"), shape("s3")]);
    const next = reorderNodeTo(doc, ["s2", "s3"], 0, "s2");

    expect(order(next)).toEqual(["s2", "s3", "s0", "s1"]);
  });

  it("reorders non-contiguous roots as a consolidated batch preserving document order", () => {
    const doc = document([shape("s0"), shape("s1"), shape("s2"), shape("s3")]);
    const next = reorderNodeTo(doc, ["s0", "s2"], 3, "s0");

    expect(order(next)).toEqual(["s1", "s3", "s0", "s2"]);
  });

  it("reorders siblings within the same frame without leaking into parent or other roots", () => {
    const doc = document([
      shape("bg"),
      shape("frame1", { kind: "group", isFrame: true }),
      shape("c0", { parentId: "frame1" }),
      shape("c1", { parentId: "frame1" }),
      shape("c2", { parentId: "frame1" }),
      shape("c3", { parentId: "frame1" }),
      shape("fg"),
    ]);

    // Move c0 and c1 up past c3 (target doc index = 5)
    const next = reorderNodeTo(doc, ["c0", "c1"], 5, "c0");
    expect(order(next)).toEqual(["bg", "frame1", "c2", "c3", "c0", "c1", "fg"]);
    expect(next.nodes.find((n) => n.id === "c0").parentId).toBe("frame1");
    expect(next.nodes.find((n) => n.id === "c1").parentId).toBe("frame1");
  });

  it("carries group descendants and clipping mask followers as unified stack blocks", () => {
    const doc = document([
      shape("base"),
      shape("clip", { clipTo: "base" }),
      shape("other1"),
      shape("other2"),
    ]);

    // Move base (and its clip) past other2
    const next = reorderNodeTo(doc, ["base"], 3, "base");
    expect(order(next)).toEqual(["other1", "other2", "base", "clip"]);
    expect(next.nodes.find((n) => n.id === "clip").clipTo).toBe("base");
  });

  it("allows reordering outside the locked range without displacement by out-of-range locked layers", () => {
    const doc = document([
      shape("a"),
      shape("b"),
      shape("c"),
      shape("locked", { locked: true }),
      shape("d"),
    ]);

    // Single layer c dragged before a: expected [c, a, b, locked, d]
    const nextSingle = reorderNodeTo(doc, ["c"], 0, "c");
    expect(order(nextSingle)).toEqual(["c", "a", "b", "locked", "d"]);

    // Multi selection b + c dragged before a: expected [b, c, a, locked, d]
    const nextBatch = reorderNodeTo(doc, ["b", "c"], 0, "b");
    expect(order(nextBatch)).toEqual(["b", "c", "a", "locked", "d"]);

    // Attempting to move d across locked layer to before a is refused
    expect(reorderNodeTo(doc, ["d"], 0, "d")).toBe(doc);

    // Attempting to move c across locked layer to after d is refused
    expect(reorderNodeTo(doc, ["c"], 4, "c")).toBe(doc);
  });

  it("refuses batch reorder when any secondary selected node would cross a locked barrier", () => {
    const doc = document([
      shape("a"),
      shape("b"),
      shape("locked", { locked: true }),
      shape("c"),
      shape("d"),
    ]);

    // Dragging b + d before a: b's path does not cross locked, but secondary d would cross locked
    expect(reorderNodeTo(doc, ["b", "d"], 0, "b")).toBe(doc);

    // Dragging a + c after d: c's path does not cross locked, but secondary a would cross locked
    expect(reorderNodeTo(doc, ["a", "c"], 4, "c")).toBe(doc);
  });

  it("refuses to move locked roots or cross intermediate locked layers", () => {
    const docWithLockedTarget = document([
      shape("a"),
      shape("locked", { locked: true }),
      shape("b"),
    ]);
    expect(reorderNodeTo(docWithLockedTarget, ["a"], 2, "a")).toBe(docWithLockedTarget);

    const docWithMovingLocked = document([
      shape("locked", { locked: true }),
      shape("b"),
      shape("c"),
    ]);
    expect(reorderNodeTo(docWithMovingLocked, ["locked", "b"], 2, "locked")).toBe(docWithMovingLocked);
  });

  it("engine.reorderNodeTo commits once for batch moves allowing single-step Undo/Redo", () => {
    let currentDoc = document([shape("s0"), shape("s1"), shape("s2"), shape("s3")]);
    const history = [currentDoc];
    let historyIndex = 0;

    const setDoc = vi.fn((next) => {
      currentDoc = next;
      history.push(next);
      historyIndex++;
    });

    const stackActions = createNodeStackActions({
      getDoc: () => currentDoc,
      setDoc,
      recordHistory: vi.fn(),
      trackCommit: vi.fn(),
      selection: { getIds: () => ["s0", "s1"] },
      createBitmapData: vi.fn(),
    });

    stackActions.reorderNodeTo(["s0", "s1"], 3, "s0");

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(order(currentDoc)).toEqual(["s2", "s3", "s0", "s1"]);

    // Undo (revert to previous snapshot)
    const prevDoc = history[historyIndex - 1];
    expect(order(prevDoc)).toEqual(["s0", "s1", "s2", "s3"]);
  });

  it("useEditorLayerInteractions passes multi-selection ids and target to onReorder on root drop", () => {
    const doc = document([shape("s0"), shape("s1"), shape("s2"), shape("s3")]);
    const onReorder = vi.fn();
    const onReorderGroup = vi.fn();

    const interactions = useEditorLayerInteractions({
      activeCanvasId: "default",
      getSelectionKey: () => "key",
      selectedIds: ["s0", "s1"],
      selectedGroupId: null,
      isBackgroundSelected: false,
      activeIndex: 0,
      objects: doc.nodes,
      focusedTreeKey: null,
      focusedSelectionKey: null,
      visibleTreeItems: [],
      listRef: { current: null },
      activeObject: doc.nodes[0],
      onMutate: vi.fn(),
      onCommit: vi.fn(),
      isolationGroupId: null,
      dragUnits: doc.nodes,
      onMoveIntoGroup: vi.fn(),
      onClipInto: vi.fn(),
      onReorder,
      onMoveNodeToRoot: vi.fn(),
      docIndexOf: new Map(doc.nodes.map((n, i) => [n.id, i])),
      onReorderGroup,
      setRenamingId: vi.fn(),
      cancelRenameRef: { current: false },
      onRename: vi.fn(),
      effectiveActiveCanvasId: "default",
      setCollapsedGroupIdsByCanvas: vi.fn(),
      focusTreeItem: vi.fn(),
      childrenMap: new Map(),
      rows: [],
      onSelectExactly: vi.fn(),
      onToggleSelect: vi.fn(),
      anchorIdRef: { current: null },
      onSelectGroup: vi.fn(),
      onSelect: vi.fn(),
      onFocusCanvas: vi.fn(),
      onSelectCanvasLayer: vi.fn(),
      onSelectBackground: vi.fn(),
      toggleCanvasCollapse: vi.fn(),
      onDeleteSelected: vi.fn(),
      onRemove: vi.fn(),
      setFocusedTreeKey: vi.fn(),
    });

    // Simulate drop on root slot 3
    capturedOnDrop?.("s0", 3, null, "root", ["s0", "s1"]);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["s0", "s1"], 3, "s0");
    expect(onReorderGroup).not.toHaveBeenCalled();
  });

  it("useEditorLayerInteractions passes sibling multi-selection ids to onReorder on sibling drop", () => {
    const doc = document([
      shape("frame1", { kind: "group", isFrame: true }),
      shape("c0", { parentId: "frame1" }),
      shape("c1", { parentId: "frame1" }),
      shape("c2", { parentId: "frame1" }),
      shape("c3", { parentId: "frame1" }),
    ]);
    const onReorder = vi.fn();

    const interactions = useEditorLayerInteractions({
      activeCanvasId: "default",
      getSelectionKey: () => "key",
      selectedIds: ["c0", "c1"],
      selectedGroupId: null,
      isBackgroundSelected: false,
      activeIndex: 1,
      objects: doc.nodes,
      focusedTreeKey: null,
      focusedSelectionKey: null,
      visibleTreeItems: [],
      listRef: { current: null },
      activeObject: doc.nodes[1],
      onMutate: vi.fn(),
      onCommit: vi.fn(),
      isolationGroupId: null,
      dragUnits: [doc.nodes[0]],
      onMoveIntoGroup: vi.fn(),
      onClipInto: vi.fn(),
      onReorder,
      onMoveNodeToRoot: vi.fn(),
      docIndexOf: new Map(doc.nodes.map((n, i) => [n.id, i])),
      onReorderGroup: vi.fn(),
      setRenamingId: vi.fn(),
      cancelRenameRef: { current: false },
      onRename: vi.fn(),
      effectiveActiveCanvasId: "default",
      setCollapsedGroupIdsByCanvas: vi.fn(),
      focusTreeItem: vi.fn(),
      childrenMap: new Map([["frame1", doc.nodes.slice(1)]]),
      rows: [],
      onSelectExactly: vi.fn(),
      onToggleSelect: vi.fn(),
      anchorIdRef: { current: null },
      onSelectGroup: vi.fn(),
      onSelect: vi.fn(),
      onFocusCanvas: vi.fn(),
      onSelectCanvasLayer: vi.fn(),
      onSelectBackground: vi.fn(),
      toggleCanvasCollapse: vi.fn(),
      onDeleteSelected: vi.fn(),
      onRemove: vi.fn(),
      setFocusedTreeKey: vi.fn(),
    });

    // Drop c0 on sibling target index corresponding to c3 (docIndexOf 4)
    capturedOnDrop?.("c0", 2, null, "siblings", ["c0", "c1"]);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["c0", "c1"], 4, "c0");
  });
});
