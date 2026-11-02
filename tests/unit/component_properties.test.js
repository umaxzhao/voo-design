import { describe, expect, it } from "vitest";
import {
  COMPONENT_PROP_TYPES,
  normalizeComponentPropertyDefinitions,
  setComponentPropertyDefinition,
  removeComponentPropertyDefinition,
  resolveInstanceComponentProperties,
  setInstanceComponentProperty,
} from "../../src/canvas/editor/component_properties.js";

describe("Component typed properties model", () => {
  it("normalizes and adds typed property definitions", () => {
    let comp = { canvasId: "c1", name: "Button", nodes: [] };
    comp = setComponentPropertyDefinition(comp, "label", {
      type: COMPONENT_PROP_TYPES.TEXT,
      defaultValue: "Click me",
    });
    comp = setComponentPropertyDefinition(comp, "hasIcon", {
      type: COMPONENT_PROP_TYPES.BOOLEAN,
      defaultValue: true,
    });
    comp = setComponentPropertyDefinition(comp, "icon", {
      type: COMPONENT_PROP_TYPES.INSTANCE_SWAP,
      defaultValue: "CheckIcon",
      preferredValues: ["CheckIcon", "CloseIcon", "ArrowIcon"],
    });

    const defs = comp.componentPropertyDefinitions;
    expect(Object.keys(defs)).toEqual(["label", "hasIcon", "icon"]);
    expect(defs.label.type).toBe("text");
    expect(defs.label.defaultValue).toBe("Click me");
    expect(defs.hasIcon.type).toBe("boolean");
    expect(defs.hasIcon.defaultValue).toBe(true);
    expect(defs.icon.preferredValues).toHaveLength(3);

    // Removal
    const removed = removeComponentPropertyDefinition(comp, "hasIcon");
    expect(Object.keys(removed.componentPropertyDefinitions)).toEqual(["label", "icon"]);
  });

  it("resolves instance values and overrides", () => {
    const comp = {
      canvasId: "c1",
      name: "Card",
      componentPropertyDefinitions: {
        title: { type: "text", defaultValue: "Default Title" },
        showBadge: { type: "boolean", defaultValue: false },
      },
      nodes: [],
    };

    let instance = {
      id: "inst1",
      kind: "canvasInstance",
      sourceCanvasId: "c1",
    };

    // Default resolution
    let resolved = resolveInstanceComponentProperties(instance, comp);
    expect(resolved.title.value).toBe("Default Title");
    expect(resolved.showBadge.value).toBe(false);

    // Set instance override
    instance = setInstanceComponentProperty(instance, "title", "Custom Title");
    instance = setInstanceComponentProperty(instance, "showBadge", true);

    resolved = resolveInstanceComponentProperties(instance, comp);
    expect(resolved.title.value).toBe("Custom Title");
    expect(resolved.showBadge.value).toBe(true);
  });
});
