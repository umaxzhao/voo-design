import { describe, it, expect } from "vitest";
import {
  DEFAULT_CONSTRAINTS,
  applyConstraints,
  constraintsEqual,
  defaultConstraintsFor,
  hasConstraints,
  normalizeConstraints,
  reflowConstraints,
  withConstraints,
  withoutConstraints,
} from "../../src/canvas/editor/scene_constraints.js";
import {
  createDocument,
  deserialiseDocument,
  serialiseDocument,
} from "../../src/canvas/editor/scene_model.js";

/**
 * Resize constraints contract.
 *
 * Nodes are absolute boxes in document coordinates; a parent is either the
 * page (top-level nodes) or a group folder (`parentId`). `reflowConstraints`
 * is the pure resize policy, `applyConstraints` the per-node math.
 *
 * Semantics under test (see the scene_constraints.js header table):
 *   left/top       keep the leading offset
 *   right/bottom   keep the trailing offset
 *   leftRight/topBottom  keep both offsets, so the size grows with the parent
 *   center         keep the centre offset (not the ratio)
 *   scale          scale offset and size by the parent size ratio
 */

function node(overrides) {
  return {
    id: "n",
    kind: "rect",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    ...overrides,
  };
}

const OLD_PARENT = { x: 0, y: 0, width: 200, height: 100 };
const NEW_PARENT = { x: 0, y: 0, width: 300, height: 150 };
const SHRUNK_PARENT = { x: 0, y: 0, width: 100, height: 50 };
const CHILD = { x: 50, y: 20, width: 40, height: 30 };

function constrained(horizontal, vertical) {
  return { horizontal, vertical };
}

describe("normalizeConstraints", () => {
  it("returns the default left/top for missing input", () => {
    expect(normalizeConstraints(null)).toEqual(DEFAULT_CONSTRAINTS);
    expect(normalizeConstraints(undefined)).toEqual({
      horizontal: "left",
      vertical: "top",
    });
    expect(normalizeConstraints({})).toEqual({
      horizontal: "left",
      vertical: "top",
    });
  });

  it("keeps every stored mode", () => {
    for (const horizontal of [
      "left",
      "right",
      "leftRight",
      "center",
      "scale",
    ]) {
      expect(
        normalizeConstraints({ horizontal, vertical: "top" }).horizontal,
      ).toBe(horizontal);
    }
    for (const vertical of ["top", "bottom", "topBottom", "center", "scale"]) {
      expect(
        normalizeConstraints({ horizontal: "left", vertical }).vertical,
      ).toBe(vertical);
    }
  });

  it("accepts documented aliases and falls back on garbage", () => {
    expect(
      normalizeConstraints({ horizontal: "left-right", vertical: "top-bottom" }),
    ).toEqual({ horizontal: "leftRight", vertical: "topBottom" });
    expect(
      normalizeConstraints({ horizontal: "stretch", vertical: "fill" }),
    ).toEqual({ horizontal: "leftRight", vertical: "topBottom" });
    expect(
      normalizeConstraints({ horizontal: "centre", vertical: "middle" }),
    ).toEqual({ horizontal: "center", vertical: "center" });
    expect(
      normalizeConstraints({ horizontal: "RIGHT", vertical: "bottom" }),
    ).toEqual({ horizontal: "right", vertical: "bottom" });
    // Tolerant cross-axis reads: Figma's vertical rows are named left/right.
    expect(
      normalizeConstraints({ horizontal: "bogus", vertical: "left" }),
    ).toEqual({ horizontal: "left", vertical: "top" });
    expect(
      normalizeConstraints({ horizontal: 42, vertical: null }),
    ).toEqual({ horizontal: "left", vertical: "top" });
  });

  it("reports explicit constraints and equality", () => {
    expect(hasConstraints(node({ constraints: { horizontal: "scale" } }))).toBe(
      true,
    );
    expect(hasConstraints(node({}))).toBe(false);
    expect(
      constraintsEqual(
        { horizontal: "left-right", vertical: "top-bottom" },
        { horizontal: "leftRight", vertical: "topBottom" },
      ),
    ).toBe(true);
    expect(
      constraintsEqual(
        { horizontal: "left", vertical: "top" },
        { horizontal: "right", vertical: "top" },
      ),
    ).toBe(false);
  });
});

describe("applyConstraints — horizontal modes", () => {
  it("left keeps the leading offset and width", () => {
    expect(
      applyConstraints(CHILD, OLD_PARENT, NEW_PARENT, constrained("left", "top")),
    ).toEqual({ x: 50, y: 20, width: 40, height: 30 });
  });

  it("right keeps the trailing offset and width", () => {
    // trailing = 200 - (50 + 40) = 110 -> x = 300 - 110 - 40 = 150
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        NEW_PARENT,
        constrained("right", "top"),
      ),
    ).toEqual({ x: 150, y: 20, width: 40, height: 30 });
  });

  it("leftRight keeps both offsets and grows the width", () => {
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        NEW_PARENT,
        constrained("leftRight", "top"),
      ),
    ).toEqual({ x: 50, y: 20, width: 140, height: 30 });
  });

  it("center keeps the centre offset and width", () => {
    // centre offset = 50 + 20 - 100 = -30 -> x = 150 - 30 - 20 = 100
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        NEW_PARENT,
        constrained("center", "top"),
      ),
    ).toEqual({ x: 100, y: 20, width: 40, height: 30 });
  });

  it("scale scales the offset and width by the parent ratio", () => {
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        NEW_PARENT,
        constrained("scale", "top"),
      ),
    ).toEqual({ x: 75, y: 20, width: 60, height: 30 });
  });

  it("shrinking clamps a stretched child at zero and keeps scale positive", () => {
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        SHRUNK_PARENT,
        constrained("leftRight", "top"),
      ),
    ).toEqual({ x: 50, y: 20, width: 0, height: 30 });
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        SHRUNK_PARENT,
        constrained("scale", "top"),
      ),
    ).toEqual({ x: 25, y: 20, width: 20, height: 30 });
    // right/bottom may push a child outside a shrunken parent (pinned inside).
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        SHRUNK_PARENT,
        constrained("right", "top"),
      ),
    ).toEqual({ x: -50, y: 20, width: 40, height: 30 });
  });
});

describe("applyConstraints — vertical modes", () => {
  it("resolves each vertical mode exactly", () => {
    expect(
      applyConstraints(CHILD, OLD_PARENT, NEW_PARENT, constrained("left", "top")),
    ).toEqual({ x: 50, y: 20, width: 40, height: 30 });
    // bottom = 100 - (20 + 30) = 50 -> y = 150 - 50 - 30 = 70
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        NEW_PARENT,
        constrained("left", "bottom"),
      ),
    ).toEqual({ x: 50, y: 70, width: 40, height: 30 });
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        NEW_PARENT,
        constrained("left", "topBottom"),
      ),
    ).toEqual({ x: 50, y: 20, width: 40, height: 80 });
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        NEW_PARENT,
        constrained("left", "center"),
      ),
    ).toEqual({ x: 50, y: 45, width: 40, height: 30 });
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        NEW_PARENT,
        constrained("left", "scale"),
      ),
    ).toEqual({ x: 50, y: 30, width: 40, height: 45 });
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        SHRUNK_PARENT,
        constrained("left", "bottom"),
      ),
    ).toEqual({ x: 50, y: -30, width: 40, height: 30 });
    expect(
      applyConstraints(
        CHILD,
        OLD_PARENT,
        SHRUNK_PARENT,
        constrained("left", "center"),
      ),
    ).toEqual({ x: 50, y: -5, width: 40, height: 30 });
  });
});

describe("applyConstraints — parent origin and tolerance", () => {
  it("works in absolute coordinates when the parent moves", () => {
    const oldParent = { x: 10, y: 10, width: 200, height: 100 };
    const newParent = { x: 30, y: 40, width: 300, height: 150 };
    const child = { x: 60, y: 30, width: 40, height: 30 };
    expect(
      applyConstraints(child, oldParent, newParent, constrained("left", "top")),
    ).toEqual({ x: 80, y: 60, width: 40, height: 30 });
    expect(
      applyConstraints(child, oldParent, newParent, constrained("right", "top")),
    ).toEqual({ x: 180, y: 60, width: 40, height: 30 });
  });

  it("defaults to left/top and tolerates unusable boxes", () => {
    expect(
      applyConstraints(CHILD, OLD_PARENT, NEW_PARENT, null),
    ).toEqual({ x: 50, y: 20, width: 40, height: 30 });
    expect(applyConstraints(CHILD, null, NEW_PARENT, null)).toEqual(CHILD);
    expect(
      applyConstraints(
        CHILD,
        { width: "nope" },
        NEW_PARENT,
        constrained("scale", "scale"),
      ),
    ).toEqual(CHILD);
    // Degenerate parents fall back to the leading edge instead of NaN.
    expect(
      applyConstraints(
        CHILD,
        { x: 0, y: 0, width: 0, height: 0 },
        { x: 0, y: 0, width: 100, height: 100 },
        constrained("scale", "scale"),
      ),
    ).toEqual({ x: 50, y: 20, width: 40, height: 30 });
  });
});

describe("defaultConstraintsFor", () => {
  const parent = { x: 0, y: 0, width: 200, height: 100 };

  it("infers stretch, edges, centre and scale-friendly defaults", () => {
    expect(
      defaultConstraintsFor(node({ x: 0, y: 0, width: 200, height: 100 }), parent),
    ).toEqual({ horizontal: "leftRight", vertical: "topBottom" });
    expect(
      defaultConstraintsFor(node({ x: 150, y: 70, width: 50, height: 30 }), parent),
    ).toEqual({ horizontal: "right", vertical: "bottom" });
    expect(
      defaultConstraintsFor(node({ x: 75, y: 35, width: 50, height: 30 }), parent),
    ).toEqual({ horizontal: "center", vertical: "center" });
    expect(
      defaultConstraintsFor(node({ x: 10, y: 10, width: 50, height: 30 }), parent),
    ).toEqual({ horizontal: "left", vertical: "top" });
  });

  it("falls back to left/top without a usable parent", () => {
    expect(defaultConstraintsFor(node({}), null)).toEqual(DEFAULT_CONSTRAINTS);
    expect(
      defaultConstraintsFor(node({}), { x: 0, y: 0, width: 0, height: 0 }),
    ).toEqual(DEFAULT_CONSTRAINTS);
  });
});

describe("reflowConstraints — page (top-level) reflow", () => {
  function pageDoc() {
    return {
      width: 200,
      height: 100,
      nodes: [
        node({
          id: "pinned",
          x: 50,
          y: 20,
          width: 40,
          height: 30,
          constraints: constrained("right", "scale"),
        }),
        node({ id: "free", x: 10, y: 10, width: 20, height: 20 }),
        node({
          id: "group",
          kind: "group",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
        }),
        node({
          id: "group-child",
          parentId: "group",
          x: 30,
          y: 40,
          width: 20,
          height: 20,
          constraints: constrained("scale", "scale"),
        }),
      ],
    };
  }

  const options = {
    parentId: null,
    oldBox: { x: 0, y: 0, width: 200, height: 100 },
    newBox: { x: 0, y: 0, width: 300, height: 150 },
  };

  it("moves constrained top-level nodes and leaves others untouched", () => {
    const doc = pageDoc();
    const out = reflowConstraints(doc, options);
    const byId = new Map(out.nodes.map((entry) => [entry.id, entry]));
    expect(byId.get("pinned")).toMatchObject({
      x: 150,
      y: 30,
      width: 40,
      height: 45,
    });
    // No constraints -> untouched by the reflow pass.
    expect(byId.get("free")).toEqual(doc.nodes.find((n) => n.id === "free"));
    // A group is a top-level node itself; its child is not a top-level node.
    expect(byId.get("group-child")).toEqual(
      doc.nodes.find((n) => n.id === "group-child"),
    );
    // The page box comes from newBox.
    expect(out.width).toBe(300);
    expect(out.height).toBe(150);
  });

  it("does not mutate the input document", () => {
    const doc = pageDoc();
    const frozen = JSON.stringify(doc);
    reflowConstraints(doc, options);
    expect(JSON.stringify(doc)).toBe(frozen);
  });

  it("is idempotent when replayed from the pre-resize boxes", () => {
    const doc = pageDoc();
    const beforeBoxes = new Map(
      doc.nodes.map((entry) => [
        entry.id,
        { x: entry.x, y: entry.y, width: entry.width, height: entry.height },
      ]),
    );
    const replayOptions = { ...options, beforeBoxes };
    const once = reflowConstraints(doc, replayOptions);
    expect(reflowConstraints(once, replayOptions)).toBe(once);
  });

  it("returns the input reference for unchanged or unusable boxes", () => {
    const doc = pageDoc();
    expect(
      reflowConstraints(doc, {
        parentId: null,
        oldBox: options.oldBox,
        newBox: { ...options.oldBox },
      }),
    ).toBe(doc);
    expect(reflowConstraints(doc, {})).toBe(doc);
    expect(
      reflowConstraints(doc, {
        parentId: null,
        oldBox: { width: "nope" },
        newBox: options.newBox,
      }),
    ).toBe(doc);
  });

  it("returns a new size-consistent document even with no constrained nodes", () => {
    const doc = {
      width: 200,
      height: 100,
      nodes: [node({ id: "free", x: 10, y: 10 })],
    };
    const out = reflowConstraints(doc, options);
    expect(out).not.toBe(doc);
    expect(out.width).toBe(300);
    expect(out.nodes[0]).toBe(doc.nodes[0]);
  });

  it("accepts pre-resize boxes captured before the resize centring", () => {
    // The page-resize hook resizes first and the op centres every node, so the
    // constrained node is already at (100, 45); beforeBoxes restores its
    // pre-resize box for the constraint math.
    const doc = {
      width: 300,
      height: 150,
      nodes: [
        node({
          id: "pinned",
          x: 100,
          y: 45,
          width: 40,
          height: 30,
          constraints: constrained("right", "scale"),
        }),
      ],
    };
    const out = reflowConstraints(doc, {
      ...options,
      beforeBoxes: new Map([["pinned", { x: 50, y: 20, width: 40, height: 30 }]]),
    });
    expect(out.nodes[0]).toMatchObject({
      x: 150,
      y: 30,
      width: 40,
      height: 45,
    });
    expect(reflowConstraints(out, {
      ...options,
      beforeBoxes: { pinned: { x: 50, y: 20, width: 40, height: 30 } },
    })).toBe(out);
  });
});

describe("reflowConstraints — group parent reflow", () => {
  function groupDoc({ autoLayout = null } = {}) {
    const group = node({
      id: "group",
      kind: "group",
      x: 100,
      y: 50,
      width: 200,
      height: 100,
      ...(autoLayout ? { autoLayout } : {}),
    });
    return {
      width: 500,
      height: 500,
      nodes: [
        group,
        node({
          id: "child",
          parentId: "group",
          x: 150,
          y: 70,
          width: 40,
          height: 30,
          constraints: constrained("leftRight", "top"),
        }),
        node({ id: "freeChild", parentId: "group", x: 120, y: 60, width: 10, height: 10 }),
        node({ id: "outside", x: 400, y: 400, width: 10, height: 10 }),
      ],
    };
  }

  const options = {
    parentId: "group",
    oldBox: { x: 100, y: 50, width: 200, height: 100 },
    newBox: { x: 100, y: 50, width: 300, height: 150 },
  };

  it("reflows direct children and writes the resized parent box", () => {
    const doc = groupDoc();
    const out = reflowConstraints(doc, options);
    const byId = new Map(out.nodes.map((entry) => [entry.id, entry]));
    expect(byId.get("child")).toMatchObject({
      x: 150,
      y: 70,
      width: 140,
      height: 30,
    });
    expect(byId.get("freeChild")).toEqual(
      doc.nodes.find((n) => n.id === "freeChild"),
    );
    expect(byId.get("group")).toMatchObject({
      x: 100,
      y: 50,
      width: 300,
      height: 150,
    });
    // Nodes outside the resized group are untouched.
    expect(byId.get("outside")).toEqual(
      doc.nodes.find((n) => n.id === "outside"),
    );
    // Group reflow must not change the page size.
    expect(out.width).toBe(500);
  });

  it("skips auto-layout flow children but still resolves absolute ones", () => {
    const autoLayout = {
      direction: "horizontal",
      wrap: false,
      gap: 0,
      padding: 0,
      alignItems: "start",
      alignContent: "start",
      justifyContent: "start",
      widthMode: "fixed",
      heightMode: "fixed",
    };
    const doc = groupDoc({ autoLayout });
    doc.nodes.push(
      node({
        id: "absoluteChild",
        parentId: "group",
        layoutPosition: "absolute",
        x: 120,
        y: 70,
        width: 20,
        height: 20,
        constraints: constrained("right", "bottom"),
      }),
    );
    const out = reflowConstraints(doc, options);
    const byId = new Map(out.nodes.map((entry) => [entry.id, entry]));
    // The flow child is laid out by reflowAutoLayout, not by constraints.
    expect(byId.get("child")).toEqual(doc.nodes.find((n) => n.id === "child"));
    // Absolute children are out of the auto-layout flow, so constraints apply.
    expect(byId.get("absoluteChild")).toMatchObject({
      x: 100 + 300 - (200 - (120 - 100 + 20)) - 20,
      y: 50 + 150 - (100 - (70 - 50 + 20)) - 20,
    });
    // 300 - (200 - 40) - 20 = 120 -> x 220; y: 150 - (100 - 40) - 20 = 70 -> 120
    expect(byId.get("absoluteChild").x).toBe(220);
    expect(byId.get("absoluteChild").y).toBe(120);
  });

  it("is idempotent for group reflow when replayed from pre-resize boxes", () => {
    const doc = groupDoc();
    const beforeBoxes = new Map(
      doc.nodes.map((entry) => [
        entry.id,
        { x: entry.x, y: entry.y, width: entry.width, height: entry.height },
      ]),
    );
    const replayOptions = { ...options, beforeBoxes };
    const once = reflowConstraints(doc, replayOptions);
    expect(reflowConstraints(once, replayOptions)).toBe(once);
  });
});

describe("withConstraints / withoutConstraints", () => {
  it("patches a node with normalized constraints", () => {
    const doc = {
      nodes: [node({ id: "a" }), node({ id: "b" })],
    };
    const out = withConstraints(doc, "a", {
      horizontal: "left-right",
      vertical: "top-bottom",
    });
    expect(out.nodes[0].constraints).toEqual({
      horizontal: "leftRight",
      vertical: "topBottom",
    });
    expect(out.nodes[1]).toBe(doc.nodes[1]);
    // Same reference for equivalent constraints.
    expect(
      withConstraints(out, "a", {
        horizontal: "left-right",
        vertical: "top-bottom",
      }),
    ).toBe(out);
    expect(withConstraints(doc, "missing", { horizontal: "scale" })).toBe(doc);
  });

  it("clears constraints", () => {
    const doc = {
      nodes: [node({ id: "a", constraints: { horizontal: "scale", vertical: "scale" } })],
    };
    const out = withoutConstraints(doc, "a");
    expect(out.nodes[0].constraints).toBeUndefined();
    expect(withoutConstraints(out, "a")).toBe(out);
    expect(withoutConstraints(doc, "missing")).toBe(doc);
  });
});

describe(".voo serialisation", () => {
  it("keeps node constraints through serialiseDocument/deserialiseDocument", () => {
    const doc = createDocument(400, 300, "transparent", {
      canvasId: "constraints-doc",
    });
    doc.nodes = [
      node({
        id: "pinned",
        x: 40,
        y: 60,
        constraints: constrained("right", "bottom"),
      }),
      node({
        id: "stretched",
        x: 0,
        y: 0,
        width: 400,
        height: 20,
        constraints: constrained("leftRight", "top"),
      }),
    ];
    const saved = serialiseDocument(doc);
    expect(saved.nodes[0].constraints).toEqual({
      horizontal: "right",
      vertical: "bottom",
    });
    const restored = deserialiseDocument(saved);
    expect(restored.nodes.map((entry) => entry.constraints)).toEqual([
      { horizontal: "right", vertical: "bottom" },
      { horizontal: "leftRight", vertical: "top" },
    ]);
    // Reading back keeps the surviving document geometry intact.
    expect(restored.width).toBe(400);
    expect(restored.height).toBe(300);
  });
});
