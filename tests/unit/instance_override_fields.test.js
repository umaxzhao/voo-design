// Instance overrides beyond text/fill/visible: validation, apply and support.
import { describe, expect, it } from "vitest";
import {
  OVERRIDE_FIELDS,
  applyInstanceOverrides,
  overrideSupport,
  overridableNodes,
  setNodeOverride,
  clearAllOverrides,
} from "../../src/canvas/editor/instance-overrides.js";

const sourceDoc = {
  canvasId: "main",
  nodes: [
    { id: "bg", kind: "rect", fill: "#111111", stroke: "#222222", strokeWidth: 0 },
    { id: "label", kind: "text", text: "Hello", fill: "#ffffff", fontSize: 16, fontWeight: 400 },
    { id: "grp", kind: "group" },
  ],
};
const instance = (overrides) => ({ id: "i1", kind: "canvasInstance", overrides });

describe("instance override fields", () => {
  it("supports stroke, opacity, effects, radius and text metrics", () => {
    expect(OVERRIDE_FIELDS).toContain("stroke");
    expect(OVERRIDE_FIELDS).toContain("effects");
    expect(OVERRIDE_FIELDS).toContain("fontSize");
    expect(overrideSupport({ kind: "rect" })).toMatchObject({
      stroke: true,
      opacity: true,
      text: false,
    });
    expect(overrideSupport({ kind: "text" })).toMatchObject({
      fontSize: true,
      fontWeight: true,
    });
    expect(
      overridableNodes(sourceDoc).map(({ node }) => node.id),
    ).toEqual(["bg", "label"]);
  });

  it("validates values and merges them onto the instance", () => {
    let next = instance({});
    next = setNodeOverride(next, "bg", {
      stroke: "#ff0000",
      strokeWidth: 4,
      fillOpacity: 0.5,
      opacity: 0.25,
      cornerRadius: 12,
      effects: [{ kind: "shadow", x: 0, y: 2, blur: 8 }],
    });
    expect(next.overrides.nodes.bg).toMatchObject({
      stroke: "#ff0000",
      strokeWidth: 4,
      fillOpacity: 0.5,
      opacity: 0.25,
      cornerRadius: 12,
    });
    next = setNodeOverride(next, "label", { fontSize: 24, fontWeight: 700 });
    expect(next.overrides.nodes.label).toEqual({ fontSize: 24, fontWeight: 700 });

    expect(() => setNodeOverride(next, "bg", { stroke: "not-a-colour" })).toThrow();
    expect(() => setNodeOverride(next, "bg", { opacity: 2 })).toThrow();
    expect(() => setNodeOverride(next, "bg", { effects: "blur" })).toThrow();
    expect(() => setNodeOverride(next, "label", { fontSize: 0 })).toThrow();
  });

  it("applies the fields when the component is drawn", () => {
    const next = setNodeOverride(instance({}), "bg", {
      stroke: "#00ff00",
      strokeWidth: 2,
      effects: [{ kind: "blur", value: 3 }],
    });
    const drawn = applyInstanceOverrides(sourceDoc, next);
    const bg = drawn.nodes.find((node) => node.id === "bg");
    expect(bg).toMatchObject({ stroke: "#00ff00", strokeWidth: 2 });
    expect(bg.effects).toEqual([{ kind: "blur", value: 3 }]);
    expect(bg.effects).not.toBe(next.overrides.nodes.bg.effects);
    expect(clearAllOverrides(next).overrides).toEqual({});
  });
});
