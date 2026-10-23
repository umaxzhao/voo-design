import { describe, it, expect, afterEach } from "vitest";
import {
  RULER_SIZE,
  addGuide,
  clearGuides,
  createGuide,
  docToScreen,
  generateRulerTicks,
  guideScreenPos,
  hitTestGuides,
  isOverRulerStrip,
  moveGuide,
  niceStepForZoom,
  nextGuideId,
  normaliseGuide,
  readDocumentGuides,
  removeGuide,
  roundedGuidePos,
  screenToDoc,
  serialiseGuides,
  sortGuides,
  updateGuide,
  visibleDocRange,
} from "../../src/canvas/editor/rulers_geometry.js";
import {
  SNAP_SETTING_KEYS,
  buildSnapOptions,
  editorSnapOptions,
  snapNodeBounds,
} from "../../src/canvas/editor/scene_snapping.js";
import {
  createDocument,
  serialiseDocument,
  deserialiseDocument,
} from "../../src/canvas/editor/scene_model.js";
import { setSetting } from "../../src/shared/settings.js";

/**
 * Rulers, guides and reachable grid snapping.
 *
 * Geometry is pure and tested directly; the snapping half proves the options
 * the pointer handlers now pass (`editorSnapOptions`) actually reach
 * `snapNodeBounds` and change the result — the original bug was that no call
 * site passed options, so `snapToGrid` was permanently false.
 */

const guide = (id, type, pos) => ({ id, type, pos });

afterEach(async () => {
  await setSetting(SNAP_SETTING_KEYS.snapToGrid, false);
  await setSetting(SNAP_SETTING_KEYS.showGuides, true);
});

describe("ruler tick generation", () => {
  it("picks 1/2/5/10/25/50/100… steps by zoom", () => {
    // 48px minimum label gap → 50 units per label at 100%.
    expect(niceStepForZoom(1)).toBe(50);
    expect(niceStepForZoom(0.5)).toBe(100);
    expect(niceStepForZoom(0.25)).toBe(250);
    expect(niceStepForZoom(0.1)).toBe(500);
    // Zoomed in past 100%, labels every 10/5/2/1 document units.
    expect(niceStepForZoom(2)).toBe(25);
    expect(niceStepForZoom(5)).toBe(10);
    expect(niceStepForZoom(10)).toBe(5);
    expect(niceStepForZoom(100)).toBe(1);
    // Guards: zoom is never allowed to divide by zero.
    expect(niceStepForZoom(0)).toBe(50);
    expect(niceStepForZoom(Number.NaN)).toBe(50);
  });

  it("generates major labels and minor ticks from the visible document range", () => {
    const { majorStep, minorStep, ticks } = generateRulerTicks({
      length: 800,
      zoom: 1,
      pan: 0,
    });
    expect(majorStep).toBe(50);
    expect(minorStep).toBe(10);
    // 0..800 → 81 minor ticks (every 10 units) with 17 labelled.
    expect(ticks.length).toBe(81);
    const labelled = ticks.filter((tick) => tick.major);
    expect(labelled.length).toBe(17);
    expect(labelled[0].pos).toBe(0);
    expect(labelled[0].label).toBe("0");
    expect(labelled[1].pos).toBe(50);
    expect(labelled[1].label).toBe("50");
    // Tick screen positions follow doc * zoom + pan.
    expect(ticks[0].at).toBe(0);
    expect(ticks[10].pos).toBe(100);
    expect(ticks[10].at).toBe(100);
    // Negative origin is labelled too, without a leading minus zero.
    expect(labelled.some((tick) => tick.label === "-0")).toBe(false);
  });

  it("respects pan and zoom when converting tick positions", () => {
    const { ticks, majorStep } = generateRulerTicks({
      length: 400,
      zoom: 2,
      pan: -100,
    });
    expect(majorStep).toBe(25);
    const first = ticks[0];
    // screen = pos * 2 - 100, visible range starts at doc 50.
    expect(first.pos).toBe(50);
    expect(first.at).toBeCloseTo(0, 6);
    const second = ticks.find((tick) => tick.pos === 75);
    expect(second.at).toBeCloseTo(50, 6);
    expect(second.label).toBe("75");
  });

  it("handles a zero-length ruler without ticks", () => {
    expect(generateRulerTicks({ length: 0, zoom: 1 }).ticks).toEqual([]);
  });
});

describe("document/screen conversion", () => {
  it("round-trips doc ↔ screen at any zoom and pan", () => {
    for (const zoom of [0.1, 0.25, 1, 2.5, 8]) {
      for (const pan of [-500, 0, 137]) {
        const screen = docToScreen(123.5, { zoom, pan });
        expect(screenToDoc(screen, { zoom, pan })).toBeCloseTo(123.5, 6);
      }
    }
  });

  it("maps the visible screen range back to document space", () => {
    const { start, end } = visibleDocRange(800, { zoom: 2, pan: -100 });
    expect(start).toBe(50);
    expect(end).toBe(450);
  });

  it("positions a guide at docToScreen on its own axis", () => {
    expect(guideScreenPos(guide("g", "v", 120), { zoom: 2, pan: -40 })).toBe(200);
    expect(guideScreenPos(guide("g", "h", 30), { zoom: 0.5, pan: 10 })).toBe(25);
  });
});

describe("guide hit testing", () => {
  const guides = [
    guide("g-v", "v", 100),
    guide("g-h", "h", 60),
    guide("g-v2", "v", 300),
  ];

  it("hits a vertical guide within the pixel slop", () => {
    expect(
      hitTestGuides(guides, { x: 104, y: 20 }, { zoom: 1 })?.guide.id,
    ).toBe("g-v");
    expect(hitTestGuides(guides, { x: 109, y: 20 }, { zoom: 1 })).toBeNull();
  });

  it("hits a horizontal guide within the pixel slop", () => {
    expect(
      hitTestGuides(guides, { x: 10, y: 64 }, { zoom: 1 })?.guide.id,
    ).toBe("g-h");
    expect(hitTestGuides(guides, { x: 10, y: 70 }, { zoom: 1 })).toBeNull();
  });

  it("takes zoom/pan into account (slop stays in screen pixels)", () => {
    // At 2× zoom and pan -40, guide 300 draws at 560.
    expect(
      hitTestGuides(guides, { x: 563, y: 0 }, { zoom: 2, panX: -40 })?.guide.id,
    ).toBe("g-v2");
    expect(
      hitTestGuides(guides, { x: 570, y: 0 }, { zoom: 2, panX: -40 }),
    ).toBeNull();
    // The nearest of two candidates wins.
    const near = hitTestGuides(
      [guide("a", "v", 100), guide("b", "v", 103)],
      { x: 102, y: 0 },
      { zoom: 1, slop: 8 },
    );
    expect(near?.guide.id).toBe("b");
  });

  it("returns null for an empty list or a malformed point", () => {
    expect(hitTestGuides([], { x: 1, y: 1 })).toBeNull();
    expect(hitTestGuides(guides, null)).toBeNull();
  });
});

describe("guide reducers", () => {
  it("creates a guide with a unique id", () => {
    const created = createGuide({ type: "v", pos: 42 }, []);
    expect(created).toEqual({ id: "guide-1", type: "v", pos: 42 });
    const second = createGuide({ type: "h", pos: 12 }, [created]);
    expect(second.id).toBe("guide-2");
    // A colliding explicit id is replaced instead of replacing a guide.
    const colliding = createGuide(
      { id: "guide-1", type: "h", pos: 1 },
      [created],
    );
    expect(colliding.id).not.toBe("guide-1");
    expect(nextGuideId([created, second])).toBe("guide-3");
  });

  it("adds immutably and keeps the list sorted (vertical first)", () => {
    let guides = [];
    guides = addGuide(guides, guide("b", "h", 50));
    guides = addGuide(guides, guide("a", "v", 200));
    const before = guides;
    guides = addGuide(guides, guide("c", "v", 10));
    expect(before).toHaveLength(2);
    expect(guides.map((entry) => entry.id)).toEqual(["c", "a", "b"]);
    // Duplicate ids are ignored.
    expect(addGuide(guides, guide("a", "v", 99))).toBe(guides);
  });

  it("moves, removes and clears without mutating the input", () => {
    const guides = [guide("a", "v", 10), guide("b", "h", 20)];
    const moved = updateGuide(guides, "a", 55);
    expect(moved[0]).toEqual(guide("a", "v", 55));
    expect(guides[0].pos).toBe(10);
    expect(moveGuide(guides, "missing", 1)).toBe(guides);
    expect(moveGuide(guides, "a", Number.NaN)).toBe(guides);

    const removed = removeGuide(guides, "b");
    expect(removed).toEqual([guide("a", "v", 10)]);
    expect(removeGuide(guides, "missing")).toBe(guides);
    expect(clearGuides()).toEqual([]);
  });

  it("sorts a copy without touching the original order", () => {
    const guides = [guide("z", "h", 5), guide("y", "v", 90), guide("x", "v", 10)];
    const sorted = sortGuides(guides);
    expect(sorted.map((entry) => entry.id)).toEqual(["x", "y", "z"]);
    expect(guides.map((entry) => entry.id)).toEqual(["z", "y", "x"]);
  });
});

describe("document guide persistence shape", () => {
  it("reads legacy {type,pos} entries and assigns ids", () => {
    const guides = readDocumentGuides({
      guides: [
        { type: "v", pos: 10 },
        { type: "h", pos: 20 },
        { type: "nope", pos: 30 },
        { type: "v", pos: "not-a-number" },
      ],
    });
    expect(guides).toEqual([
      { id: "guide-1", type: "v", pos: 10 },
      { id: "guide-2", type: "h", pos: 20 },
    ]);
  });

  it("accepts horizontal/vertical aliases and drops duplicate ids", () => {
    expect(normaliseGuide({ type: "horizontal", pos: 7 })).toEqual({
      id: "guide-1",
      type: "h",
      pos: 7,
    });
    expect(
      readDocumentGuides({
        guides: [
          { id: "dup", type: "v", pos: 1 },
          { id: "dup", type: "h", pos: 2 },
        ],
      }),
    ).toEqual([{ id: "dup", type: "v", pos: 1 }]);
  });

  it("serialises only the persisted fields, sorted", () => {
    expect(
      serialiseGuides([
        { id: "h1", type: "h", pos: 5, transient: true },
        { id: "v1", type: "v", pos: 9 },
      ]),
    ).toEqual([
      { id: "v1", type: "v", pos: 9 },
      { id: "h1", type: "h", pos: 5 },
    ]);
    expect(serialiseGuides(null)).toEqual([]);
  });

  it("doc.guides survives the .voo scene serialiser round-trip", () => {
    const doc = createDocument(1000, 800);
    doc.guides = serialiseGuides([
      { id: "v1", type: "v", pos: 250 },
      { id: "h1", type: "h", pos: 120 },
    ]);
    const raw = serialiseDocument(doc);
    expect(raw.guides).toEqual([
      { id: "v1", type: "v", pos: 250 },
      { id: "h1", type: "h", pos: 120 },
    ]);
    const restored = deserialiseDocument(raw);
    expect(restored.guides).toEqual(raw.guides);
  });
});

describe("ruler drag helpers", () => {
  it("removes a guide dropped back on a ruler strip", () => {
    expect(isOverRulerStrip({ x: 4, y: 200 })).toBe(true);
    expect(isOverRulerStrip({ x: 200, y: RULER_SIZE })).toBe(true);
    expect(isOverRulerStrip({ x: 200, y: 400 })).toBe(false);
    expect(isOverRulerStrip({ x: 4, y: 4 }, { showRulers: false })).toBe(false);
  });

  it("rounds guides to whole document units", () => {
    expect(roundedGuidePos(10.6)).toBe(11);
    expect(roundedGuidePos(10.6, { pixelSnap: false })).toBe(10.6);
    expect(roundedGuidePos(Number.NaN)).toBeNull();
  });
});

describe("snapping option plumbing", () => {
  it("builds the snapNodeBounds options with grid size/type", () => {
    expect(buildSnapOptions()).toEqual({
      enabled: true,
      snapToObjects: true,
      snapToGuides: true,
      snapToGrid: false,
      activeSnap: false,
      grid: { type: "rectangular", size: 32 },
    });
    expect(
      buildSnapOptions({
        grid: { type: "isometric", size: 24 },
        snapToGrid: true,
        showGuides: false,
        activeSnap: true,
      }),
    ).toEqual({
      enabled: true,
      snapToObjects: true,
      snapToGuides: false,
      snapToGrid: true,
      activeSnap: true,
      grid: { type: "isometric", size: 24 },
    });
    // A garbage grid size falls back instead of producing NaN snapping.
    expect(buildSnapOptions({ grid: { size: -4 } }).grid.size).toBe(32);
  });

  it("editorSnapOptions reads the persisted toggles synchronously", async () => {
    await setSetting(SNAP_SETTING_KEYS.snapToGrid, true);
    await setSetting(SNAP_SETTING_KEYS.showGuides, false);
    const options = editorSnapOptions({ grid: { enabled: true, size: 64 } });
    expect(options.snapToGrid).toBe(true);
    expect(options.snapToGuides).toBe(false);
    expect(options.grid).toEqual({ type: "rectangular", size: 64 });

    await setSetting(SNAP_SETTING_KEYS.snapToGrid, false);
    await setSetting(SNAP_SETTING_KEYS.showGuides, true);
    expect(editorSnapOptions({ grid: { enabled: true, size: 64 } }).snapToGrid).toBe(false);
    expect(editorSnapOptions().snapToGuides).toBe(true);
  });

  it("grid snapping produces a snapped rect once the option is passed", () => {
    const doc = createDocument(1000, 800);
    const rect = { x: 23, y: 23, width: 40, height: 40 };
    const unsnapped = snapNodeBounds({ doc, rect, zoom: 1 });
    expect(unsnapped.x).toBe(23);
    expect(unsnapped.deltaX).toBe(0);

    const options = buildSnapOptions({
      snapToGrid: true,
      grid: { type: "rectangular", size: 20 },
    });
    const snapped = snapNodeBounds({ doc, rect, zoom: 1, options });
    expect(snapped.x).toBe(20);
    expect(snapped.y).toBe(20);
    expect(snapped.deltaX).toBe(-3);
    expect(snapped.deltaY).toBe(-3);
  });

  it("guide snapping targets doc.guides, and hiding guides disables it", () => {
    const doc = createDocument(1000, 800);
    doc.guides = [{ id: "v1", type: "v", pos: 50 }];
    const rect = { x: 47, y: 400, width: 40, height: 40 };

    const withGuides = snapNodeBounds({
      doc,
      rect,
      zoom: 1,
      options: buildSnapOptions({ showGuides: true }),
    });
    expect(withGuides.x).toBe(50);

    const withoutGuides = snapNodeBounds({
      doc,
      rect,
      zoom: 1,
      options: buildSnapOptions({ showGuides: false }),
    });
    expect(withoutGuides.x).toBe(47);
  });

  it("keeps object snapping on by default (no regression)", () => {
    const doc = createDocument(1000, 800);
    doc.nodes = [{ id: "n1", kind: "rect", x: 200, y: 100, width: 100, height: 100 }];
    // Left edge 3px from the sibling's left edge 200 → snap.
    const result = snapNodeBounds({
      doc,
      activeId: "n2",
      rect: { x: 203, y: 300, width: 40, height: 40 },
      zoom: 1,
      options: buildSnapOptions(),
    });
    expect(result.x).toBe(200);
  });

  it("resize handles honour the same grid options", () => {
    const doc = createDocument(1000, 800);
    const options = buildSnapOptions({
      snapToGrid: true,
      grid: { type: "rectangular", size: 20 },
    });
    // East handle at 158 → nearest grid line 160 within threshold.
    const result = snapNodeBounds({
      doc,
      rect: { x: 100, y: 100, width: 58, height: 40 },
      zoom: 1,
      handle: "e",
      options,
    });
    expect(result.width).toBe(60);
  });
});
