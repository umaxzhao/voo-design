// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ subscriptions: [], updates: 0 }));
// Exercise the hook's external-store contract without a browser renderer.
vi.mock("react", () => ({
  useCallback: (callback) => callback,
  useSyncExternalStore: (subscribe, getSnapshot) => {
    let snapshot = getSnapshot();
    harness.subscriptions.push(subscribe(() => {
      const next = getSnapshot();
      if (!Object.is(snapshot, next)) {
        snapshot = next;
        harness.updates += 1;
      }
    }));
    return snapshot;
  },
}));
vi.mock("../../src/store/design_store.js", () => ({
  useDesignStore: Object.assign(
    (selector) => selector({ undoStack: [], redoStack: [] }),
    { getState: () => ({ undoStack: [], redoStack: [] }) },
  ),
}));

import { usePresentationHistory } from "../../src/canvas/components/presentation/use_presentation_history.js";
import { createHistory } from "../../src/canvas/editor/editor_history.js";

function mount(engine) {
  const result = usePresentationHistory(null, engine);
  const unsubscribe = harness.subscriptions.pop();
  expect(unsubscribe).toBeTypeOf("function");
  return { result, unsubscribe };
}

afterEach(() => {
  for (const unsubscribe of harness.subscriptions.splice(0)) unsubscribe();
  harness.updates = 0;
});

describe("toolbar history subscription", () => {
  it("updates after the first edit, undo, redo and reset without a parent render", () => {
    const history = createHistory();
    history.reset("empty");
    const listeners = new Set();
    const engine = {
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      subscribeRender(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const emit = () => listeners.forEach((listener) => listener());
    const mounted = mount(engine);
    expect(mounted.result).toMatchObject({ canUndo: false, canRedo: false });

    for (const [change, expected] of [
      [() => history.push("rectangle"), { canUndo: true, canRedo: false }],
      [() => history.undo(), { canUndo: false, canRedo: true }],
      [() => history.redo(), { canUndo: true, canRedo: false }],
      [() => history.reset("empty"), { canUndo: false, canRedo: false }],
    ]) {
      const previousUpdates = harness.updates;
      change();
      emit();
      expect(harness.updates).toBe(previousUpdates + 1);
      const current = mount(engine);
      expect(current.result).toMatchObject(expected);
      current.unsubscribe();
      emit();
      expect(harness.updates).toBe(previousUpdates + 1);
    }
    mounted.unsubscribe();
    expect(listeners.size).toBe(0);
    history.push("another rectangle");
    emit();
    expect(harness.updates).toBe(4);
  });

  it("supports a missing engine during mount or teardown", () => {
    const mounted = mount(null);
    expect(mounted.result).toMatchObject({ canUndo: false, canRedo: false });
    expect(() => mounted.unsubscribe()).not.toThrow();
  });
});
