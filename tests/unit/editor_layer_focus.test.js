import { describe, expect, it, vi } from "vitest";
import {
  restoreLayerListFocus,
  shouldRestoreLayerListFocus,
} from "../../src/canvas/components/editor_layer_focus.js";

function fixture({ active = null, inside = false } = {}) {
  const body = { tag: "BODY" };
  const list = {
    ownerDocument: { body, activeElement: active },
    contains: vi.fn(() => inside),
    focus: vi.fn(),
  };
  return { body, list, ref: { current: list } };
}

describe("layer rename focus restoration", () => {
  it("returns focus to the Layers list when the rename left it on the document", () => {
    const { body, list, ref } = fixture();
    list.ownerDocument.activeElement = body;
    expect(shouldRestoreLayerListFocus(list, body)).toBe(true);
    expect(restoreLayerListFocus(ref)).toBe(true);
    expect(list.focus).toHaveBeenCalledOnce();
  });

  it("does not steal focus from the control the user clicked next", () => {
    const nextField = { tag: "INPUT" };
    const { list, ref } = fixture({ active: nextField });
    expect(shouldRestoreLayerListFocus(list, nextField)).toBe(false);
    expect(restoreLayerListFocus(ref)).toBe(false);
    expect(list.focus).not.toHaveBeenCalled();
  });

  it("keeps focus when it is already inside the layer row", () => {
    const rowButton = { tag: "BUTTON" };
    const { ref } = fixture({ active: rowButton, inside: true });
    expect(restoreLayerListFocus(ref)).toBe(true);
    expect(ref.current.focus).toHaveBeenCalledOnce();
  });

  it("is a no-op without a mounted list", () => {
    expect(shouldRestoreLayerListFocus(null, null)).toBe(false);
    expect(restoreLayerListFocus({ current: null })).toBe(false);
  });
});
