import { describe, expect, it } from "vitest";
import { TOOL, TOOL_KEYS } from "../../src/canvas/editor/editor_constants.js";
import { resolveToolFamilyKeyAction } from "../../src/canvas/use_editor_shortcuts.js";

describe("tools audit: keyboard tool routing", () => {
  it("routes each documented single-key tool shortcut to the engine tool id", () => {
    const expected = {
      KeyV: TOOL.SELECT,
      KeyF: TOOL.FRAME,
      KeyQ: TOOL.PERSPECTIVE,
      KeyM: TOOL.MARQUEE,
      KeyZ: TOOL.REGION,
      KeyW: TOOL.WAND,
      KeyB: TOOL.BRUSH,
      KeyE: TOOL.ERASER,
      KeyJ: TOOL.HEALING,
      KeyL: TOOL.LASSO,
      KeyR: TOOL.RECT,
      KeyO: TOOL.ELLIPSE,
      KeyP: TOOL.PEN,
      KeyT: TOOL.TEXT,
      KeyG: TOOL.FILL,
      KeyC: TOOL.CROP,
      KeyI: TOOL.DROPPER,
      KeyH: TOOL.HAND,
    };
    for (const [code, tool] of Object.entries(expected)) {
      expect(TOOL_KEYS[code], code).toBe(tool);
    }
  });

  it("opens a family menu on keydown and releases it on matching keyup", () => {
    const down = resolveToolFamilyKeyAction({ phase: "keydown", code: "KeyB" });
    expect(down?.type).toBe("openPie");
    expect(down?.family.id).toBe("brush");
    expect(down?.family.items.map((item) => item.id)).toContain("normal");
    expect(
      resolveToolFamilyKeyAction({
        phase: "keyup",
        code: "KeyB",
        pressedCode: "KeyB",
      })?.type,
    ).toBe("pieRelease");
  });

  it("does not divert modified shortcut chords into a tool family", () => {
    expect(
      resolveToolFamilyKeyAction({
        phase: "keydown",
        code: "KeyB",
        metaKey: true,
      }),
    ).toBeNull();
  });
});
