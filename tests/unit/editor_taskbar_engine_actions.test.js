import { describe, it, expect, vi } from "vitest";
import {
  clearActivePixelSelection,
  finishPenPathEditing,
  toggleNodeLock,
} from "../../src/canvas/components/editor_taskbar_actions.js";

describe("toggleNodeLock", () => {
  it("calls engine.toggleLockNode with the node id", () => {
    const engine = { toggleLockNode: vi.fn(), getDoc: () => ({ nodes: [] }) };
    expect(toggleNodeLock(engine, { id: "node-1" })).toBe(true);
    expect(engine.toggleLockNode).toHaveBeenCalledWith("node-1");
  });

  it("returns false when the node has no id", () => {
    const engine = { toggleLockNode: vi.fn(), getDoc: () => ({ nodes: [] }) };
    expect(toggleNodeLock(engine, null)).toBe(false);
    expect(toggleNodeLock(engine, {})).toBe(false);
    expect(engine.toggleLockNode).not.toHaveBeenCalled();
  });

  it("returns false when the engine lacks toggleLockNode", () => {
    expect(toggleNodeLock({ toggleLock: vi.fn() }, { id: "n" })).toBe(false);
    expect(toggleNodeLock(undefined, { id: "n" })).toBe(false);
  });

  it("returns false when node is locked by group", () => {
    const lockedParent = { id: "group-1", locked: true, parentId: null, kind: "group" };
    const node = { id: "node-1", parentId: "group-1" };
    const doc = { nodes: [lockedParent, node] };
    const engine = {
      toggleLockNode: vi.fn(),
      getDoc: () => doc,
    };
    expect(toggleNodeLock(engine, node)).toBe(false);
    expect(engine.toggleLockNode).not.toHaveBeenCalled();
  });

  it("returns false when node itself is locked", () => {
    const node = { id: "node-1", locked: true };
    const doc = { nodes: [node] };
    const engine = {
      toggleLockNode: vi.fn(),
      getDoc: () => doc,
    };
    expect(toggleNodeLock(engine, node)).toBe(false);
    expect(engine.toggleLockNode).not.toHaveBeenCalled();
  });
});

describe("clearActivePixelSelection", () => {
  it("calls engine.clearPixelSelection", () => {
    const engine = { clearPixelSelection: vi.fn() };
    expect(clearActivePixelSelection(engine)).toBe(true);
    expect(engine.clearPixelSelection).toHaveBeenCalledTimes(1);
  });

  it("returns false for a missing engine or missing method", () => {
    expect(clearActivePixelSelection({ clearSelection: vi.fn() })).toBe(false);
    expect(clearActivePixelSelection(null)).toBe(false);
  });
});

describe("finishPenPathEditing", () => {
  it("closes path editing with endEdit when isEditing is true", () => {
    const engine = {
      getPenDraft: () => ({ anchors: [] }),
      finishPen: vi.fn(),
      isEditing: () => true,
      endEdit: vi.fn(),
    };
    expect(finishPenPathEditing(engine)).toBe(true);
    expect(engine.endEdit).toHaveBeenCalledTimes(1);
    expect(engine.finishPen).not.toHaveBeenCalled();
  });

  it("commits an in-progress draft with finishPen when not editing but has draft", () => {
    const engine = {
      getPenDraft: () => ({ anchors: [] }),
      finishPen: vi.fn(),
      isEditing: () => false,
      endEdit: vi.fn(),
    };
    expect(finishPenPathEditing(engine)).toBe(true);
    expect(engine.finishPen).toHaveBeenCalledTimes(1);
    expect(engine.endEdit).not.toHaveBeenCalled();
  });

  it("returns false when the pen is idle", () => {
    const engine = {
      getPenDraft: () => null,
      isEditing: () => false,
      finishPen: vi.fn(),
      endEdit: vi.fn(),
    };
    expect(finishPenPathEditing(engine)).toBe(false);
    expect(engine.finishPen).not.toHaveBeenCalled();
    expect(engine.endEdit).not.toHaveBeenCalled();
  });

  it("returns false for a missing engine", () => {
    expect(finishPenPathEditing(undefined)).toBe(false);
    expect(finishPenPathEditing({ finishPenPath: vi.fn() })).toBe(false);
  });

  it("returns false when engine lacks required methods", () => {
    const engine = {
      getPenDraft: () => ({ anchors: [] }),
      isEditing: () => true,
    };
    expect(finishPenPathEditing(engine)).toBe(false);
  });
});