import { describe, it, expect } from "vitest";
import { inspectLayout } from "../../src/canvas/agent/layout_qa.js";

function rect(id, x, y, width, height, extra = {}) {
  return { id, kind: "rect", name: id, x, y, width, height, ...extra };
}

function frame(id, x, y, width, height, extra = {}) {
  return { id, kind: "frame", name: id, x, y, width, height, ...extra };
}

describe("inspectLayout", () => {
  it("reports a child clipped by its clipping parent", () => {
    const doc = {
      width: 800,
      height: 600,
      nodes: [
        frame("frame", 0, 0, 400, 300),
        rect("card", 350, 20, 100, 80, { parentId: "frame" }),
      ],
    };
    const result = inspectLayout(doc);
    const kinds = result.problems.map((problem) => problem.kind);
    expect(kinds).toContain("clipped");
    expect(result.summary.clipped).toBeGreaterThanOrEqual(1);
    const clipped = result.problems.find((problem) => problem.kind === "clipped");
    expect(clipped.layerIds).toEqual(expect.arrayContaining(["card", "frame"]));
    expect(clipped.fix).toBeTruthy();
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("does not report clipping for a child inside the parent", () => {
    const doc = {
      nodes: [
        frame("frame", 0, 0, 400, 300),
        rect("card", 20, 20, 100, 80, { parentId: "frame" }),
      ],
    };
    const result = inspectLayout(doc);
    expect(result.problems.some((problem) => problem.kind === "clipped")).toBe(false);
  });

  it("does not report clipping when the parent does not clip content", () => {
    const doc = {
      nodes: [
        frame("frame", 0, 0, 400, 300, { clipContent: false }),
        rect("card", 350, 20, 100, 80, { parentId: "frame" }),
      ],
    };
    const result = inspectLayout(doc);
    expect(result.problems.some((problem) => problem.kind === "clipped")).toBe(false);
  });

  it("maps lint rules onto stable problem kinds with a summary", () => {
    const doc = {
      nodes: [
        rect("a", 0, 0, 200, 120),
        rect("b", 100, 60, 200, 120),
      ],
    };
    const result = inspectLayout(doc);
    expect(result.problems.length).toBeGreaterThan(0);
    for (const problem of result.problems) {
      expect(problem).toMatchObject({
        kind: expect.any(String),
        severity: expect.any(String),
        layerIds: expect.any(Array),
        message: expect.any(String),
        fix: expect.any(String),
      });
    }
    expect(result.summary.total).toBe(result.problems.length);
    expect(result.summary.overlap ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("restricts the review to a root subtree", () => {
    const doc = {
      nodes: [
        frame("left", 0, 0, 300, 300),
        rect("leftCard", 350, 20, 100, 80, { parentId: "left" }),
        frame("right", 500, 0, 300, 300),
        rect("rightCard", 520, 20, 100, 80, { parentId: "right" }),
      ],
    };
    const result = inspectLayout(doc, { rootId: "right" });
    expect(result.rootId).toBe("right");
    expect(result.problems.some((problem) => problem.layerIds.includes("leftCard"))).toBe(false);
  });
});
