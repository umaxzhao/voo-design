import { describe, expect, it } from "vitest";
import { CANVAS_TOOL_SCHEMAS } from "../../src/canvas/agent/canvas_tools.js";
import { validateAutoLayout } from "../../src/canvas/agent/canvas_mutation_validation.js";
const properties = name => CANVAS_TOOL_SCHEMAS.find(schema => schema.function.name === name).function.parameters.properties;
describe("advertised canvas schema parity", () => {
  it("advertises every accepted legacy Auto Layout alignment including stretch", () => {
    const values = properties("mutate_auto_layout").config.properties.alignment.enum;
    for (const value of ["start", "center", "end", "space-between", "stretch"]) {
      expect(values).toContain(value);
      expect(() => validateAutoLayout({
        enabled: true,
        alignment: value
      })).not.toThrow();
    }
  });
  it("lets agent clients clear slots and the documented nullable overrides", () => {
    expect(properties("set_frame_slot").slot.type).toContain("null");
    for (const key of ["text", "fill", "visible", "cameraId", "poster"]) {
      expect(properties("set_instance_override").patch.properties[key].type).toContain("null");
    }
  });
});
