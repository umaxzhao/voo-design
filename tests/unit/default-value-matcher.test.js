import { describe, expect, it } from "vitest";
import { createDefaultAdjustments, deepEqual, isDefaultAdjustments, DEFAULT_ADJUSTMENTS } from "../../src/canvas/editor/scene_model_core.js";

describe("default adjustment comparison", () => {
  it("rechecks mutable inputs, including nested points and filter arrays", () => {
    const value = createDefaultAdjustments();
    expect(isDefaultAdjustments(value)).toBe(true);
    value.curves.r[1].y = .7;
    expect(isDefaultAdjustments(value)).toBe(false);
    value.curves.r[1].y = 1;
    value.liveFilters.push({ type: "blur", radius: 2 });
    expect(isDefaultAdjustments(value)).toBe(false);
    value.liveFilters.pop();
    expect(isDefaultAdjustments(value)).toBe(true);
  });

  it("detects missing, additional and undefined enumerable fields", () => {
    for (const mutate of [value => { delete value.brightness.value; },
      value => { value.brightness.extra = undefined; }, value => { value.brightness.value = undefined; },
      value => { value.curves.r.length = 1; }]) {
      const value = createDefaultAdjustments();
      mutate(value);
      expect(isDefaultAdjustments(value)).toBe(false);
    }
    expect(isDefaultAdjustments(null)).toBe(false);
    expect(isDefaultAdjustments([])).toBe(false);
  });

  it("matches the structural comparator across every JSON leaf mutation", () => {
    const leaves = [];
    const visit = (value, path) => {
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
      } else leaves.push(path);
    };
    visit(DEFAULT_ADJUSTMENTS, []);
    for (const path of leaves) {
      const value = createDefaultAdjustments();
      let owner = value;
      for (const key of path.slice(0, -1)) owner = owner[key];
      owner[path.at(-1)] = "changed";
      expect(isDefaultAdjustments(value)).toBe(deepEqual(value, DEFAULT_ADJUSTMENTS));
      expect(isDefaultAdjustments(value)).toBe(false);
    }
  });

  it("ignores property order and inherited metadata while requiring own baseline fields", () => {
    const value = Object.assign(Object.create({ metadata: true }),
      Object.fromEntries(Object.entries(createDefaultAdjustments()).reverse()));
    expect(isDefaultAdjustments(value)).toBe(true);
    delete value.brightness;
    Object.getPrototypeOf(value).brightness = DEFAULT_ADJUSTMENTS.brightness;
    expect(isDefaultAdjustments(value)).toBe(false);
  });
});
