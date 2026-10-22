import { describe, it, expect } from "vitest";
import {
  normalizeAutoLayout,
  reflowAutoLayout,
} from "../../src/canvas/editor/scene_auto_layout.js";

/**
 * Auto layout reflow contract.
 *
 * Synthetic documents only: auto layout is a document-coordinate flattening
 * pass over group folders, so every assertion below is exact geometry
 * (`x/y/w/h`) on the flat node list. Each case also proves the two public
 * invariants: `reflowAutoLayout` never mutates its input and a second pass is a
 * no-op (idempotent).
 *
 * Deferred semantics (intentionally not asserted as supported):
 * - `alignItems: "stretch"` is not modelled; use child `layoutHeight/layoutWidth: "fill"`.
 * - Per-line main-axis fill in a wrapped frame: wrapped main-axis fill children
 *   keep their measured size; lines are formed from measured sizes.
 * - A wrapped nested frame whose main axis is pinned by a parent derives the
 *   parent's hug cross size from its bottom-up (single-line) measurement; the
 *   frame's own cross size is re-derived from the final lines (see below).
 * - Per-line `justifyContent` beyond the shared distribution keywords.
 */

const near = (actual, expected) => expect(actual).toBeCloseTo(expected, 6);

function makeNode({
  id,
  kind = "rect",
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  parentId = null,
  ...rest
}) {
  return { id, kind, x, y, width, height, parentId, ...rest };
}

function makeGroup({
  id,
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  parentId = null,
  autoLayout,
  ...rest
}) {
  return makeNode({
    id,
    kind: "group",
    x,
    y,
    width,
    height,
    parentId,
    autoLayout,
    ...rest,
  });
}

function docOf(...nodes) {
  return { nodes };
}

function nodeOf(doc, id) {
  const node = doc.nodes.find((candidate) => candidate.id === id);
  expect(node, `node ${id} is missing`).toBeTruthy();
  return node;
}

function expectBox(doc, id, expected) {
  const node = nodeOf(doc, id);
  for (const [key, value] of Object.entries(expected)) {
    near(node[key], value);
  }
}

/** reflow once, assert purity of the input, then assert idempotency. */
function reflow(doc) {
  const before = JSON.stringify(doc);
  const once = reflowAutoLayout(doc);
  expect(JSON.stringify(doc)).toBe(before);
  const twice = reflowAutoLayout(once);
  expect(twice.nodes).toEqual(once.nodes);
  return once;
}

describe("auto layout — legacy document normalization", () => {
  it("defaults every new field without changing legacy ones", () => {
    expect(
      normalizeAutoLayout({
        direction: "horizontal",
        gap: 8,
        padding: 16,
        alignItems: "center",
        justifyContent: "space-between",
        widthMode: "hug",
        heightMode: "fixed",
      }),
    ).toEqual({
      direction: "horizontal",
      wrap: false,
      gap: 8,
      crossGap: 8,
      padding: { top: 16, right: 16, bottom: 16, left: 16 },
      alignItems: "center",
      alignContent: "start",
      justifyContent: "space-between",
      widthMode: "hug",
      heightMode: "fixed",
      minWidth: null,
      maxWidth: null,
      minHeight: null,
      maxHeight: null,
    });
  });

  it("accepts the new fields and sanitizes invalid values", () => {
    const layout = normalizeAutoLayout({
      direction: "vertical",
      gap: "7",
      crossGap: 3,
      wrap: true,
      alignContent: "space-evenly",
      justifyContent: "space-around",
      minWidth: 50,
      maxWidth: "120",
      minHeight: -4,
      maxHeight: "nope",
    });
    expect(layout.wrap).toBe(true);
    expect(layout.crossGap).toBe(3);
    expect(layout.alignContent).toBe("space-evenly");
    expect(layout.justifyContent).toBe("space-around");
    expect(layout.minWidth).toBe(50);
    expect(layout.maxWidth).toBe(120);
    expect(layout.minHeight).toBe(0);
    expect(layout.maxHeight).toBe(null);
    expect(normalizeAutoLayout({ direction: "diagonal" })).toBe(null);
  });

  it("reflows a legacy document exactly as the pre-wrap engine did", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 200,
        height: 100,
        autoLayout: {
          direction: "horizontal",
          gap: 10,
          padding: 20,
          alignItems: "center",
          justifyContent: "start",
          widthMode: "fixed",
          heightMode: "fixed",
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 40, height: 20, x: 500, y: 500 }),
      makeNode({ id: "b", parentId: "g", width: 40, height: 20, x: 500, y: 500 }),
    );
    const out = reflow(doc);
    expectBox(out, "g", { x: 0, y: 0, width: 200, height: 100 });
    expectBox(out, "a", { x: 20, y: 40, width: 40, height: 20 });
    expectBox(out, "b", { x: 70, y: 40, width: 40, height: 20 });
  });
});

describe("auto layout — fixed rows and columns", () => {
  it("places a horizontal row with gap and asymmetric padding", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        x: 10,
        y: 20,
        width: 200,
        height: 100,
        autoLayout: {
          direction: "horizontal",
          gap: 10,
          padding: { top: 4, right: 6, bottom: 8, left: 12 },
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 30, height: 20, x: 90, y: 90 }),
      makeNode({ id: "b", parentId: "g", width: 40, height: 30, x: 90, y: 90 }),
    );
    const out = reflow(doc);
    expectBox(out, "g", { x: 10, y: 20, width: 200, height: 100 });
    expectBox(out, "a", { x: 22, y: 24, width: 30, height: 20 });
    expectBox(out, "b", { x: 62, y: 24, width: 40, height: 30 });
  });

  it("places a vertical column", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        x: 0,
        y: 0,
        width: 100,
        height: 200,
        autoLayout: {
          direction: "vertical",
          gap: 5,
          padding: 10,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 20, height: 10 }),
      makeNode({ id: "b", parentId: "g", width: 20, height: 10 }),
    );
    const out = reflow(doc);
    expectBox(out, "a", { x: 10, y: 10 });
    expectBox(out, "b", { x: 10, y: 25 });
  });
});

describe("auto layout — hug sizing", () => {
  it("hugs both axes from children plus gap and padding", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        x: 100,
        y: 200,
        width: 999,
        height: 999,
        autoLayout: {
          direction: "vertical",
          widthMode: "hug",
          heightMode: "hug",
          gap: 6,
          padding: { top: 5, right: 7, bottom: 9, left: 11 },
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 30, height: 10 }),
      makeNode({ id: "b", parentId: "g", width: 50, height: 20 }),
    );
    const out = reflow(doc);
    expectBox(out, "g", { x: 100, y: 200, width: 68, height: 50 });
    expectBox(out, "a", { x: 111, y: 205 });
    expectBox(out, "b", { x: 111, y: 221 });
  });

  it("excludes invisible and absolute children from the hug size", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        x: 0,
        y: 0,
        width: 999,
        height: 999,
        autoLayout: {
          direction: "horizontal",
          widthMode: "hug",
          heightMode: "hug",
          gap: 5,
          padding: 10,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 20, height: 30 }),
      makeNode({ id: "b", parentId: "g", width: 20, height: 10 }),
      makeNode({ id: "hidden", parentId: "g", width: 500, height: 500, visible: false }),
      makeNode({
        id: "abs",
        parentId: "g",
        x: 50,
        y: 60,
        width: 999,
        height: 999,
        layoutPosition: "absolute",
      }),
    );
    const out = reflow(doc);
    expectBox(out, "g", { width: 65, height: 50 });
    expectBox(out, "a", { x: 10, y: 10 });
    expectBox(out, "b", { x: 35, y: 10 });
    // Absolute children keep their own document position.
    expectBox(out, "abs", { x: 50, y: 60, width: 999, height: 999 });
  });

  it("moves absolute children with the parent subtree but keeps the relative offset", () => {
    const doc = docOf(
      makeGroup({
        id: "outer",
        width: 300,
        height: 100,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 20,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeGroup({
        id: "inner",
        x: 0,
        y: 0,
        width: 999,
        height: 999,
        parentId: "outer",
        autoLayout: {
          direction: "vertical",
          widthMode: "hug",
          heightMode: "hug",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "flow", parentId: "inner", width: 20, height: 20 }),
      makeNode({
        id: "abs",
        parentId: "inner",
        x: 50,
        y: 60,
        width: 10,
        height: 10,
        layoutPosition: "absolute",
      }),
    );
    const out = reflow(doc);
    // outer places the hug inner frame at the padding origin.
    expectBox(out, "inner", { x: 20, y: 20, width: 20, height: 20 });
    expectBox(out, "flow", { x: 20, y: 20 });
    // Absolute child translated by the same (20, 20) delta.
    expectBox(out, "abs", { x: 70, y: 80 });
  });
});

describe("auto layout — fill children", () => {
  it("shares the remaining main space between fill children", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 320,
        height: 100,
        autoLayout: {
          direction: "horizontal",
          gap: 10,
          padding: 20,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 40, height: 20 }),
      makeNode({ id: "b", parentId: "g", width: 60, height: 20 }),
      makeNode({
        id: "fill",
        parentId: "g",
        width: 10,
        height: 20,
        layoutWidth: "fill",
        layoutHeight: "fixed",
      }),
    );
    const out = reflow(doc);
    // inner main = 320 - 40 = 280; fixed = 100; gaps = 20; remaining = 160.
    expectBox(out, "fill", { width: 160, height: 20 });
    expectBox(out, "a", { x: 20, y: 20 });
    expectBox(out, "b", { x: 70, y: 20 });
    expectBox(out, "fill", { x: 140, y: 20 });
  });

  it("stretches cross-axis fill children to the inner cross", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 200,
        height: 100,
        autoLayout: {
          direction: "horizontal",
          gap: 10,
          padding: { top: 10, right: 0, bottom: 10, left: 0 },
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({
        id: "a",
        parentId: "g",
        width: 50,
        height: 10,
        layoutWidth: "fixed",
        layoutHeight: "fill",
      }),
    );
    const out = reflow(doc);
    expectBox(out, "a", { x: 0, y: 10, width: 50, height: 80 });
  });

  it("keeps fill children at their measured size inside a hug parent", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 999,
        height: 999,
        autoLayout: {
          direction: "horizontal",
          widthMode: "hug",
          heightMode: "hug",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({
        id: "fill",
        parentId: "g",
        width: 40,
        height: 10,
        layoutWidth: "fill",
        layoutHeight: "fixed",
      }),
      makeNode({ id: "b", parentId: "g", width: 20, height: 10 }),
    );
    const out = reflow(doc);
    expectBox(out, "g", { width: 60, height: 10 });
    expectBox(out, "fill", { x: 0, width: 40 });
    expectBox(out, "b", { x: 40, width: 20 });
  });

  it("keeps a hug child of a fixed parent at its hug size", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 200,
        height: 100,
        autoLayout: {
          direction: "vertical",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeGroup({
        id: "child",
        width: 999,
        height: 20,
        parentId: "g",
        autoLayout: {
          direction: "horizontal",
          widthMode: "hug",
          heightMode: "hug",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "leaf", parentId: "child", width: 30, height: 10 }),
      makeNode({
        id: "fillLeaf",
        parentId: "child",
        width: 10,
        height: 10,
        layoutWidth: "fill",
      }),
    );
    const out = reflow(doc);
    expectBox(out, "child", { width: 40, height: 10 });
    expectBox(out, "leaf", { x: 0, width: 30 });
    expectBox(out, "fillLeaf", { x: 30, width: 10 });
  });

  it("assigns the fill width to a text child's boxWidth", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 100,
        height: 40,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({
        id: "t",
        kind: "text",
        parentId: "g",
        width: 10,
        height: 10,
        layoutWidth: "fill",
      }),
    );
    const out = reflow(doc);
    const text = nodeOf(out, "t");
    expect(text.width).toBe(100);
    expect(text.boxWidth).toBe(100);
  });
});

describe("auto layout — distribution", () => {
  const makeJustifyDoc = (justifyContent) =>
    docOf(
      makeGroup({
        id: "g",
        width: 300,
        height: 50,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent,
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 50, height: 10 }),
      makeNode({ id: "b", parentId: "g", width: 50, height: 10 }),
      makeNode({ id: "c", parentId: "g", width: 50, height: 10 }),
    );

  it("centers the flow", () => {
    const out = reflow(makeJustifyDoc("center"));
    expectBox(out, "a", { x: 75 });
    expectBox(out, "b", { x: 125 });
    expectBox(out, "c", { x: 175 });
  });

  it("packs the flow to the end", () => {
    const out = reflow(makeJustifyDoc("end"));
    expectBox(out, "a", { x: 150 });
    expectBox(out, "c", { x: 250 });
  });

  it("distributes space-between", () => {
    const out = reflow(makeJustifyDoc("space-between"));
    expectBox(out, "a", { x: 0 });
    expectBox(out, "b", { x: 125 });
    expectBox(out, "c", { x: 250 });
  });

  it("distributes space-around", () => {
    const out = reflow(makeJustifyDoc("space-around"));
    expectBox(out, "a", { x: 25 });
    expectBox(out, "b", { x: 125 });
    expectBox(out, "c", { x: 225 });
  });

  it("distributes space-evenly", () => {
    const out = reflow(makeJustifyDoc("space-evenly"));
    expectBox(out, "a", { x: 37.5 });
    expectBox(out, "b", { x: 125 });
    expectBox(out, "c", { x: 212.5 });
  });

  it("centers and ends cross-axis alignment", () => {
    const centerDoc = docOf(
      makeGroup({
        id: "g",
        width: 100,
        height: 100,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "center",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 10, height: 20 }),
    );
    expectBox(reflow(centerDoc), "a", { y: 40 });

    const endDoc = docOf(
      makeGroup({
        id: "g",
        width: 100,
        height: 100,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "end",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 10, height: 20 }),
    );
    expectBox(reflow(endDoc), "a", { y: 80 });
  });
});

describe("auto layout — wrap", () => {
  function wrapDoc(autoLayout, children) {
    return docOf(
      makeGroup({ id: "g", width: 0, height: 0, autoLayout }),
      ...children.map((child) => makeNode({ parentId: "g", ...child })),
    );
  }

  it("wraps a fixed-width row and hugs the resulting cross size", () => {
    const doc = wrapDoc(
      {
        direction: "horizontal",
        wrap: true,
        gap: 10,
        crossGap: 5,
        padding: 0,
        alignItems: "start",
        justifyContent: "start",
        alignContent: "start",
        widthMode: "fixed",
        heightMode: "hug",
      },
      [
        { id: "a", width: 30, height: 10 },
        { id: "b", width: 30, height: 20 },
        { id: "c", width: 30, height: 30 },
        { id: "d", width: 30, height: 40 },
      ],
    );
    doc.nodes[0].width = 100;
    const out = reflow(doc);
    // lines: [a b] (30+10+30=70 <= 100), [c d] (30+10+30=70).
    expectBox(out, "g", { width: 100, height: 20 + 5 + 40 });
    expectBox(out, "a", { x: 0, y: 0 });
    expectBox(out, "b", { x: 40, y: 0 });
    expectBox(out, "c", { x: 0, y: 25 });
    expectBox(out, "d", { x: 40, y: 25 });
  });

  it("aligns lines with alignContent inside a fixed cross size", () => {
    const cases = [
      { alignContent: "start", first: 0, second: 25 },
      { alignContent: "center", first: 10, second: 35 },
      { alignContent: "end", first: 20, second: 45 },
      { alignContent: "space-between", first: 0, second: 45 },
      { alignContent: "space-around", first: 5, second: 40 },
      { alignContent: "space-evenly", first: 20 / 3, second: (20 / 3) * 2 + 25 },
    ];
    for (const testCase of cases) {
      const doc = wrapDoc(
        {
          direction: "horizontal",
          wrap: true,
          gap: 10,
          crossGap: 5,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
          alignContent: testCase.alignContent,
          widthMode: "fixed",
          heightMode: "fixed",
        },
        [
          { id: "a", width: 30, height: 10 },
          { id: "b", width: 30, height: 20 },
          { id: "c", width: 30, height: 30 },
          { id: "d", width: 30, height: 40 },
        ],
      );
      doc.nodes[0].width = 100;
      doc.nodes[0].height = 85;
      const out = reflow(doc);
      expectBox(out, "g", { width: 100, height: 85 });
      expectBox(out, "a", { y: testCase.first });
      expectBox(out, "b", { y: testCase.first });
      expectBox(out, "c", { y: testCase.second });
      expectBox(out, "d", { y: testCase.second });
    }
  });

  it("wraps a vertical column into columns and hugs the width", () => {
    const doc = wrapDoc(
      {
        direction: "vertical",
        wrap: true,
        gap: 10,
        crossGap: 10,
        padding: 0,
        alignItems: "start",
        justifyContent: "start",
        alignContent: "start",
        widthMode: "hug",
        heightMode: "fixed",
      },
      [
        { id: "a", width: 10, height: 30 },
        { id: "b", width: 20, height: 30 },
        { id: "c", width: 30, height: 30 },
        { id: "d", width: 40, height: 30 },
      ],
    );
    doc.nodes[0].height = 100;
    const out = reflow(doc);
    // columns: [a b] (30+10+30=70), [c d] (30+10+30=70).
    // hug width = column crosses (20 + 10 + 40) = 70.
    expectBox(out, "g", { width: 70, height: 100 });
    expectBox(out, "a", { x: 0, y: 0 });
    expectBox(out, "b", { x: 0, y: 40 });
    expectBox(out, "c", { x: 30, y: 0 });
    expectBox(out, "d", { x: 30, y: 40 });
  });

  it("stretches cross-fill children to their own line, not the frame", () => {
    const doc = wrapDoc(
      {
        direction: "horizontal",
        wrap: true,
        gap: 10,
        crossGap: 5,
        padding: 0,
        alignItems: "start",
        justifyContent: "start",
        alignContent: "start",
        widthMode: "fixed",
        heightMode: "fixed",
      },
      [
        { id: "a", width: 30, height: 10 },
        { id: "b", width: 30, height: 20, layoutHeight: "fill" },
        { id: "c", width: 30, height: 5 },
        { id: "d", width: 30, height: 40, layoutHeight: "fill" },
      ],
    );
    doc.nodes[0].width = 100;
    doc.nodes[0].height = 100;
    const out = reflow(doc);
    // line 1 cross = max(10, 20) = 20 -> b fills its line.
    // line 2 cross = max(5, 40) = 40 -> d fills its line.
    expectBox(out, "b", { y: 0, height: 20 });
    expectBox(out, "d", { y: 25, height: 40 });
  });

  it("wraps a hugging row only after maxWidth clamps it", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 0,
        height: 0,
        autoLayout: {
          direction: "horizontal",
          wrap: true,
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
          widthMode: "hug",
          heightMode: "hug",
          maxWidth: 100,
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 60, height: 10 }),
      makeNode({ id: "b", parentId: "g", width: 60, height: 10 }),
      makeNode({ id: "c", parentId: "g", width: 60, height: 10 }),
    );
    const out = reflow(doc);
    // hug main = 180 -> clamped to 100 -> one child per line; hug cross = 30.
    expectBox(out, "g", { width: 100, height: 30 });
    expectBox(out, "a", { x: 0, y: 0 });
    expectBox(out, "b", { x: 0, y: 10 });
    expectBox(out, "c", { x: 0, y: 20 });
  });
});

describe("auto layout — min/max sizing", () => {
  it("clamps a hug width above its max and below its min", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 0,
        height: 0,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
          widthMode: "hug",
          heightMode: "hug",
          minWidth: 80,
          maxWidth: 100,
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 60, height: 10 }),
      makeNode({ id: "b", parentId: "g", width: 60, height: 10 }),
    );
    const out = reflow(doc);
    expectBox(out, "g", { width: 100, height: 10 });
  });

  it("raises a hug width to its min width", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 0,
        height: 0,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
          widthMode: "hug",
          heightMode: "hug",
          minWidth: 150,
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 60, height: 10 }),
    );
    const out = reflow(doc);
    expectBox(out, "g", { width: 150, height: 10 });
  });

  it("clamps a fixed frame too", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 300,
        height: 30,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
          maxWidth: 250,
          minHeight: 50,
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 10, height: 10 }),
    );
    const out = reflow(doc);
    expectBox(out, "g", { width: 250, height: 50 });
  });

  it("lets min win when min exceeds max", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 0,
        height: 10,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
          widthMode: "hug",
          minWidth: 200,
          maxWidth: 100,
        },
      }),
      makeNode({ id: "a", parentId: "g", width: 10, height: 10 }),
    );
    const out = reflow(doc);
    expectBox(out, "g", { width: 200 });
  });

  it("clamps a fill child by its own min/max", () => {
    const doc = docOf(
      makeGroup({
        id: "g",
        width: 300,
        height: 50,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeGroup({
        id: "fill",
        width: 10,
        height: 10,
        parentId: "g",
        autoLayout: {
          direction: "vertical",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
          maxWidth: 220,
        },
        layoutWidth: "fill",
      }),
    );
    const out = reflow(doc);
    expectBox(out, "fill", { width: 220 });
  });
});

describe("auto layout — nested groups", () => {
  it("lays a filled nested hug frame out against the imposed width", () => {
    const doc = docOf(
      makeGroup({
        id: "outer",
        width: 300,
        height: 100,
        autoLayout: {
          direction: "horizontal",
          gap: 10,
          padding: 10,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeGroup({
        id: "inner",
        width: 999,
        height: 999,
        parentId: "outer",
        autoLayout: {
          direction: "horizontal",
          widthMode: "hug",
          heightMode: "hug",
          gap: 5,
          padding: 5,
          alignItems: "start",
          justifyContent: "start",
        },
        layoutWidth: "fill",
        layoutHeight: "fixed",
      }),
      makeNode({
        id: "fillLeaf",
        parentId: "inner",
        width: 10,
        height: 10,
        layoutWidth: "fill",
      }),
      makeNode({ id: "leaf", parentId: "inner", width: 10, height: 10 }),
      makeNode({ id: "sibling", parentId: "outer", width: 30, height: 30 }),
    );
    const out = reflow(doc);
    // outer inner main = 300 - 20 = 280; sibling 30 + gap 10 -> inner = 240.
    expectBox(out, "inner", { x: 10, y: 10, width: 240, height: 20 });
    // inner inner main = 240 - 10 = 230; fixed leaf 10 + gap 5 -> fill = 215.
    expectBox(out, "fillLeaf", { x: 15, y: 15, width: 215, height: 10 });
    expectBox(out, "leaf", { x: 235, y: 15, width: 10, height: 10 });
    expectBox(out, "sibling", { x: 260, y: 10 });
  });

  it("reflows three levels of nesting", () => {
    const doc = docOf(
      makeGroup({
        id: "l1",
        width: 200,
        height: 100,
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeGroup({
        id: "l2",
        width: 999,
        height: 999,
        parentId: "l1",
        autoLayout: {
          direction: "vertical",
          widthMode: "hug",
          heightMode: "hug",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeGroup({
        id: "l3",
        width: 0,
        height: 0,
        parentId: "l2",
        autoLayout: {
          direction: "horizontal",
          widthMode: "hug",
          heightMode: "hug",
          gap: 3,
          padding: 2,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeNode({ id: "x", parentId: "l3", width: 20, height: 10 }),
      makeNode({ id: "y", parentId: "l3", width: 20, height: 10 }),
    );
    const out = reflow(doc);
    expectBox(out, "l3", { width: 2 + 20 + 3 + 20 + 2, height: 2 + 10 + 2 });
    expectBox(out, "l2", { width: 47, height: 14 });
    expectBox(out, "x", { x: 2, y: 2 });
    expectBox(out, "y", { x: 25, y: 2 });
  });
});

describe("auto layout — safety and purity", () => {
  it("throws a stable cycle error for malformed parent chains", () => {
    const doc = docOf(
      makeGroup({
        id: "a",
        width: 100,
        height: 100,
        parentId: "b",
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
      makeGroup({
        id: "b",
        width: 100,
        height: 100,
        parentId: "a",
        autoLayout: {
          direction: "horizontal",
          gap: 0,
          padding: 0,
          alignItems: "start",
          justifyContent: "start",
        },
      }),
    );
    expect(() => reflowAutoLayout(doc)).toThrow(/^auto-layout-cycle:/);
  });

  it("returns the same document object when no group opts into layout", () => {
    const doc = docOf(makeNode({ id: "n", width: 10, height: 10 }));
    expect(reflowAutoLayout(doc)).toBe(doc);
  });

  it("is idempotent across a document with every feature combined", () => {
    const doc = docOf(
      makeGroup({
        id: "root",
        width: 200,
        height: 0,
        autoLayout: {
          direction: "horizontal",
          wrap: true,
          gap: 8,
          crossGap: 4,
          padding: 12,
          alignItems: "center",
          justifyContent: "space-between",
          alignContent: "space-around",
          widthMode: "fixed",
          heightMode: "hug",
          minHeight: 100,
        },
      }),
      makeNode({ id: "a", parentId: "root", width: 50, height: 20 }),
      makeNode({
        id: "b",
        parentId: "root",
        width: 50,
        height: 20,
        layoutHeight: "fill",
      }),
      makeNode({ id: "c", parentId: "root", width: 50, height: 20 }),
      makeNode({ id: "d", parentId: "root", width: 50, height: 20 }),
      makeNode({
        id: "abs",
        parentId: "root",
        x: 900,
        y: 900,
        width: 30,
        height: 30,
        layoutPosition: "absolute",
      }),
    );
    const once = reflow(doc);
    // Sanity: the frame hugs its wrapped lines but never below minHeight.
    expectBox(once, "root", { width: 200 });
    expect(nodeOf(once, "root").height).toBeGreaterThanOrEqual(100);
    const twice = reflowAutoLayout(once);
    expect(twice.nodes).toEqual(once.nodes);
  });
});
