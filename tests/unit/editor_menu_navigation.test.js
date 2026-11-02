import { describe, expect, it, vi } from "vitest";
import { moveEditorMenuFocus } from "../../src/canvas/components/editor_menu_navigation.js";

function fixture() {
  const ownerDocument = { activeElement: null };
  const items = Array.from({ length: 4 }, (_, index) => ({
    getClientRects: () => index === 1 ? [] : [{}],
    getAttribute: () => index === 2 ? "true" : null,
    focus: vi.fn(() => { ownerDocument.activeElement = items[index]; }),
  }));
  const menu = { ownerDocument, contains: (target) => items.includes(target), querySelectorAll: () => items };
  ownerDocument.activeElement = items[0];
  const event = (key, target = ownerDocument.activeElement) => ({ key, target, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  return { items, menu, event, ownerDocument };
}

describe("editor menu keyboard ownership", () => {
  it("skips invisible and aria-disabled entries and wraps", () => {
    const { items, menu, event, ownerDocument } = fixture();
    const down = event("ArrowDown");
    expect(moveEditorMenuFocus(down, menu)).toBe(true);
    expect(ownerDocument.activeElement).toBe(items[3]);
    expect(down.preventDefault).toHaveBeenCalledOnce();
    expect(down.stopPropagation).toHaveBeenCalledOnce();
    moveEditorMenuFocus(event("ArrowDown"), menu);
    expect(ownerDocument.activeElement).toBe(items[0]);
    moveEditorMenuFocus(event("ArrowUp"), menu);
    expect(ownerDocument.activeElement).toBe(items[3]);
  });

  it("supports Home and End without invoking entries", () => {
    const { items, menu, event, ownerDocument } = fixture();
    moveEditorMenuFocus(event("End"), menu);
    expect(ownerDocument.activeElement).toBe(items[3]);
    moveEditorMenuFocus(event("Home"), menu);
    expect(ownerDocument.activeElement).toBe(items[0]);
  });

  it("does not intercept unrelated controls or activation keys", () => {
    const { items, menu, event } = fixture();
    expect(moveEditorMenuFocus(event("ArrowDown", {}), menu)).toBe(false);
    expect(moveEditorMenuFocus(event("Enter"), menu)).toBe(false);
    expect(moveEditorMenuFocus(event("Escape"), null)).toBe(false);
    expect(items.every(item => item.focus.mock.calls.length === 0)).toBe(true);
  });
});
