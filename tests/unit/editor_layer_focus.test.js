import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import {
  restoreLayerListFocus,
  shouldRestoreLayerListFocus,
} from "../../src/canvas/components/editor_layer_focus.js";
import {
  shortcutTargetContext,
} from "../../src/canvas/editor-shortcut-target.js";

// The test environment is Node (no browser globals).  shortcutTargetContext
// calls isTextEditingTarget which uses `instanceof HTMLElement`.  We shim it
// so tests that reach past the sidebar guard don't explode.
const _origHTMLElement = globalThis.HTMLElement;
beforeAll(() => {
  if (!globalThis.HTMLElement) {
    // A minimal constructor whose `instanceof` always returns false for our
    // plain fake elements — that is the correct answer because none of them
    // are real text-editing targets.
    globalThis.HTMLElement = class HTMLElement {};
  }
});
afterAll(() => {
  if (_origHTMLElement === undefined) delete globalThis.HTMLElement;
  else globalThis.HTMLElement = _origHTMLElement;
});

function fixture({ active = null, inside = false } = {}) {
  const body = { tag: "BODY" };
  const list = {
    ownerDocument: { body, activeElement: active },
    contains: vi.fn(() => inside),
    focus: vi.fn(),
  };
  return { body, list, ref: { current: list } };
}

// ---------------------------------------------------------------------------
// Minimal DOM helpers for shortcutTargetContext tests
// ---------------------------------------------------------------------------

/**
 * Build a minimal fake DOM element that supports `closest()` by walking up
 * a manually specified ancestor chain.
 *
 * @param {string} selector - CSS attribute selector to report (e.g. `[data-testid="editor-properties-panel"]`)
 * @param {object} overrides - extra properties merged onto the element
 */
function fakeElement(selector = "", overrides = {}) {
  // For closest() we need to know which selectors the element (or its
  // ancestors) match.  We use a simple "matches a fixed list" approach
  // that covers all the selectors the guard actually checks.
  const matchedSelectors = selector ? [selector] : [];

  const el = {
    tagName: "DIV",
    isContentEditable: false,
    type: undefined,
    closest(sel) {
      // Normalise the selector list that the production code passes as a
      // single comma-separated string into individual parts.
      const parts = sel.split(",").map((s) => s.trim());
      return parts.some((part) => matchedSelectors.includes(part)) ? el : null;
    },
    ...overrides,
  };
  return el;
}

/**
 * Minimal shortcutTargetContext context.  Only the fields inspected by the
 * guard under test need to be present.
 */
function fakeContext(extra = {}) {
  return {
    engine: { getTool: () => "select", getSelected: () => null },
    toolRef: { current: "select" },
    modalOpen: false,
    currentCanvasType: "2d",
    onTool: vi.fn(),
    opacityDigitTimerRef: { current: { time: 0, firstDigit: null } },
    pressedFamilyCodeRef: { current: null },
    mousePosRef: { current: { x: 0, y: 0 } },
    lastToolRef: { current: null },
    ...extra,
  };
}

/**
 * Build a minimal KeyboardEvent-like object.
 */
function fakeKeyEvent({ code = "KeyV", key = "v", ctrlKey = false, metaKey = false, altKey = false, shiftKey = false, target = null } = {}) {
  return { code, key, ctrlKey, metaKey, altKey, shiftKey, isComposing: false, repeat: false, target: target ?? fakeElement(), preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() };
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

// ---------------------------------------------------------------------------
// Sidebar single-key shortcut guard  (the focus-race fix)
// ---------------------------------------------------------------------------

describe("shortcutTargetContext — sidebar shortcut guard", () => {
  it("blocks tool key V when target is inside the properties panel", () => {
    const target = fakeElement("[data-testid='editor-properties-panel']");
    const event = fakeKeyEvent({ code: "KeyV", key: "v", target });
    const ctx = shortcutTargetContext(event, fakeContext());
    expect(ctx).toBeNull();
  });

  it("blocks tool key R when target is inside the layers panel", () => {
    const target = fakeElement("[data-testid='editor-layers-panel']");
    const event = fakeKeyEvent({ code: "KeyR", key: "r", target });
    const ctx = shortcutTargetContext(event, fakeContext());
    expect(ctx).toBeNull();
  });

  it("blocks digit opacity key '5' when target is inside an aside sidebar", () => {
    const target = fakeElement("aside");
    const event = fakeKeyEvent({ code: "Digit5", key: "5", target });
    const ctx = shortcutTargetContext(event, fakeContext());
    expect(ctx).toBeNull();
  });

  it("blocks color-swap key X when target is inside an inspector control", () => {
    const target = fakeElement("[data-inspector-control]");
    const event = fakeKeyEvent({ code: "KeyX", key: "x", target });
    const ctx = shortcutTargetContext(event, fakeContext());
    expect(ctx).toBeNull();
  });

  it("blocks key E (eraser) when target is inside the layers list", () => {
    const target = fakeElement("[data-layers-list]");
    const event = fakeKeyEvent({ code: "KeyE", key: "e", target });
    const ctx = shortcutTargetContext(event, fakeContext());
    expect(ctx).toBeNull();
  });

  it("ALLOWS Ctrl+Z (undo) even when target is inside the properties panel", () => {
    const target = fakeElement("[data-testid='editor-properties-panel']");
    // Ctrl+Z is a combo key — it must pass through (shortcutTargetContext
    // returns a non-null context so the undo handler can fire).
    const event = fakeKeyEvent({ code: "KeyZ", key: "z", ctrlKey: true, target });
    // shortcutTargetContext returns non-null for Ctrl+Z because
    // isSidebarSingleKeyEvent() returns false when ctrlKey is set.
    const ctx = shortcutTargetContext(event, fakeContext());
    expect(ctx).not.toBeNull();
  });

  it("ALLOWS Cmd+Z (undo) on macOS even inside the layers panel", () => {
    const target = fakeElement("[data-testid='editor-layers-panel']");
    const event = fakeKeyEvent({ code: "KeyZ", key: "z", metaKey: true, target });
    const ctx = shortcutTargetContext(event, fakeContext());
    expect(ctx).not.toBeNull();
  });

  it("ALLOWS tool keys when target is on the canvas (not in a sidebar)", () => {
    // A target element that does not match any sidebar selector.
    const target = fakeElement(""); // no sidebar ancestor
    const event = fakeKeyEvent({ code: "KeyV", key: "v", target });
    // The guard should not block it; shortcutTargetContext returns a context
    // object (not null) so tool switching can proceed.
    const ctx = shortcutTargetContext(event, fakeContext());
    // It may return null for other reasons (text target, non-text control…)
    // but NOT because of the sidebar guard.  With a bare element the only
    // block is shortcutBlockedByTarget; for a plain div that returns false.
    expect(ctx).not.toBeNull();
  });

  it("blocks opacity digit '0' in the agent-panel sidebar", () => {
    const target = fakeElement("[data-testid='agent-panel']");
    const event = fakeKeyEvent({ code: "Digit0", key: "0", target });
    const ctx = shortcutTargetContext(event, fakeContext());
    expect(ctx).toBeNull();
  });

  it("ALLOWS Escape inside the properties panel (native key, not in SINGLE_CHAR set)", () => {
    // Escape is NOT in SINGLE_CHAR_CANVAS_KEYS, so the sidebar guard does not
    // block it; it must flow to the natural Escape handling.
    const target = fakeElement("[data-testid='editor-properties-panel']");
    const event = fakeKeyEvent({ code: "Escape", key: "Escape", target });
    // The guard should return non-null (not blocked by sidebar check).
    // (hasVisibleEscapeSurface may also run, but with our fake target it returns false.)
    const ctx = shortcutTargetContext(event, fakeContext());
    expect(ctx).not.toBeNull();
  });
});
