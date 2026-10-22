import { describe, it, expect, vi } from "vitest";
import {
  clearActivePixelSelection,
  finishPenPathEditing,
  toggleNodeLock,
} from "../../src/canvas/components/editor_taskbar_actions.js";

describe("toggleNodeLock", () => {
  it("calls engine.toggleLockNode with the node id", () => {
    const engine = { toggleLockNode: vi.fn() };
    expect(toggleNodeLock(engine, { id: "node-1" })).toBe(true);
    expect(engine.toggleLockNode).toHaveBeenCalledWith("node-1");
  });

  it("is a no-op report when the node has no id", () => {
    const engine = { toggleLockNode: vi.fn() };
    expect(toggleNodeLock(engine, null)).toBe(false);
    expect(toggleNodeLock(engine, {})).toBe(false);
    expect(engine.toggleLockNode).not.toHaveBeenCalled();
  });

  it("does not throw when the engine lacks toggleLockNode", () => {
    // The pre-fix bug: engine.toggleLock does not exist, and the old
    // `engine?.toggleLock?.(id)` call silently did nothing.
    expect(toggleNodeLock({ toggleLock: vi.fn() }, { id: "n" })).toBe(false);
    expect(toggleNodeLock(undefined, { id: "n" })).toBe(false);
  });
});

describe("clearActivePixelSelection", () => {
  it("calls engine.clearPixelSelection", () => {
    const engine = { clearPixelSelection: vi.fn() };
    expect(clearActivePixelSelection(engine)).toBe(true);
    expect(engine.clearPixelSelection).toHaveBeenCalledTimes(1);
  });

  it("reports false for a missing engine or missing method", () => {
    // The pre-fix bug: engine.clearSelection does not exist.
    expect(clearActivePixelSelection({ clearSelection: vi.fn() })).toBe(false);
    expect(clearActivePixelSelection(null)).toBe(false);
  });
});

describe("finishPenPathEditing", () => {
  it("commits an in-progress draft with finishPen", () => {
    const engine = {
      getPenDraft: () => ({ anchors: [] }),
      finishPen: vi.fn(),
      isEditing: () => true,
      endEdit: vi.fn(),
    };
    expect(finishPenPathEditing(engine)).toBe("finishPen");
    expect(engine.finishPen).toHaveBeenCalledTimes(1);
    expect(engine.endEdit).not.toHaveBeenCalled();
  });

  it("closes path editing with endEdit when there is no draft", () => {
    const engine = {
      getPenDraft: () => null,
      finishPen: vi.fn(),
      isEditing: () => true,
      endEdit: vi.fn(),
    };
    expect(finishPenPathEditing(engine)).toBe("endEdit");
    expect(engine.endEdit).toHaveBeenCalledTimes(1);
    expect(engine.finishPen).not.toHaveBeenCalled();
  });

  it("returns null when the pen is idle", () => {
    const engine = {
      getPenDraft: () => null,
      isEditing: () => false,
      finishPen: vi.fn(),
      endEdit: vi.fn(),
    };
    expect(finishPenPathEditing(engine)).toBe(null);
    expect(engine.finishPen).not.toHaveBeenCalled();
    expect(engine.endEdit).not.toHaveBeenCalled();
  });

  it("does not throw for a missing engine", () => {
    // The pre-fix bug: engine.finishPenPath does not exist.
    expect(finishPenPathEditing(undefined)).toBe(null);
    expect(finishPenPathEditing({ finishPenPath: vi.fn() })).toBe(null);
  });
});
