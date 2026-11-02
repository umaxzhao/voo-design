import { describe, it, expect, beforeEach } from "vitest";
import { createViewport } from "../../src/canvas/editor/editor_viewport.js";
import {
  clampZoom,
  ZOOM_MIN,
  ZOOM_MAX,
  fitScale,
  wheelZoomFactor,
  wheelPanDelta,
} from "../../src/canvas/editor/editor_constants.js";
import {
  OPPOSITE_HANDLE,
  ALL_HANDLES,
  edgesOfHandle,
  rotateVector,
  unrotateVector,
  calculateHandlePoints,
  resizeBoxLocal,
  resizeBoxWithTransform,
  normalizeAngle180,
  normalizeAngle360,
  calculateRotationAngle,
  oppositeHandlePoint,
  findHandleAtPoint,
} from "../../src/canvas/editor/box_transform_math.js";
import {
  constrainAngle45,
  cubicPoint,
  bendHandlesThrough,
  projectOntoPath,
  splitSegment,
} from "../../src/canvas/editor/editor_pen_math.js";
import { useDesignStore } from "../../src/store/design_store.js";
import { createHistory, MAX_HISTORY } from "../../src/canvas/editor/editor_history.js";

describe("Adversarial Stress Test: Viewport Math & Numerical Clamping", () => {
  it("clampZoom clamps extreme values safely: 0, negative, 1e-10, 1e10, Infinity", () => {
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(-1)).toBe(ZOOM_MIN);
    expect(clampZoom(-9999)).toBe(ZOOM_MIN);
    expect(clampZoom(1e-10)).toBe(ZOOM_MIN);
    expect(clampZoom(1e-25)).toBe(ZOOM_MIN);
    expect(clampZoom(1e10)).toBe(ZOOM_MAX);
    expect(clampZoom(Infinity)).toBe(ZOOM_MAX);
    expect(clampZoom(-Infinity)).toBe(ZOOM_MIN);
  });

  it("identifies vulnerability: clampZoom(NaN) returns NaN without safe fallback", () => {
    // Adversarial finding: Math.min/Math.max with NaN propagates NaN
    const nanResult = clampZoom(NaN);
    expect(Number.isNaN(nanResult)).toBe(true);
  });

  it("viewport zoomAt under extreme factors preserves stability or exposes NaN taint", () => {
    const mockStage = {
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    };
    const vp = createViewport({
      stage: mockStage,
      getDoc: () => ({ width: 800, height: 600 }),
      notify: () => {},
      requestRender: () => {},
    });

    const pt = { x: 400, y: 300 };

    // Zoom factor 0: should clamp to ZOOM_MIN (0.05)
    vp.zoomAt(0, pt);
    expect(vp.getZoom()).toBe(ZOOM_MIN);
    expect(Number.isFinite(vp.getViewport().panX)).toBe(true);
    expect(Number.isFinite(vp.getViewport().panY)).toBe(true);

    // Zoom factor negative: should clamp to ZOOM_MIN
    vp.zoomAt(-5, pt);
    expect(vp.getZoom()).toBe(ZOOM_MIN);

    // Zoom factor 1e10: should clamp to ZOOM_MAX (8.0)
    vp.zoomAt(1e10, pt);
    expect(vp.getZoom()).toBe(ZOOM_MAX);

    // Zoom factor Infinity: should clamp to ZOOM_MAX
    vp.zoomAt(Infinity, pt);
    expect(vp.getZoom()).toBe(ZOOM_MAX);

    // Zoom factor 1e-10: should clamp to ZOOM_MIN
    vp.zoomAt(1e-10, pt);
    expect(vp.getZoom()).toBe(ZOOM_MIN);

    // Zoom factor NaN: exposes behavior
    vp.zoomAt(NaN, pt);
    const tainted = vp.getZoom();
    // Documenting whether NaN taints viewport state
    expect(Number.isNaN(tainted)).toBe(true);
  });

  it("handles stage with 0 dimensions and empty document gracefully in zoomToFit", () => {
    const zeroStage = {
      clientWidth: 0,
      clientHeight: 0,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    };
    let renderCalled = false;
    const vp = createViewport({
      stage: zeroStage,
      getDoc: () => null,
      notify: () => {},
      requestRender: () => {
        renderCalled = true;
      },
    });

    // zoomToFit on 0-sized stage or null doc must be safe no-op
    expect(() => vp.zoomToFit()).not.toThrow();
    expect(vp.getZoom()).toBe(1);
    expect(renderCalled).toBe(false);

    // fitScale with 0 inputs
    expect(fitScale(0, 0, 100, 100)).toBe(1);
    expect(fitScale(100, 100, 0, 0)).toBe(1);
  });

  it("wheelZoomFactor and wheelPanDelta boundary testing", () => {
    expect(Number.isFinite(wheelZoomFactor(0))).toBe(true);
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(100000)).toBeGreaterThan(0);
    expect(wheelZoomFactor(-100000)).toBeLessThan(Infinity);

    const delta = wheelPanDelta({ deltaX: 0, deltaY: 0, shiftKey: false });
    expect(delta).toEqual({ dx: 0, dy: 0 });

    const shiftDelta = wheelPanDelta({ deltaX: 0, deltaY: -50, shiftKey: true });
    expect(shiftDelta).toEqual({ dx: 50, dy: 0 });
  });
});

describe("Adversarial Stress Test: Box Transform Mathematics", () => {
  it("handles 0-width and 0-height boxes safely without throwing or NaN", () => {
    const zeroBox = { x: 100, y: 100, width: 0, height: 0 };

    // 1. calculateHandlePoints on zero-box
    const handles = calculateHandlePoints(zeroBox);
    expect(handles.length).toBe(8);
    for (const h of handles) {
      expect(h.x).toBe(100);
      expect(h.y).toBe(100);
    }

    // 2. oppositeHandlePoint
    const opp = oppositeHandlePoint(zeroBox, "nw");
    expect(opp).toBeDefined();
    expect(opp.handle).toBe("se");
    expect(opp.x).toBe(100);
    expect(opp.y).toBe(100);

    // 3. findHandleAtPoint
    const found = findHandleAtPoint(zeroBox, { x: 100, y: 100 }, 5);
    expect(found).toBeDefined();

    // 4. resizeBoxLocal from 0-width box
    const resized = resizeBoxLocal(zeroBox, "se", { x: 50, y: 50 }, {
      minWidth: 1,
      minHeight: 1,
      keepRatio: true, // Should gracefully bypass ratio division when width=0
    });
    expect(resized.width).toBe(50);
    expect(resized.height).toBe(50);
    expect(Number.isFinite(resized.x)).toBe(true);
    expect(Number.isFinite(resized.y)).toBe(true);

    // 5. resizeBoxWithTransform from 0-width box with rotation
    const transformedResized = resizeBoxWithTransform({
      rect: zeroBox,
      handle: "se",
      delta: { x: 50, y: 50 },
      rotation: 45,
      minWidth: 1,
      minHeight: 1,
    });
    expect(Number.isFinite(transformedResized.x)).toBe(true);
    expect(Number.isFinite(transformedResized.y)).toBe(true);
    expect(transformedResized.width).toBeGreaterThanOrEqual(1);
    expect(transformedResized.height).toBeGreaterThanOrEqual(1);
  });

  it("resizes safely with inverted handles (dragging SE handle past NW boundary)", () => {
    const box = { x: 100, y: 100, width: 100, height: 100 };

    // Drag SE corner backwards by -300px (far past NW corner at (100, 100))
    const invertedResized = resizeBoxLocal(box, "se", { x: -300, y: -300 }, {
      minWidth: 5,
      minHeight: 5,
    });

    // Dimensions must not be negative; clamped to minWidth / minHeight
    expect(invertedResized.width).toBe(5);
    expect(invertedResized.height).toBe(5);
    expect(invertedResized.x).toBe(100);
    expect(invertedResized.y).toBe(100);

    // Drag NW corner forward by +300px (far past SE corner)
    const nwInverted = resizeBoxLocal(box, "nw", { x: 300, y: 300 }, {
      minWidth: 5,
      minHeight: 5,
    });
    expect(nwInverted.width).toBe(5);
    expect(nwInverted.height).toBe(5);
    // x should be anchored at right edge (200 - 5 = 195)
    expect(nwInverted.x).toBe(195);
    expect(nwInverted.y).toBe(195);
  });

  it("handles unknown or malformed handle strings safely", () => {
    const box = { x: 50, y: 50, width: 100, height: 100 };
    expect(edgesOfHandle("invalid")).toEqual({ left: false, right: false, top: false, bottom: false });
    expect(oppositeHandlePoint(box, "invalid")).toBeNull();

    const noopResized = resizeBoxLocal(box, "invalid", { x: 50, y: 50 });
    expect(noopResized).toEqual(box);
  });

  it("supports extreme rotation angles (-720°, 1080°, -3600°, 7200°)", () => {
    const v = { x: 50, y: -25 };

    // Extreme multiples of 360°
    const angles = [-720, 1080, -3600, 7200];
    for (const deg of angles) {
      const rot = rotateVector(v, deg);
      expect(Math.abs(rot.x - v.x)).toBeLessThan(1e-6);
      expect(Math.abs(rot.y - v.y)).toBeLessThan(1e-6);

      const unrot = unrotateVector(rot, deg);
      expect(Math.abs(unrot.x - v.x)).toBeLessThan(1e-6);
      expect(Math.abs(unrot.y - v.y)).toBeLessThan(1e-6);

      expect(normalizeAngle180(deg)).toBe(0);
      expect(normalizeAngle360(deg)).toBe(0);
    }

    // Offset extreme angles
    expect(normalizeAngle180(-750)).toBeCloseTo(-30, 5);
    expect(normalizeAngle180(1095)).toBeCloseTo(15, 5);
    expect(normalizeAngle360(-750)).toBeCloseTo(330, 5);
    expect(normalizeAngle360(1095)).toBeCloseTo(15, 5);

    // Transform resize under extreme rotation
    const rect = { x: 100, y: 100, width: 200, height: 100 };
    const res1080 = resizeBoxWithTransform({
      rect,
      handle: "se",
      delta: { x: 50, y: 25 },
      rotation: 1080,
    });
    const res0 = resizeBoxWithTransform({
      rect,
      handle: "se",
      delta: { x: 50, y: 25 },
      rotation: 0,
    });
    expect(Math.abs(res1080.x - res0.x)).toBeLessThan(1e-6);
    expect(Math.abs(res1080.y - res0.y)).toBeLessThan(1e-6);
    expect(Math.abs(res1080.width - res0.width)).toBeLessThan(1e-6);
    expect(Math.abs(res1080.height - res0.height)).toBeLessThan(1e-6);
  });

  it("calculateRotationAngle handles collinear pointer/center and invalid stepInterval", () => {
    const center = { x: 200, y: 200 };

    // Pointer coincident with center: dx=0, dy=0
    const angleCoincident = calculateRotationAngle({
      pointer: { x: 200, y: 200 },
      center,
      stalkOffset: 90,
    });
    expect(Number.isFinite(angleCoincident)).toBe(true);

    // Negative or 0 stepInterval must not cause division by zero or infinite loop
    const angleZeroStep = calculateRotationAngle({
      pointer: { x: 300, y: 200 },
      center,
      stepInterval: 0,
    });
    expect(Number.isFinite(angleZeroStep)).toBe(true);

    const angleNegStep = calculateRotationAngle({
      pointer: { x: 300, y: 200 },
      center,
      stepInterval: -15,
    });
    expect(Number.isFinite(angleNegStep)).toBe(true);
  });
});

describe("Adversarial Stress Test: Vector & Pen Geometry", () => {
  it("constrainAngle45 handles zero length, extreme distances, and negative coordinates", () => {
    const origin = { x: 0, y: 0 };

    // Exactly at origin
    const atOrigin = constrainAngle45(origin, { x: 0, y: 0 });
    expect(atOrigin).toEqual({ x: 0, y: 0 });

    // Extreme distance (1e9)
    const far = constrainAngle45(origin, { x: 1e9, y: 1e9 });
    expect(Number.isFinite(far.x)).toBe(true);
    expect(Number.isFinite(far.y)).toBe(true);
    expect(far.x).toBeCloseTo(1e9, -2);
    expect(far.y).toBeCloseTo(1e9, -2);

    // Negative quadrant
    const neg = constrainAngle45(origin, { x: -100, y: -100 });
    expect(neg.x).toBeCloseTo(-100, 3);
    expect(neg.y).toBeCloseTo(-100, 3);
  });

  it("cubicPoint computes finite values even for out-of-bound parameter t", () => {
    const p0 = [0, 0];
    const p1 = [50, 100];
    const p2 = [100, 100];
    const p3 = [150, 0];

    const atZero = cubicPoint(p0, p1, p2, p3, 0);
    expect(atZero).toEqual([0, 0]);

    const atOne = cubicPoint(p0, p1, p2, p3, 1);
    expect(atOne).toEqual([150, 0]);

    // Extrapolations
    const beforeZero = cubicPoint(p0, p1, p2, p3, -0.5);
    expect(Number.isFinite(beforeZero[0])).toBe(true);
    expect(Number.isFinite(beforeZero[1])).toBe(true);

    const pastOne = cubicPoint(p0, p1, p2, p3, 1.5);
    expect(Number.isFinite(pastOne[0])).toBe(true);
    expect(Number.isFinite(pastOne[1])).toBe(true);
  });

  it("bendHandlesThrough returns null for degenerate t near 0 or 1", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const P = { x: 50, y: 50 };

    expect(bendHandlesThrough(a, b, 0, P)).toBeNull();
    expect(bendHandlesThrough(a, b, 1, P)).toBeNull();
    expect(bendHandlesThrough(a, b, 1e-12, P)).toBeNull();

    const valid = bendHandlesThrough(a, b, 0.5, P);
    expect(valid).toBeDefined();
    expect(Number.isFinite(valid.out[0])).toBe(true);
    expect(Number.isFinite(valid.out[1])).toBe(true);
  });

  it("projectOntoPath and splitSegment with single point or collinear segments", () => {
    // 2 identical points (zero-length segment)
    const points = [{ x: 50, y: 50 }, { x: 50, y: 50 }];
    const proj = projectOntoPath(points, { x: 100, y: 100 });
    expect(proj).toBeDefined();
    expect(proj.dist).toBeCloseTo(Math.hypot(50, 50), 3);

    const split = splitSegment(points, 0, 0.5);
    expect(split.mid.x).toBe(50);
    expect(split.mid.y).toBe(50);
  });
});

describe("Adversarial Stress Test: Design Store & History Under Rapid Operations", () => {
  beforeEach(() => {
    useDesignStore.setState({
      editingNodeId: "page-1",
      editingNodeIds: ["page-1"],
      editingGroupId: null,
      nodes: [
        {
          id: "page-1",
          type: "imageEditor",
          position: { x: 0, y: 0 },
          data: {
            label: "Design 1",
            sceneDoc: { width: 1200, height: 800, layers: [] },
          },
        },
      ],
      editorCamera: { panX: 0, panY: 0, zoom: 1 },
      editorArtboardLayouts: {
        "page-1": { x: 0, y: 0, width: 1200, height: 800 },
      },
      images: {},
      isDirty: false,
    });
  });

  it("guarantees unique IDs with zero collision during rapid synchronous page creation", () => {
    const store = useDesignStore.getState();
    const ids = [];
    for (let i = 0; i < 50; i++) {
      ids.push(store.addEditorPage({ label: `Batch ${i}` }));
    }

    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    // Verify all pages are correctly stored with distinct IDs
    const state = useDesignStore.getState();
    for (const id of ids) {
      const matching = state.nodes.filter((n) => n.id === id);
      expect(matching.length).toBe(1);
    }
  });

  it("handles deleting all pages until empty store cleanly", () => {
    const store = useDesignStore.getState();
    expect(store.nodes.length).toBe(1);

    // Delete the only page
    store.deleteEditorPage("page-1");
    const emptyState = useDesignStore.getState();
    expect(emptyState.nodes.length).toBe(0);
    expect(emptyState.editingNodeIds.length).toBe(0);
    expect(emptyState.editingNodeId).toBeNull();

    // Deleting non-existent page ID should be a safe no-op
    expect(() => store.deleteEditorPage("non-existent")).not.toThrow();
  });

  it("rapid 1000 sequential camera movements and zoom updates", () => {
    const store = useDesignStore.getState();
    for (let i = 0; i < 1000; i++) {
      store.panEditorCamera({ dx: 1, dy: -1 });
    }
    const cam = useDesignStore.getState().editorCamera;
    expect(cam.panX).toBe(1000);
    expect(cam.panY).toBe(-1000);

    store.setEditorViewport({ panX: 0, panY: 0, zoom: 2.5 });
    expect(useDesignStore.getState().editorCamera.zoom).toBe(2.5);
  });

  it("createHistory stress test: 150 sequential pushes, boundary undos/redos, and branch pruning", () => {
    const history = createHistory();
    history.reset(JSON.stringify({ v: 0 }));

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    // 1. Rapid 150 pushes: should truncate to MAX_HISTORY (50)
    for (let i = 1; i <= 150; i++) {
      history.push(JSON.stringify({ v: i }), `action_${i}`);
    }

    const entries = history.getEntries();
    expect(entries.length).toBe(MAX_HISTORY);
    expect(history.getCurrentIndex()).toBe(MAX_HISTORY - 1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // 2. Undo all 49 steps to the beginning of the retained buffer
    for (let i = 0; i < MAX_HISTORY - 1; i++) {
      expect(history.canUndo()).toBe(true);
      history.undo();
    }
    expect(history.getCurrentIndex()).toBe(0);
    expect(history.canUndo()).toBe(false);
    // Underflow: undo at index 0 returns null safely
    expect(history.undo()).toBeNull();

    // 3. Redo 20 steps
    for (let i = 0; i < 20; i++) {
      history.redo();
    }
    expect(history.getCurrentIndex()).toBe(20);
    expect(history.canRedo()).toBe(true);

    // 4. Branch pruning: pushing from the middle must truncate future redo entries
    history.push(JSON.stringify({ v: "branch_fork" }), "fork");
    expect(history.getCurrentIndex()).toBe(21);
    expect(history.canRedo()).toBe(false);
    expect(history.getEntries().length).toBe(22);

    // 5. Overflow: redo at the end returns null safely
    expect(history.redo()).toBeNull();
  });

  it("createHistory gesture transactions: cancel vs commit vs muting", () => {
    const history = createHistory();
    history.reset(JSON.stringify({ state: "initial" }));

    // Gesture cancelled: no history entry added
    const tx = history.beginGesture("drag", { snapshot: JSON.stringify({ state: "drag_1" }) });
    expect(tx).toBe(true);
    history.markGestureChanged("drag");
    history.cancelGesture("drag");
    expect(history.getEntries().length).toBe(1);

    // Gesture committed: history entry added
    history.beginGesture("resize", { snapshot: JSON.stringify({ state: "resized" }) });
    history.markGestureChanged("resize");
    history.commitGesture("resize");
    expect(history.getEntries().length).toBe(2);

    // Muted: actions inside mute() do not push to history
    history.mute(() => {
      history.push(JSON.stringify({ state: "silent_mutation" }));
    });
    expect(history.getEntries().length).toBe(2);
  });
});
